import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { attachWebSocketServer } from "../src/websocket/server.js";

describe("supervisor: WebSocket server", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((close) => close()));
  });

  async function createTestServer() {
    const server = createServer((_request, response) => response.end("ok"));
    const websocketServer = attachWebSocketServer(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server has no port");
    cleanup.push(
      () =>
        new Promise<void>((resolve) => {
          websocketServer.close(() => server.close(() => resolve()));
        }),
    );
    return address.port;
  }

  it("accepts /ws and handles correlated ping/pong messages", async () => {
    const port = await createTestServer();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const [readyData] = (await once(socket, "message")) as [Buffer];
    expect(JSON.parse(readyData.toString())).toEqual({
      channel: "system",
      type: "system.ready",
    });

    socket.send(JSON.stringify({ id: "ping-1", channel: "system", type: "ping" }));
    const [pongData] = (await once(socket, "message")) as [Buffer];
    expect(JSON.parse(pongData.toString())).toEqual({
      id: "ping-1",
      channel: "system",
      type: "pong",
    });
    socket.close();
    await once(socket, "close");
  });

  it("rejects upgrades outside /ws", async () => {
    const port = await createTestServer();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/other`);
    const [error] = (await once(socket, "error")) as [Error];
    expect(error.message).toContain("socket hang up");
  });
});
