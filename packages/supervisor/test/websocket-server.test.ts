import { describe, expect, it, vi } from "vitest";
import { registerWebSocketRoutes } from "../src/websocket/server.js";

type Hooks = {
  open(socket: TestSocket): void;
  message(socket: TestSocket, data: unknown): void;
  close(socket: TestSocket): void;
  maxPayloadLength: number;
};

type TestSocket = {
  raw: object;
  send: ReturnType<typeof vi.fn>;
};

function register() {
  let path = "";
  let hooks: Hooks | undefined;
  registerWebSocketRoutes({
    ws(routePath, routeHooks) {
      path = routePath;
      hooks = routeHooks as Hooks;
    },
  });
  if (!hooks) throw new Error("WebSocket hooks were not registered");
  return { path, hooks };
}

describe("supervisor: Elysia WebSocket route", () => {
  it("registers /ws and handles correlated ping/pong messages", () => {
    const { path, hooks } = register();
    const socket: TestSocket = { raw: {}, send: vi.fn() };
    expect(path).toBe("/ws");

    hooks.open(socket);
    expect(JSON.parse(socket.send.mock.calls[0]![0] as string)).toEqual({
      channel: "system",
      type: "system.ready",
    });

    hooks.message(socket, JSON.stringify({ id: "ping-1", channel: "system", type: "ping" }));
    expect(JSON.parse(socket.send.mock.calls[1]![0] as string)).toEqual({
      id: "ping-1",
      channel: "system",
      type: "pong",
    });
    hooks.close(socket);
  });

  it("sets the audio frame limit on the Elysia route", () => {
    expect(register().hooks.maxPayloadLength).toBe(256 * 1024);
  });
});
