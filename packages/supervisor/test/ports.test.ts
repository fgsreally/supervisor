import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  findFreePortInRange,
  SESSION_SERVICE_PREFERRED_PORT_MAX,
  SESSION_SERVICE_PREFERRED_PORT_MIN,
} from "../src/utils/ports.js";

const held: net.Server[] = [];

afterEach(async () => {
  await Promise.all(
    held.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

function listen(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

describe("supervisor: preferred service ports", () => {
  it("exports the 4396-4500 preferred range", () => {
    expect(SESSION_SERVICE_PREFERRED_PORT_MIN).toBe(4396);
    expect(SESSION_SERVICE_PREFERRED_PORT_MAX).toBe(4500);
  });

  it("skips occupied ports and reserved ports in the requested range", async () => {
    const server = await listen(0);
    held.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected tcp address");
    const port = address.port;
    expect(await findFreePortInRange(port, port, [])).toBeUndefined();
    expect(await findFreePortInRange(port, port, [port])).toBeUndefined();
  });

  it("returns a bindable port after the occupant is released", async () => {
    const server = await listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected tcp address");
    const port = address.port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await findFreePortInRange(port, port, [port])).toBeUndefined();
    expect(await findFreePortInRange(port, port, [])).toBe(port);
  });
});
