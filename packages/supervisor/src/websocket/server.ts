import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { WebSocket, type RawData } from "ws";
import type { SessionManager } from "../core/session/session-manager.js";
import type { SessionPromptImage } from "../core/session/session-media.js";
import type { SessionPromptAttachment } from "../core/session/session-pasted-text.js";
import {
  buildPreviewUpstreamUrl,
  resolveSessionPreviewTarget,
} from "../core/session/session-preview-proxy.js";
import { decryptApiKey } from "../utils/encrypt.js";
import { formatUnknownError } from "../utils/format-error.js";
import {
  createOutboundWebSocket,
  formatOutboundHandshakeError,
  isOutboundSocketOpen,
  type OutboundWebSocket,
} from "../utils/outbound-ws.js";
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
  channel: "speech" | "system" | "session" | "agent";
  type: string;
  sessionId?: number | string;
  message?: string;
  images?: SessionPromptImage[];
  pastedTexts?: Array<{ id: string; text: string }>;
  attachments?: SessionPromptAttachment[];
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
  message?: string;
  result?:
    | string
    | { text?: string; utterances?: Array<{ definite?: boolean; text?: string }> }
    | Array<{ text?: string; utterances?: Array<{ definite?: boolean; text?: string }> }>;
  text?: string;
}

const DOUBAO_MSG_FULL_REQUEST = 0x01;
const DOUBAO_MSG_AUDIO_ONLY = 0x02;
const DOUBAO_MSG_FULL_RESPONSE = 0x09;
const DOUBAO_MSG_ERROR = 0x0f;
const DOUBAO_FLAG_POS_SEQUENCE = 0x01;
const DOUBAO_FLAG_NEG_WITH_SEQUENCE = 0x03;
const DOUBAO_SERIAL_JSON = 0x01;
const DOUBAO_SERIAL_NONE = 0x00;
const DOUBAO_COMPRESSION_GZIP = 0x01;

interface ClientSocket {
  send(data: string | Uint8Array): unknown;
  close(code?: number, reason?: string): unknown;
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
  sequence: number,
): Buffer {
  const serialMethod =
    messageType === DOUBAO_MSG_FULL_REQUEST ? DOUBAO_SERIAL_JSON : DOUBAO_SERIAL_NONE;
  const compressed = gzipSync(payload);
  const packet = Buffer.alloc(12 + compressed.length);
  packet[0] = 0x11;
  packet[1] = (messageType << 4) | (flags & 0x0f);
  packet[2] = (serialMethod << 4) | DOUBAO_COMPRESSION_GZIP;
  packet[3] = 0x00;
  packet.writeInt32BE(sequence, 4);
  packet.writeUInt32BE(compressed.length, 8);
  compressed.copy(packet, 12);
  return packet;
}

function doubaoResultText(event: DoubaoEvent | null): string {
  if (!event) return "";
  const result = event.result;
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    const last = result[result.length - 1];
    return last?.text ?? "";
  }
  if (result && typeof result === "object" && typeof result.text === "string") return result.text;
  return typeof event.text === "string" ? event.text : "";
}

function parseDoubaoEvent(data: RawData): { text: string; isLast: boolean } {
  const packet = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  if (packet.length < 4) throw new Error("Doubao speech: response too short");
  const headerSize = (packet[0]! & 0x0f) * 4;
  const messageType = packet[1]! >> 4;
  const flags = packet[1]! & 0x0f;
  const serialization = packet[2]! >> 4;
  const compression = packet[2]! & 0x0f;
  let payload = packet.subarray(Math.max(headerSize, 4));

  if (flags & 0x01) {
    if (payload.length < 4) throw new Error("Doubao speech: missing sequence");
    payload = payload.subarray(4);
  }
  const isLast = (flags & 0x02) !== 0;
  if (flags & 0x04) {
    if (payload.length < 4) throw new Error("Doubao speech: missing event");
    payload = payload.subarray(4);
  }

  let code = 0;
  if (messageType === DOUBAO_MSG_ERROR) {
    if (payload.length < 8) throw new Error("豆包语音识别失败");
    code = payload.readInt32BE(0);
    const size = payload.readUInt32BE(4);
    payload = payload.subarray(8, 8 + size);
  } else if (messageType === DOUBAO_MSG_FULL_RESPONSE) {
    if (payload.length < 4) return { text: "", isLast };
    const size = payload.readUInt32BE(0);
    payload = payload.subarray(4, 4 + size);
  }

  if (compression === DOUBAO_COMPRESSION_GZIP && payload.length > 0) {
    payload = gunzipSync(payload);
  }

  let parsed: DoubaoEvent | null = null;
  if (serialization === DOUBAO_SERIAL_JSON && payload.length > 0) {
    parsed = JSON.parse(payload.toString("utf8")) as DoubaoEvent;
  }

  if (messageType === DOUBAO_MSG_ERROR || code !== 0) {
    const detail =
      parsed?.message ||
      (payload.length ? payload.toString("utf8") : "") ||
      `Doubao speech error ${code}`;
    throw new Error(detail);
  }

  return { text: doubaoResultText(parsed), isLast };
}

class SpeechConnection {
  private upstream: OutboundWebSocket | null = null;
  private localSession: LocalAsrSession | null = null;
  private stopping = false;
  private provider: SpeechProvider = "local";
  private doubaoText = "";
  private doubaoSeq = 1;
  private localText = "";
  private doubaoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private doubaoFinished = false;

  constructor(private readonly client: ClientSocket) {}

  async start(language: unknown): Promise<void> {
    if (this.upstream || this.localSession) throw new Error("speech session is already active");
    const settings = readSupervisorSettings();
    this.provider = resolveSpeechRecognitionMode(settings);
    this.localText = "";
    this.doubaoText = "";
    this.doubaoSeq = 1;
    this.doubaoFinished = false;
    if (this.doubaoStopTimer) {
      clearTimeout(this.doubaoStopTimer);
      this.doubaoStopTimer = null;
    }

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

    let doubaoApiKey = "";
    let qwenApiKey = "";
    if (this.provider === "doubao") {
      if (!isDoubaoSpeechConfigured(settings)) {
        throw new Error("doubao speech API Key is not configured");
      }
      doubaoApiKey = normalizeDoubaoSpeechCredential(
        decryptApiKey(settings.doubaoSpeechApiKeyEncrypted!),
      );
      if (!doubaoApiKey) throw new Error("doubao speech API Key is not configured");
      const candidates = doubaoSpeechPresetsToTry(settings.doubaoSpeechPreset);
      let lastError: Error | null = null;
      for (const presetId of candidates) {
        try {
          await this.connectProvider({
            language,
            qwenApiKey: "",
            doubaoApiKey,
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
      throw lastError ?? new Error("豆包语音 WebSocket 握手失败，请确认 API Key 填写正确");
    }

    if (!settings.speechApiKeyEncrypted) throw new Error("qwen speech API key is not configured");
    qwenApiKey = decryptApiKey(settings.speechApiKeyEncrypted);
    await this.connectProvider({ language, qwenApiKey, doubaoApiKey: "" });
  }

  private connectProvider(options: {
    language: unknown;
    qwenApiKey: string;
    doubaoApiKey: string;
    doubaoPresetId?: DoubaoSpeechPresetId;
  }): Promise<void> {
    const { language, qwenApiKey, doubaoApiKey, doubaoPresetId } = options;
    const doubaoPreset = doubaoPresetId ? resolveDoubaoSpeechPreset(doubaoPresetId) : null;

    return new Promise<void>((resolve, reject) => {
      const headers =
        this.provider === "doubao"
          ? buildDoubaoSpeechWsHeaders(doubaoApiKey, doubaoPreset!.resourceId)
          : { Authorization: `Bearer ${qwenApiKey}`, "User-Agent": "pi-supervisor" };
      const upstream = createOutboundWebSocket(
        this.provider === "doubao" ? doubaoPreset!.wsUrl : QWEN_REALTIME_URL,
        headers,
        15_000,
      );
      this.upstream = upstream;
      let settled = false;
      let connected = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      const failHandshake = (error: unknown) => {
        const message =
          this.provider === "doubao"
            ? formatOutboundHandshakeError(
                error,
                "豆包语音",
                "请确认 API Key，以及控制台已开通流式语音识别",
              )
            : formatOutboundHandshakeError(error, "DashScope 语音", "请确认 API Key 是否有效");
        try {
          upstream.terminate();
        } catch {
          /* ignore */
        }
        settle(() => reject(new Error(message)));
      };
      const markDoubaoReady = () => {
        if (connected) return;
        connected = true;
        sendJson(this.client, { channel: "speech", type: "speech.ready" });
        settle(() => resolve());
      };
      upstream.on("error", failHandshake);
      upstream.once("open", () => {
        if (this.provider === "doubao") {
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
                enable_itn: true,
                enable_punc: true,
                enable_ddc: true,
                show_utterances: true,
                enable_nonstream: true,
                result_type: "full",
                enable_accelerate_text: true,
                accelerate_score: 15,
                end_window_size: 800,
              },
            }),
          );
          this.doubaoSeq = 1;
          upstream.send(
            doubaoPacket(
              DOUBAO_MSG_FULL_REQUEST,
              DOUBAO_FLAG_POS_SEQUENCE,
              payload,
              this.doubaoSeq,
            ),
          );
          this.doubaoSeq += 1;
          // 官方会先回 full-request 确认包；若迟迟不回，仍放行以免堵死麦克风。
          setTimeout(() => {
            if (this.upstream === upstream && !this.stopping) markDoubaoReady();
          }, 1500);
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
      upstream.on("message", (data) => {
        if (this.provider === "doubao") {
          try {
            const event = parseDoubaoEvent(data as RawData);
            markDoubaoReady();
            if (event.text) {
              this.doubaoText = event.text;
              sendJson(this.client, {
                channel: "speech",
                type: "speech.partial",
                payload: { text: event.text },
              });
            }
            if (event.isLast && this.stopping) this.finishDoubao();
          } catch (error) {
            const message = formatUnknownError(error, "豆包语音识别失败");
            this.fail(message);
          }
          return;
        }
        const event = JSON.parse(String(data)) as UpstreamEvent;
        if (event.type === "session.updated") {
          connected = true;
          sendJson(this.client, { channel: "speech", type: "speech.ready" });
          settle(() => resolve());
        } else {
          this.forwardEvent(event);
        }
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
    if (!this.upstream || !isOutboundSocketOpen(this.upstream)) {
      throw new Error("speech session is not ready");
    }
    if (this.provider === "doubao") {
      this.upstream.send(
        doubaoPacket(DOUBAO_MSG_AUDIO_ONLY, DOUBAO_FLAG_POS_SEQUENCE, audio, this.doubaoSeq),
      );
      this.doubaoSeq += 1;
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
    if (!this.upstream || !isOutboundSocketOpen(this.upstream)) return;
    if (this.provider === "doubao") {
      this.upstream.send(
        doubaoPacket(
          DOUBAO_MSG_AUDIO_ONLY,
          DOUBAO_FLAG_NEG_WITH_SEQUENCE,
          Buffer.alloc(0),
          -this.doubaoSeq,
        ),
      );
      this.doubaoStopTimer = setTimeout(() => this.finishDoubao(), 1500);
    } else {
      this.upstream.send(
        JSON.stringify({ type: "input_audio_buffer.commit", event_id: eventId() }),
      );
      this.upstream.send(JSON.stringify({ type: "session.finish", event_id: eventId() }));
    }
  }

  close(): void {
    this.stopping = true;
    if (this.doubaoStopTimer) {
      clearTimeout(this.doubaoStopTimer);
      this.doubaoStopTimer = null;
    }
    this.localSession = null;
    this.upstream?.close();
    this.upstream = null;
  }

  private finishDoubao(): void {
    if (this.doubaoFinished) return;
    this.doubaoFinished = true;
    if (this.doubaoStopTimer) {
      clearTimeout(this.doubaoStopTimer);
      this.doubaoStopTimer = null;
    }
    if (this.doubaoText) {
      sendJson(this.client, {
        channel: "speech",
        type: "speech.final",
        payload: { text: this.doubaoText },
      });
    }
    sendJson(this.client, { channel: "speech", type: "speech.stopped" });
    this.upstream?.close();
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
    let text = message;
    try {
      const parsed = JSON.parse(message) as { error?: unknown };
      if (typeof parsed?.error === "string" && parsed.error.trim()) text = parsed.error;
    } catch {
      /* keep provider text */
    }
    sendJson(this.client, { channel: "speech", type: "speech.error", payload: { message: text } });
  }
}

interface SocketSessionState {
  speech: SpeechConnection;
  unsubscribe: (() => void) | null;
  subscribedSessionId: number | null;
  unsubscribeAgent: (() => void) | null;
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
    const pastedTexts = Array.isArray(message.pastedTexts)
      ? message.pastedTexts
      : Array.isArray(message.payload?.pastedTexts)
        ? (message.payload.pastedTexts as Array<{ id: string; text: string }>)
        : undefined;
    const attachments = Array.isArray(message.attachments)
      ? message.attachments
      : Array.isArray(message.payload?.attachments)
        ? (message.payload.attachments as SessionPromptAttachment[])
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
      .submitSessionInput(sessionId, { message: text, images, pastedTexts, attachments })
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

function handleAgentMessage(
  socket: ClientSocket,
  state: SocketSessionState,
  manager: SessionManager | undefined,
  message: ClientMessage,
): void {
  if (!manager) {
    sendJson(socket, {
      channel: "agent",
      type: "error",
      error: "agent channel is unavailable",
    });
    return;
  }

  if (message.type === "subscribe") {
    state.unsubscribeAgent?.();
    sendJson(socket, {
      channel: "agent",
      type: "ui_menus",
      agents: manager.listAllAgentUiMenus(),
    });
    state.unsubscribeAgent = manager.onAgentUiMenus((event) => {
      sendJson(socket, {
        channel: "agent",
        type: "ui_menus",
        agentId: event.agentId,
        menus: event.menus,
      });
    });
    return;
  }

  if (message.type === "unsubscribe") {
    state.unsubscribeAgent?.();
    state.unsubscribeAgent = null;
    return;
  }

  sendJson(socket, {
    channel: "agent",
    type: "error",
    error: `unknown agent message type: ${message.type}`,
  });
}

export function registerWebSocketRoutes(
  app: WebSocketRouteBuilder,
  password?: string,
  manager?: SessionManager,
): void {
  const connections = new WeakMap<object, SocketSessionState>();
  const previewConnections = new WeakMap<
    object,
    { upstream: WebSocket; pending: Array<string | Buffer | ArrayBuffer | Uint8Array> }
  >();

  app.ws("/sessions/:id/preview/:scriptName/*", {
    beforeHandle: (context: {
      params?: Record<string, string>;
      query?: Record<string, string | undefined>;
    }) => {
      if (password && context.query?.password !== password) {
        return new Response("Unauthorized", { status: 401 });
      }
      const sessionId = parseSessionId(context.params?.id);
      const session = sessionId == null ? undefined : manager?.get(sessionId);
      if (!session) return new Response("Preview not found", { status: 404 });
    },
    open(
      socket: ClientSocket & {
        raw: object;
        data: { params: Record<string, string>; query: Record<string, string>; request: Request };
      },
    ) {
      const sessionId = parseSessionId(socket.data.params.id);
      const session = sessionId == null ? undefined : manager?.get(sessionId);
      if (!session) {
        socket.close(1008, "Preview not found");
        return;
      }
      const requestUrl = new URL(socket.data.request.url);
      const scriptName = decodeURIComponent(socket.data.params.scriptName ?? "");
      const target = resolveSessionPreviewTarget({
        session,
        scriptName,
        requestPath: requestUrl.pathname,
      });
      if (!target) {
        socket.close(1008, "Preview not available");
        return;
      }
      const upstreamUrl = buildPreviewUpstreamUrl(target, requestUrl);
      upstreamUrl.protocol = "ws:";
      const upstream = new WebSocket(upstreamUrl, "vite-hmr");
      const state = {
        upstream,
        pending: [] as Array<string | Buffer | ArrayBuffer | Uint8Array>,
      };
      previewConnections.set(socket.raw, state);
      upstream.binaryType = "arraybuffer";
      upstream.addEventListener("open", () => {
        for (const item of state.pending.splice(0)) upstream.send(item);
      });
      upstream.addEventListener("message", (event) => {
        const data = event.data;
        if (typeof data === "string") socket.send(data);
        else if (data instanceof ArrayBuffer) socket.send(new Uint8Array(data));
        else if (ArrayBuffer.isView(data)) {
          socket.send(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        }
      });
      upstream.addEventListener("close", (event) => {
        previewConnections.delete(socket.raw);
        socket.close(event.code || 1000, event.reason || "Preview closed");
      });
      upstream.addEventListener("error", () => {
        previewConnections.delete(socket.raw);
        socket.close(1011, "Preview WebSocket failed");
      });
    },
    message(socket: ClientSocket & { raw: object }, data: unknown) {
      const state = previewConnections.get(socket.raw);
      if (!state) return;
      const payload = data as string | Buffer | ArrayBuffer | Uint8Array;
      if (state.upstream.readyState === WebSocket.OPEN) state.upstream.send(payload);
      else state.pending.push(payload);
    },
    close(socket: ClientSocket & { raw: object }) {
      const state = previewConnections.get(socket.raw);
      previewConnections.delete(socket.raw);
      if (
        state &&
        (state.upstream.readyState === WebSocket.OPEN ||
          state.upstream.readyState === WebSocket.CONNECTING)
      ) {
        state.upstream.close();
      }
    },
  });

  app.ws("/ws", {
    maxPayloadLength: MAX_AUDIO_FRAME_BYTES,
    beforeHandle: (context: { query?: Record<string, string | undefined> }) => {
      if (password && context.query?.password !== password) {
        return new Response("Unauthorized", { status: 401 });
      }
    },
    open(socket: ClientSocket & { raw: object }) {
      connections.set(socket.raw, {
        speech: new SpeechConnection(socket),
        unsubscribe: null,
        subscribedSessionId: null,
        unsubscribeAgent: null,
      });
      sendJson(socket, { channel: "system", type: "system.ready" });
    },
    message(socket: ClientSocket & { raw: object }, data: unknown) {
      const state = connections.get(socket.raw);
      if (!state) return;
      try {
        if (Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
          const view = ArrayBuffer.isView(data)
            ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
            : Buffer.from(data as ArrayBuffer);
          state.speech.append(view);
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
        } else if (message.channel === "speech" && message.type === "speech.audio") {
          const pcm = message.payload?.pcm;
          if (typeof pcm === "string" && pcm) state.speech.append(Buffer.from(pcm, "base64"));
        } else if (message.channel === "speech" && message.type === "speech.stop") {
          state.speech.stop();
        } else if (message.channel === "session") {
          handleSessionMessage(socket, state, manager, message);
        } else if (message.channel === "agent") {
          handleAgentMessage(socket, state, manager, message);
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
      state?.unsubscribeAgent?.();
      connections.delete(socket.raw);
    },
  });
}
