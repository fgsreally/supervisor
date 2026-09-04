import { createHash, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import net from "node:net";
import tls from "node:tls";
import { formatUnknownError } from "./format-error.js";

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;
const CONNECTING = 0;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const RESERVED_HEADER_NAMES = new Set([
  "host",
  "upgrade",
  "connection",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
]);

export interface OutboundWebSocket {
  readonly readyState: number;
  send(data: string | Buffer | Uint8Array): void;
  close(): void;
  terminate(): void;
  once(event: "open", listener: () => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export function isOutboundSocketOpen(socket: OutboundWebSocket): boolean {
  return socket.readyState === OPEN;
}

export class WebSocketHandshakeError extends Error {
  readonly statusCode: number;
  readonly body: string;
  readonly logId: string;

  constructor(statusCode: number, body = "", logId = "") {
    const parts = [`Unexpected server response: ${statusCode}`];
    if (logId) parts.push(`logid=${logId}`);
    const trimmed = body.trim();
    if (trimmed) parts.push(trimmed.slice(0, 500));
    super(parts.join("\n"));
    this.name = "WebSocketHandshakeError";
    this.statusCode = statusCode;
    this.body = trimmed;
    this.logId = logId;
  }
}

/** Map handshake failures to a user-facing message that includes HTTP status/body. */
export function formatOutboundHandshakeError(error: unknown, label: string, hint: string): string {
  if (error instanceof WebSocketHandshakeError) {
    const detail = summarizeHandshakeBody(error.body);
    const statusHint = handshakeStatusHint(error.statusCode) || hint;
    return `${label} WebSocket 握手失败 (HTTP ${error.statusCode})${detail ? `: ${detail}` : ""}。${statusHint}`;
  }
  const message = formatUnknownError(error, `${label}连接失败`);
  const statusMatch = message.match(/Unexpected server response:\s*(\d+)/i);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    const statusHint = handshakeStatusHint(status) || hint;
    const detail = summarizeHandshakeBody(message.split("\n").slice(1).join("\n"));
    return `${label} WebSocket 握手失败 (HTTP ${status})${detail ? `: ${detail}` : ""}。${statusHint}`;
  }
  if (/Expected 101|handshake timeout|WebSocket handshake/i.test(message)) {
    return `${label} WebSocket 握手失败。${hint}`;
  }
  return message;
}

/**
 * Client WebSocket that performs the HTTP upgrade itself.
 * Built-in `WebSocket` / `ws` shims lowercase headers and hide non-101
 * status codes behind "Expected 101 status code".
 */
export function createOutboundWebSocket(
  url: string,
  headers: Record<string, string>,
  handshakeTimeoutMs = 15_000,
): OutboundWebSocket {
  return new RawTlsWebSocket(url, headers, handshakeTimeoutMs);
}

class RawTlsWebSocket extends EventEmitter implements OutboundWebSocket {
  readyState = CONNECTING;
  private socket: net.Socket | tls.TLSSocket | null = null;
  private fragments: Buffer[] = [];
  private fragmentOpcode = 0;
  private recvBuf = Buffer.alloc(0);
  private closeSent = false;
  private settled = false;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, headers: Record<string, string>, handshakeTimeoutMs: number) {
    super();
    // Prevent "Unhandled error" if callers attach listeners a tick later.
    this.on("error", () => {});
    this.handshakeTimer = setTimeout(() => {
      this.fail(new Error("WebSocket handshake timeout"));
    }, handshakeTimeoutMs);
    try {
      this.beginHandshake(url, headers);
    } catch (error) {
      queueMicrotask(() => this.fail(error));
    }
  }

  send(data: string | Buffer | Uint8Array): void {
    if (this.readyState !== OPEN) throw new Error("WebSocket is not open");
    const isText = typeof data === "string";
    const payload = isText ? Buffer.from(data) : Buffer.from(data);
    this.writeFrame(isText ? 0x1 : 0x2, payload);
  }

  close(): void {
    if (this.readyState === CLOSED || this.readyState === CLOSING) return;
    if (this.readyState === CONNECTING) {
      this.fail(new Error("WebSocket closed before handshake completed"));
      return;
    }
    this.readyState = CLOSING;
    this.sendClose(1000);
    this.socket?.end();
  }

  terminate(): void {
    this.settled = true;
    this.clearHandshakeTimer();
    this.destroySocket();
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.emit("close");
  }

  private beginHandshake(url: string, headers: Record<string, string>): void {
    const parsed = new URL(url);
    if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") {
      throw new Error(`Unsupported WebSocket protocol: ${parsed.protocol}`);
    }
    const secure = parsed.protocol === "wss:";
    const port = parsed.port ? Number(parsed.port) : secure ? 443 : 80;
    const path = `${parsed.pathname || "/"}${parsed.search}`;
    const key = randomBytes(16).toString("base64");
    const expectedAccept = createHash("sha1")
      .update(key + WS_GUID)
      .digest("base64");
    const request = buildUpgradeRequest(parsed.host, path, key, headers);

    const onConnected = (socket: net.Socket | tls.TLSSocket) => {
      if (this.settled || this.readyState !== CONNECTING) {
        socket.destroy();
        return;
      }
      this.socket = socket;
      socket.setNoDelay(true);
      socket.write(request);
    };

    const socket = secure
      ? tls.connect(
          {
            host: parsed.hostname,
            port,
            servername: parsed.hostname,
          },
          () => onConnected(socket),
        )
      : net.connect({ host: parsed.hostname, port }, () => onConnected(socket));

    this.socket = socket;
    socket.on("error", (error) => this.fail(error));
    socket.once("close", () => {
      if (this.readyState === CLOSED || this.settled) return;
      this.fail(new Error("WebSocket connection closed during handshake"));
    });

    let buf = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        if (buf.length > MAX_HEADER_BYTES)
          this.fail(new Error("WebSocket handshake headers too large"));
        return;
      }
      socket.off("data", onData);
      socket.removeAllListeners("close");
      const headerText = buf.subarray(0, headerEnd).toString("latin1");
      const leftover = buf.subarray(headerEnd + 4);
      let parsedResponse: { status: number; headers: Array<[string, string]> };
      try {
        parsedResponse = parseHttpResponse(headerText);
      } catch (error) {
        this.fail(error);
        return;
      }
      if (parsedResponse.status !== 101) {
        void this.rejectHandshake(socket, leftover, parsedResponse);
        return;
      }
      const accept = headerValue(parsedResponse.headers, "sec-websocket-accept");
      if (accept !== expectedAccept) {
        this.fail(new Error("Invalid Sec-WebSocket-Accept header"));
        return;
      }
      this.clearHandshakeTimer();
      this.attachSocket(socket, leftover);
    };
    socket.on("data", onData);
  }

  private async rejectHandshake(
    socket: net.Socket | tls.TLSSocket,
    leftover: Buffer,
    response: { status: number; headers: Array<[string, string]> },
  ): Promise<void> {
    const logId =
      headerValue(response.headers, "x-tt-logid") ||
      headerValue(response.headers, "x-api-connect-id");
    const body = await readErrorBody(socket, leftover, response.headers);
    this.fail(new WebSocketHandshakeError(response.status, body, logId));
  }

  private attachSocket(socket: net.Socket | tls.TLSSocket, leftover: Buffer): void {
    this.socket = socket;
    this.readyState = OPEN;
    this.recvBuf = Buffer.from(leftover);
    socket.removeAllListeners("error");
    socket.removeAllListeners("close");
    socket.removeAllListeners("data");
    socket.on("error", (error) => this.fail(error));
    socket.on("data", (chunk: Buffer) => {
      this.recvBuf = Buffer.concat([this.recvBuf, chunk]);
      this.consumeFrames();
    });
    socket.on("close", () => {
      if (this.readyState === CLOSED) return;
      this.readyState = CLOSED;
      this.emit("close");
    });
    this.emit("open");
    this.consumeFrames();
  }

  private consumeFrames(): void {
    while (this.readyState === OPEN || this.readyState === CLOSING) {
      let frame: ReturnType<typeof decodeFrame>;
      try {
        frame = decodeFrame(this.recvBuf);
      } catch (error) {
        this.fail(error);
        return;
      }
      if (!frame) return;
      this.recvBuf = this.recvBuf.subarray(frame.bytesConsumed);
      if (frame.rsv) {
        this.fail(new Error("Unexpected WebSocket RSV bits"));
        return;
      }
      switch (frame.opcode) {
        case 0x0:
          if (this.fragmentOpcode === 0) {
            this.fail(new Error("Unexpected WebSocket continuation"));
            return;
          }
          this.fragments.push(frame.payload);
          if (frame.fin) this.flushFragments();
          break;
        case 0x1:
        case 0x2:
          if (this.fragmentOpcode !== 0) {
            this.fail(new Error("Incomplete WebSocket fragmented message"));
            return;
          }
          if (!frame.fin) {
            this.fragmentOpcode = frame.opcode;
            this.fragments = [frame.payload];
            break;
          }
          this.emitMessage(frame.opcode, frame.payload);
          break;
        case 0x8:
          this.handleClose(frame.payload);
          return;
        case 0x9:
          this.writeFrame(0xa, frame.payload);
          break;
        case 0xa:
          break;
        default:
          this.fail(new Error(`Unsupported WebSocket opcode ${frame.opcode}`));
          return;
      }
    }
  }

  private flushFragments(): void {
    const opcode = this.fragmentOpcode;
    const payload = Buffer.concat(this.fragments);
    this.fragments = [];
    this.fragmentOpcode = 0;
    this.emitMessage(opcode, payload);
  }

  private emitMessage(opcode: number, payload: Buffer): void {
    this.emit("message", opcode === 0x1 ? payload.toString("utf8") : payload);
  }

  private handleClose(payload: Buffer): void {
    if (!this.closeSent) this.sendClose(payload.length >= 2 ? payload.readUInt16BE(0) : 1000);
    this.destroySocket();
    this.readyState = CLOSED;
    this.emit("close");
  }

  private sendClose(code: number): void {
    if (this.closeSent || !this.socket) return;
    this.closeSent = true;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    try {
      this.writeFrame(0x8, payload);
    } catch {
      /* ignore */
    }
  }

  private writeFrame(opcode: number, payload: Buffer): void {
    if (!this.socket) return;
    const mask = randomBytes(4);
    const masked = Buffer.allocUnsafe(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i]! ^ mask[i & 3]!;
    const header = encodeFrameHeader(opcode, payload.length, mask);
    this.socket.write(Buffer.concat([header, masked]));
  }

  private fail(error: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.clearHandshakeTimer();
    this.destroySocket();
    this.readyState = CLOSED;
    const next = error instanceof Error ? error : new Error(String(error));
    this.emit("error", next);
    this.emit("close");
  }

  private destroySocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.removeAllListeners();
    socket.destroy();
  }

  private clearHandshakeTimer(): void {
    if (!this.handshakeTimer) return;
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }
}

function buildUpgradeRequest(
  host: string,
  path: string,
  key: string,
  headers: Record<string, string>,
): string {
  const lines = [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
  ];
  for (const [name, value] of Object.entries(headers)) {
    if (!name || RESERVED_HEADER_NAMES.has(name.toLowerCase())) continue;
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) continue;
    lines.push(`${name}: ${value}`);
  }
  lines.push("", "");
  return lines.join("\r\n");
}

function parseHttpResponse(headerText: string): {
  status: number;
  headers: Array<[string, string]>;
} {
  const lines = headerText.split("\r\n");
  const status = Number(lines[0]?.split(" ")[1]);
  if (!Number.isInteger(status)) throw new Error(`Invalid HTTP status line: ${lines[0] ?? ""}`);
  const headers: Array<[string, string]> = [];
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    headers.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
  }
  return { status, headers };
}

function headerValue(headers: Array<[string, string]>, name: string): string {
  const needle = name.toLowerCase();
  for (const [key, value] of headers) {
    if (key.toLowerCase() === needle) return value;
  }
  return "";
}

function readErrorBody(
  socket: net.Socket | tls.TLSSocket,
  leftover: Buffer,
  headers: Array<[string, string]>,
): Promise<string> {
  return new Promise((resolve) => {
    const length = Number(headerValue(headers, "content-length"));
    let buf = leftover;
    const finish = () => {
      socket.removeAllListeners("data");
      socket.removeAllListeners("end");
      resolve(buf.toString("utf8").trim());
    };
    if (Number.isInteger(length) && length >= 0) {
      if (buf.length >= length) {
        resolve(buf.subarray(0, length).toString("utf8").trim());
        return;
      }
    } else if (buf.length > 0 && socket.readableEnded) {
      finish();
      return;
    }
    const timer = setTimeout(finish, 1500);
    socket.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (Number.isInteger(length) && length >= 0 && buf.length >= length) {
        clearTimeout(timer);
        socket.removeAllListeners("data");
        socket.removeAllListeners("end");
        resolve(buf.subarray(0, length).toString("utf8").trim());
      }
    });
    socket.once("end", () => {
      clearTimeout(timer);
      finish();
    });
  });
}

function encodeFrameHeader(opcode: number, length: number, mask: Buffer): Buffer {
  let header: Buffer;
  if (length < 126) {
    header = Buffer.alloc(6);
    header[1] = 0x80 | length;
  } else if (length < 65536) {
    header = Buffer.alloc(8);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(14);
    header[1] = 0x80 | 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(length, 6);
  }
  header[0] = 0x80 | opcode;
  mask.copy(header, header.length - 4);
  return header;
}

function decodeFrame(
  buf: Buffer,
): { opcode: number; fin: boolean; rsv: number; payload: Buffer; bytesConsumed: number } | null {
  if (buf.length < 2) return null;
  const b0 = buf[0]!;
  const b1 = buf[1]!;
  const fin = (b0 & 0x80) !== 0;
  const rsv = b0 & 0x70;
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let length = b1 & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buf.length < 4) return null;
    length = buf.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buf.length < 10) return null;
    const high = buf.readUInt32BE(2);
    const low = buf.readUInt32BE(6);
    if (high !== 0 || low > MAX_PAYLOAD_BYTES) throw new Error("WebSocket payload too large");
    length = low;
    offset = 10;
  }
  if (length > MAX_PAYLOAD_BYTES) throw new Error("WebSocket payload too large");
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buf.length < offset + length) return null;
  let payload = buf.subarray(offset, offset + length);
  if (masked) {
    const mask = buf.subarray(maskOffset, maskOffset + 4);
    const unmasked = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) unmasked[i] = payload[i]! ^ mask[i & 3]!;
    payload = unmasked;
  }
  return { opcode, fin, rsv, payload, bytesConsumed: offset + length };
}

function summarizeHandshakeBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as {
      message?: unknown;
      error?: unknown;
      msg?: unknown;
      code?: unknown;
    };
    const text = [parsed.message, parsed.error, parsed.msg]
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .find(Boolean);
    if (text) return text.slice(0, 240);
  } catch {
    /* not JSON */
  }
  return trimmed.replace(/\s+/g, " ").slice(0, 240);
}

function handshakeStatusHint(status: number): string {
  if (status === 403) {
    return "API Key 已被识别，但未授权当前 Resource ID；请在豆包语音控制台开通流式语音识别，并将该服务绑定到此 API Key";
  }
  if (status === 401) {
    return "请确认填写的是新版控制台 API Key（不是旧版 Access Token），并且已开通流式语音识别";
  }
  if (status === 404) return "接口地址不存在，请确认使用 bigmodel_async";
  if (status === 400) return "握手请求被拒绝，请重新保存 API Key 后再试";
  return "";
}
