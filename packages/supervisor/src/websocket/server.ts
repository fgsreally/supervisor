import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { WebSocket, type RawData } from "ws";
import type { SessionManager } from "../core/session-manager.js";
import type { SessionPromptImage } from "../core/session-media.js";
import { decryptApiKey } from "../utils/encrypt.js";
import { formatUnknownError } from "../utils/format-error.js";
import {
  buildDoubaoSpeechWsHeaders,
  doubaoSpeechPresetsToTry,
  normalizeDoubaoSpeechCredential,
  readSupervisorSettings,
  isDoubaoSpeechConfigured,
  resolveDoubaoSpeechPreset,
  writeSupervisorSettings,
  resolveSpeechRecognitionMode,
  type DoubaoSpeechPresetId,
} from "../utils/supervisor-settings.js";
import {
  isLocalSpeechReady,
  LocalAsrSession,
  resolveLocalSpeechModel,
} from "../speech/local-asr.js";

const MAX_AUDIO_FRAME_BYTES = 256 * 1024;
const QWEN_REALTIME_URL =
  "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime";
type SpeechProvider = "local" | "qwen" | "doubao";

interface ClientMessage {
  id?: string;
  channel: "speech" | "system" | "session";
  type: string;
  sessionId?: number | string;
  message?: string;
  images?: SessionPromptImage[];
  payload?: Record<string, unknown>;
}

interface UpstreamEvent {
  type?: string;
  text?: string;
  stash?: string;
  transcript?: string;
  error?: { message?: string };
}

interface DoubaoEvent {
  result?: { text?: string; utterances?: Array<{ definite?: boolean }> };
}

interface ClientSocket {
  send(data: string | Uint8Array): unknown;
}

interface WebSocketRouteBuilder {
  ws(path: string, hooks: Record<string, unknown>): unknown;
}

function sendJson(socket: ClientSocket, message: Record<string, unknown>): void {
  socket.send(JSON.stringify(message));
}

function eventId(): string {
  return `event_${randomUUID()}`;
}

function parseSessionId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

function qwenLanguage(language: unknown): string | undefined {
  if (typeof language !== "string" || !language) return undefined;
  const aliases: Record<string, string> = {
    "zh-CN": "zh",
    "zh-HK": "yue",
    "en-US": "en",
    "ja-JP": "ja",
    "ko-KR": "ko",
  };
  return aliases[language] ?? language.split("-")[0];
}

function doubaoPacket(
  messageType: number,
  flags: number,
  payload: Buffer,
  sequence?: number,
): Buffer {
  const serialMethod = messageType === 1 ? 0x01 : 0x00;
  const compressionType = 0x01;
  const compressed = gzipSync(payload);
  const hasSequence = (flags & 0x01) !== 0 || flags === 0x03;
  const sequenceBytes = hasSequence && sequence !== undefined ? 4 : 0;
  const packet = Buffer.alloc(4 + sequenceBytes + 4 + compressed.length);
  packet[0] = 0x11;
  packet[1] = (messageType << 4) | (flags & 0x0f);
  packet[2] = (serialMethod << 4) | compressionType;
  packet[3] = 0x00;
  let offset = 4;
  if (sequenceBytes) {
    packet.writeInt32BE(sequence!, offset);
    offset += 4;
  }
  packet.writeUInt32BE(compressed.length, offset);
  offset += 4;
  compressed.copy(packet, offset);
  return packet;
}

function parseDoubaoEvent(data: RawData): DoubaoEvent {
  const packet = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  if (packet.length < 8) throw new Error("Doubao speech: response too short");
  const messageType = packet[1]! >> 4;
  const flags = packet[1]! & 0x0f;
  const compression = packet[2]! & 0x0f;
  if (messageType === 0x0f) {
    const messageSize = packet.readUInt32BE(8);
    throw new Error(packet.subarray(12, 12 + messageSize).toString() || "Doubao speech error");
  }
  let offset = 4;
  if (flags & 0x01) offset += 4;
  const payloadSize = packet.readUInt32BE(offset);
  offset += 4;
  let payload = packet.subarray(offset, offset + payloadSize);
  if (compression === 0x01) payload = gunzipSync(payload);
  return JSON.parse(payload.toString("utf8")) as DoubaoEvent;
}

class SpeechConnection {
  private upstream: WebSocket | null = null;
  private localSession: LocalAsrSession | null = null;
  private stopping = false;
  private provider: SpeechProvider = "local";
  private doubaoText = "";
  private localText = "";

  constructor(private readonly client: ClientSocket) {}

  async start(language: unknown): Promise<void> {
    if (this.upstream || this.localSession) throw new Error("speech session is already active");
    const settings = readSupervisorSettings();
    this.provider = resolveSpeechRecognitionMode(settings);
    this.localText = "";
    this.doubaoText = "";

    if (this.provider === "local") {
      const model = resolveLocalSpeechModel(settings.localSpeechModelId);
      if (!isLocalSpeechReady(model.id)) {
        throw new Error(`本地语音模型「${model.name}」尚未安装，请先在设置中安装`);
      }
      this.localSession = new LocalAsrSession(model.id, (text) => {
        this.localText = text;
        sendJson(this.client, {
          channel: "speech",
          type: "speech.partial",
          payload: { text },
        });
      });
      sendJson(this.client, { channel: "speech", type: "speech.ready" });
      return;
    }

    let doubaoAppId = "";
    let doubaoAccessToken = "";
    let qwenApiKey = "";
    if (this.provider === "doubao") {
      if (!isDoubaoSpeechConfigured(settings)) {
        throw new Error("doubao speech App ID or Access Token is not configured");
      }
      doubaoAppId = normalizeDoubaoSpeechCredential(settings.doubaoSpeechAppId ?? "");
      doubaoAccessToken = normalizeDoubaoSpeechCredential(
        decryptApiKey(settings.doubaoSpeechAccessTokenEncrypted!),
      );
      if (!doubaoAccessToken && !doubaoAppId) {
        throw new Error("doubao speech credentials are not configured");
      }
      const candidates = doubaoSpeechPresetsToTry(settings.doubaoSpeechPreset);
      let lastError: Error | null = null;
      for (const presetId of candidates) {
        try {
          await this.connectProvider({
            language,
            qwenApiKey: "",
            doubaoAppId,
            doubaoAccessToken,
            doubaoPresetId: presetId,
          });
          if (presetId !== settings.doubaoSpeechPreset) {
            writeSupervisorSettings({ doubaoSpeechPreset: presetId });
          }
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          this.upstream = null;
        }
      }
      throw (
        lastError ??
        new Error("豆包语音 WebSocket 握手失败，请确认 APP ID 与 Access Token 填写正确")
      );
    }

    if (!settings.speechApiKeyEncrypted) throw new Error("qwen speech API key is not configured");
    qwenApiKey = decryptApiKey(settings.speechApiKeyEncrypted);
    await this.connectProvider({ language, qwenApiKey, doubaoAppId: "", doubaoAccessToken: "" });
  }

  private connectProvider(options: {
    language: unknown;
    qwenApiKey: string;
    doubaoAppId: string;
    doubaoAccessToken: string;
    doubaoPresetId?: DoubaoSpeechPresetId;
  }): Promise<void> {
    const { language, qwenApiKey, doubaoAppId, doubaoAccessToken, doubaoPresetId } = options;
    const doubaoPreset = doubaoPresetId ? resolveDoubaoSpeechPreset(doubaoPresetId) : null;

    return new Promise<void>((resolve, reject) => {
      const upstream = new WebSocket(
        this.provider === "doubao" ? doubaoPreset!.wsUrl : QWEN_REALTIME_URL,
        {
          headers:
            this.provider === "doubao"
              ? buildDoubaoSpeechWsHeaders(
                  doubaoAppId,
                  doubaoAccessToken,
                  doubaoPreset!.resourceId,
                )
              : { Authorization: `Bearer ${qwenApiKey}`, "User-Agent": "pi-supervisor" },
          handshakeTimeout: 15_000,
        },
      );
      this.upstream = upstream;
      let doubaoReady = false;
      let settled = false;
      let connected = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      upstream.once("open", () => {
        if (this.provider === "doubao") {
          // 双向流式不传 language（文档注明仅 nostream 支持）；并开启首字加速
          const payload = Buffer.from(
            JSON.stringify({
              user: { uid: randomUUID() },
              audio: {
                format: "pcm",
                codec: "raw",
                rate: 16000,
                bits: 16,
                channel: 1,
              },
              request: {
                model_name: "bigmodel",
                enable_nonstream: false,
                enable_itn: true,
                enable_punc: true,
                show_utterances: true,
                result_type: "full",
                enable_accelerate_text: true,
                accelerate_score: 15,
                end_window_size: 400,
              },
            }),
          );
          upstream.send(doubaoPacket(1, 0, payload));
          // Match previously working behavior: handshake success is enough to start.
          connected = true;
          sendJson(this.client, { channel: "speech", type: "speech.ready" });
          settle(() => resolve());
        } else {
          upstream.send(
            JSON.stringify({
              event_id: eventId(),
              type: "session.update",
              session: {
                input_audio_format: "pcm",
                sample_rate: 16000,
                input_audio_transcription: { language: qwenLanguage(language) },
                turn_detection: null,
              },
            }),
          );
        }
      });
      upstream.on("message", (data: RawData) => {
        if (this.provider === "doubao") {
          try {
            const event = parseDoubaoEvent(data);
            doubaoReady = true;
            const text = event.result?.text ?? "";
            if (text) this.doubaoText = text;
            sendJson(this.client, {
              channel: "speech",
              type: "speech.partial",
              payload: { text },
            });
          } catch (error) {
            const message = formatUnknownError(error, "豆包语音识别失败");
            this.fail(message);
          }
          return;
        }
        const event = JSON.parse(data.toString()) as UpstreamEvent;
        if (event.type === "session.updated") {
          connected = true;
          sendJson(this.client, { channel: "speech", type: "speech.ready" });
          settle(() => resolve());
        } else {
          this.forwardEvent(event);
        }
      });
      upstream.on("unexpected-response", (_req, res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8").trim();
          let detail = raw;
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { message?: string; error?: string };
              detail = parsed.message ?? parsed.error ?? raw;
            } catch {
              detail = raw.slice(0, 240);
            }
          }
          const message = `${this.provider === "doubao" ? "豆包语音" : "DashScope 语音"}连接被拒绝 (HTTP ${res.statusCode})${detail ? `: ${detail}` : ""}${this.provider === "doubao" ? "。请确认 APP ID / Access Token，以及控制台已开通流式语音识别" : ""}`;
          try {
            upstream.terminate();
          } catch {
            /* ignore */
          }
          settle(() => reject(new Error(message)));
        });
      });
      upstream.on("error", (error) => {
        let message = formatUnknownError(error, "语音服务连接失败");
        if (this.provider === "doubao") {
          const statusMatch = message.match(/Unexpected server response:\s*(\d+)/i);
          if (statusMatch) {
            message = `豆包语音 WebSocket 握手失败 (HTTP ${statusMatch[1]})。请确认 APP ID / Access Token，以及控制台已开通流式语音识别`;
          } else if (/101|unexpected server response/i.test(message)) {
            message =
              "豆包语音 WebSocket 握手失败。请确认 APP ID / Access Token，以及控制台已开通流式语音识别";
          }
        }
        try {
          upstream.terminate();
        } catch {
          /* ignore */
        }
        settle(() => reject(new Error(message)));
      });
      upstream.on("close", () => {
        if (!settled) {
          settle(() => reject(new Error("speech provider connection closed")));
        } else if (connected && !this.stopping) {
          this.fail("speech provider connection closed");
        }
        if (this.upstream === upstream) this.upstream = null;
      });
    });
  }

  append(data: RawData): void {
    const audio = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (audio.byteLength > MAX_AUDIO_FRAME_BYTES) throw new Error("audio frame is too large");
    if (this.provider === "local") {
      if (!this.localSession) throw new Error("speech session is not ready");
      this.localSession.append(audio);
      return;
    }
    if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) {
      throw new Error("speech session is not ready");
    }
    if (this.provider === "doubao") {
      // 大模型流式 ASR：flags=0，由服务端自增 sequence；勿混用 flags=1 客户端序号
      this.upstream.send(doubaoPacket(2, 0, audio));
    } else {
      this.upstream.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          event_id: eventId(),
          audio: audio.toString("base64"),
        }),
      );
    }
  }

  stop(): void {
    this.stopping = true;
    if (this.provider === "local") {
      const text = this.localSession?.finish() ?? this.localText;
      this.localSession = null;
      if (text) {
        sendJson(this.client, {
          channel: "speech",
          type: "speech.final",
          payload: { text },
        });
      }
      sendJson(this.client, { channel: "speech", type: "speech.stopped" });
      return;
    }
    if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) return;
    if (this.provider === "doubao") {
      // flags=0x02：最后一包，不带客户端 sequence（与官方 message flow 一致）
      this.upstream.send(doubaoPacket(2, 0x02, Buffer.alloc(0)));
      setTimeout(() => {
        if (this.doubaoText) {
          sendJson(this.client, {
            channel: "speech",
            type: "speech.final",
            payload: { text: this.doubaoText },
          });
        }
        sendJson(this.client, { channel: "speech", type: "speech.stopped" });
        this.upstream?.close();
      }, 800);
    } else {
      this.upstream.send(
        JSON.stringify({ type: "input_audio_buffer.commit", event_id: eventId() }),
      );
      this.upstream.send(JSON.stringify({ type: "session.finish", event_id: eventId() }));
    }
  }

  close(): void {
    this.stopping = true;
    this.localSession = null;
    this.upstream?.close();
    this.upstream = null;
  }

  private forwardEvent(event: UpstreamEvent): void {
    switch (event.type) {
      case "conversation.item.input_audio_transcription.text":
        sendJson(this.client, {
          channel: "speech",
          type: "speech.partial",
          payload: { text: `${event.text ?? ""}${event.stash ?? ""}` },
        });
        break;
      case "conversation.item.input_audio_transcription.completed":
        sendJson(this.client, {
          channel: "speech",
          type: "speech.final",
          payload: { text: event.transcript ?? "" },
        });
        break;
      case "session.finished":
        sendJson(this.client, { channel: "speech", type: "speech.stopped" });
        this.upstream?.close();
        break;
      case "error":
      case "conversation.item.input_audio_transcription.failed":
        this.fail(event.error?.message ?? "speech recognition failed");
        break;
    }
  }

  private fail(message: string): void {
    sendJson(this.client, { channel: "speech", type: "speech.error", payload: { message } });
  }
}

interface SocketSessionState {
  speech: SpeechConnection;
  unsubscribe: (() => void) | null;
  subscribedSessionId: number | null;
}

function handleSessionMessage(
  socket: ClientSocket,
  state: SocketSessionState,
  manager: SessionManager | undefined,
  message: ClientMessage,
): void {
  if (!manager) {
    sendJson(socket, {
      channel: "session",
      type: "error",
      error: "session channel is unavailable",
    });
    return;
  }

  if (message.type === "subscribe") {
    const sessionId = parseSessionId(message.sessionId ?? message.payload?.sessionId);
    if (sessionId === null) {
      sendJson(socket, { channel: "session", type: "error", error: "invalid sessionId" });
      return;
    }
    state.unsubscribe?.();
    state.subscribedSessionId = sessionId;
    state.unsubscribe = manager.onOutput(sessionId, (_id, event) => {
      sendJson(socket, { channel: "session", type: "agent", event });
    });
    sendJson(socket, { channel: "session", type: "connected", sessionId });
    return;
  }

  if (message.type === "unsubscribe") {
    state.unsubscribe?.();
    state.unsubscribe = null;
    state.subscribedSessionId = null;
    return;
  }

  if (message.type === "prompt") {
    const sessionId = parseSessionId(message.sessionId ?? message.payload?.sessionId);
    const text =
      typeof message.message === "string"
        ? message.message
        : typeof message.payload?.message === "string"
          ? message.payload.message
          : null;
    if (sessionId === null || text === null) {
      sendJson(socket, {
        id: message.id,
        channel: "session",
        type: "error",
        error: "invalid prompt, requires sessionId and message",
      });
      return;
    }

    const images = Array.isArray(message.images)
      ? message.images
      : Array.isArray(message.payload?.images)
        ? (message.payload.images as SessionPromptImage[])
        : undefined;

    let promptUnsub = () => {};
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      promptUnsub();
    };

    promptUnsub = manager.onOutput(sessionId, (_id, event) => {
      sendJson(socket, { id: message.id, channel: "session", type: "event", event });
      if (event.type === "agent_end") {
        sendJson(socket, { id: message.id, channel: "session", type: "done" });
        finish();
      }
    });

    sendJson(socket, { id: message.id, channel: "session", type: "started", sessionId });
    void manager
      .submitSessionInput(sessionId, { message: text, images })
      .then((disposition) => {
        if (disposition === "queued") {
          sendJson(socket, { id: message.id, channel: "session", type: "queued", sessionId });
          finish();
          return;
        }
        if (!finished) {
          sendJson(socket, { id: message.id, channel: "session", type: "done" });
          finish();
        }
      })
      .catch((error: unknown) => {
        sendJson(socket, {
          id: message.id,
          channel: "session",
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        finish();
      });
    return;
  }

  sendJson(socket, {
    channel: "session",
    type: "error",
    error: `unknown session message type: ${message.type}`,
  });
}

export function registerWebSocketRoutes(
  app: WebSocketRouteBuilder,
  password?: string,
  manager?: SessionManager,
): void {
  const connections = new WeakMap<object, SocketSessionState>();
  app.ws("/ws", {
    maxPayloadLength: MAX_AUDIO_FRAME_BYTES,
    beforeHandle(context: { query?: Record<string, string | undefined> }) {
      if (password && context.query?.password !== password) {
        return new Response("Unauthorized", { status: 401 });
      }
    },
    open(socket: ClientSocket & { raw: object }) {
      connections.set(socket.raw, {
        speech: new SpeechConnection(socket),
        unsubscribe: null,
        subscribedSessionId: null,
      });
      sendJson(socket, { channel: "system", type: "system.ready" });
    },
    message(socket: ClientSocket & { raw: object }, data: unknown) {
      const state = connections.get(socket.raw);
      if (!state) return;
      try {
        if (Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
          state.speech.append(Buffer.from(data as ArrayBuffer));
          return;
        }
        const message = (typeof data === "string" ? JSON.parse(data) : data) as ClientMessage;
        if (message.channel === "system" && message.type === "ping") {
          sendJson(socket, { id: message.id, channel: "system", type: "pong" });
        } else if (message.channel === "speech" && message.type === "speech.start") {
          void state.speech.start(message.payload?.language).catch((error: unknown) => {
            sendJson(socket, {
              id: message.id,
              channel: "speech",
              type: "speech.error",
              payload: { message: error instanceof Error ? error.message : String(error) },
            });
          });
        } else if (message.channel === "speech" && message.type === "speech.stop") {
          state.speech.stop();
        } else if (message.channel === "session") {
          handleSessionMessage(socket, state, manager, message);
        }
      } catch (error) {
        sendJson(socket, {
          channel: "system",
          type: "system.error",
          payload: { message: error instanceof Error ? error.message : String(error) },
        });
      }
    },
    close(socket: ClientSocket & { raw: object }) {
      const state = connections.get(socket.raw);
      state?.speech.close();
      state?.unsubscribe?.();
      connections.delete(socket.raw);
    },
  });
}
