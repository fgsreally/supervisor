import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { decryptApiKey } from "../utils/encrypt.js";
import { readSupervisorSettings } from "../utils/supervisor-settings.js";

const MAX_AUDIO_FRAME_BYTES = 256 * 1024;
const QWEN_REALTIME_URL =
  "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime";
const DOUBAO_REALTIME_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";
type SpeechProvider = "qwen" | "doubao";

interface ClientMessage {
  id?: string;
  channel: "speech" | "system";
  type: string;
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

function sendJson(socket: WebSocket, message: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function eventId(): string {
  return `event_${randomUUID()}`;
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

  constructor(private readonly client: WebSocket) {}

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

export function attachWebSocketServer(server: Server): WebSocketServer {
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_AUDIO_FRAME_BYTES,
  });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  });

  websocketServer.on("connection", (socket) => {
    const speech = new SpeechConnection(socket);
    sendJson(socket, { channel: "system", type: "system.ready" });
    socket.on("message", (data, isBinary) => {
      try {
        if (isBinary) {
          speech.append(data);
          return;
        }
        const message = JSON.parse(data.toString()) as ClientMessage;
        if (message.channel === "system" && message.type === "ping") {
          sendJson(socket, { id: message.id, channel: "system", type: "pong" });
        } else if (message.channel === "speech" && message.type === "speech.start") {
          void speech.start(message.payload?.language).catch((error: unknown) => {
            sendJson(socket, {
              id: message.id,
              channel: "speech",
              type: "speech.error",
              payload: { message: error instanceof Error ? error.message : String(error) },
            });
          });
        } else if (message.channel === "speech" && message.type === "speech.stop") {
          speech.stop();
        }
      } catch (error) {
        sendJson(socket, {
          channel: "system",
          type: "system.error",
          payload: { message: error instanceof Error ? error.message : String(error) },
        });
      }
    });
    socket.on("close", () => speech.close());
  });
  return websocketServer;
}
