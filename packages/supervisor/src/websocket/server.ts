import { randomUUID } from "node:crypto";
import { WebSocket, type RawData } from "ws";
import type { SessionManager } from "../core/session-manager.js";
import type { SessionPromptImage } from "../core/session-media.js";
import { decryptApiKey } from "../utils/encrypt.js";
import { readSupervisorSettings } from "../utils/supervisor-settings.js";

const MAX_AUDIO_FRAME_BYTES = 256 * 1024;
const QWEN_REALTIME_URL =
  "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime";
const DOUBAO_REALTIME_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";
type SpeechProvider = "qwen" | "doubao";

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
  const sequenceBytes = sequence === undefined ? 0 : 4;
  const packet = Buffer.alloc(8 + sequenceBytes + payload.byteLength);
  packet[0] = 0x11;
  packet[1] = (messageType << 4) | flags;
  packet[2] = messageType === 1 ? 0x10 : 0;
  if (sequence !== undefined) packet.writeInt32BE(sequence, 4);
  packet.writeUInt32BE(payload.byteLength, 4 + sequenceBytes);
  payload.copy(packet, 8 + sequenceBytes);
  return packet;
}

function parseDoubaoEvent(data: RawData): DoubaoEvent {
  const packet = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  const messageType = packet[1] ? packet[1] >> 4 : 0;
  const flags = packet[1] ? packet[1] & 0x0f : 0;
  if (messageType === 15) {
    const messageSize = packet.readUInt32BE(8);
    throw new Error(packet.subarray(12, 12 + messageSize).toString() || "Doubao speech error");
  }
  const offset = flags & 1 ? 8 : 4;
  const payloadSize = packet.readUInt32BE(offset);
  return JSON.parse(
    packet.subarray(offset + 4, offset + 4 + payloadSize).toString(),
  ) as DoubaoEvent;
}

class SpeechConnection {
  private upstream: WebSocket | null = null;
  private stopping = false;
  private provider: SpeechProvider = "qwen";
  private sequence = 0;
  private doubaoText = "";

  constructor(private readonly client: ClientSocket) {}

  async start(language: unknown): Promise<void> {
    if (this.upstream) throw new Error("speech session is already active");
    const settings = readSupervisorSettings();
    this.provider = settings.speechRecognitionMode === "doubao" ? "doubao" : "qwen";
    const encryptedKey =
      this.provider === "doubao"
        ? settings.doubaoSpeechApiKeyEncrypted
        : settings.speechApiKeyEncrypted;
    if (!encryptedKey) throw new Error(`${this.provider} speech API key is not configured`);
    const apiKey = decryptApiKey(encryptedKey);

    await new Promise<void>((resolve, reject) => {
      const upstream = new WebSocket(
        this.provider === "doubao" ? DOUBAO_REALTIME_URL : QWEN_REALTIME_URL,
        {
          headers:
            this.provider === "doubao"
              ? {
                  "X-Api-Key": apiKey,
                  "X-Api-Resource-Id":
                    settings.doubaoSpeechResourceId || "volc.seedasr.sauc.duration",
                  "X-Api-Connect-Id": randomUUID(),
                }
              : { Authorization: `Bearer ${apiKey}`, "User-Agent": "pi-supervisor" },
          handshakeTimeout: 15_000,
        },
      );
      this.upstream = upstream;
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
                ...(typeof language === "string" && language ? { language } : {}),
              },
              request: {
                model_name: "bigmodel",
                enable_nonstream: true,
                enable_itn: true,
                enable_punc: true,
                show_utterances: true,
                result_type: "full",
              },
            }),
          );
          upstream.send(doubaoPacket(1, 0, payload));
          sendJson(this.client, { channel: "speech", type: "speech.ready" });
          resolve();
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
            const text = event.result?.text ?? "";
            if (text) this.doubaoText = text;
            sendJson(this.client, {
              channel: "speech",
              type: "speech.partial",
              payload: { text },
            });
          } catch (error) {
            this.fail(error instanceof Error ? error.message : String(error));
          }
          return;
        }
        const event = JSON.parse(data.toString()) as UpstreamEvent;
        if (event.type === "session.updated") {
          sendJson(this.client, { channel: "speech", type: "speech.ready" });
          resolve();
        } else {
          this.forwardEvent(event);
        }
      });
      upstream.on("error", (error) => {
        if (upstream.readyState !== WebSocket.OPEN) reject(error);
        this.fail(error.message);
      });
      upstream.on("close", () => {
        if (!this.stopping) this.fail("speech provider connection closed");
        this.upstream = null;
      });
    });
  }

  append(data: RawData): void {
    if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) {
      throw new Error("speech session is not ready");
    }
    const audio = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (audio.byteLength > MAX_AUDIO_FRAME_BYTES) throw new Error("audio frame is too large");
    if (this.provider === "doubao") {
      this.upstream.send(doubaoPacket(2, 1, audio, ++this.sequence));
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
    if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) return;
    this.stopping = true;
    if (this.provider === "doubao") {
      this.upstream.send(doubaoPacket(2, 3, Buffer.alloc(0), -++this.sequence));
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
