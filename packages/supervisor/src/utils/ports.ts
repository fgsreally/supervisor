import net from "node:net";

/** Preferred range for session-local preview services when the caller omits port. */
export const SESSION_SERVICE_PREFERRED_PORT_MIN = 4396;
export const SESSION_SERVICE_PREFERRED_PORT_MAX = 4500;

function canBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => resolve(!error));
    });
  });
}

/** First free TCP port in [min, max] on 127.0.0.1, skipping `occupied`. */
export async function findFreePortInRange(
  min: number,
  max: number,
  occupied: Iterable<number> = [],
): Promise<number | undefined> {
  const skip = new Set(
    [...occupied].filter((port) => Number.isInteger(port) && port >= min && port <= max),
  );
  for (let port = min; port <= max; port++) {
    if (skip.has(port)) continue;
    if (await isTcpPortOpen(port)) continue;
    if (await canBindPort(port)) return port;
  }
  return undefined;
}

/** Bind port 0 to learn a free TCP port on 127.0.0.1. */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate free port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

/** True when something accepts TCP connections on host:port. */
export async function isTcpPortOpen(
  port: number,
  host = "127.0.0.1",
  timeoutMs = 400,
): Promise<boolean> {
  if (!Number.isFinite(port) || port <= 0) return false;
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(timeoutMs, () => done(false));
  });
}

/** True when any of the given ports is accepting connections. */
export async function anyTcpPortOpen(ports: number[], host = "127.0.0.1"): Promise<boolean> {
  for (const port of ports) {
    if (await isTcpPortOpen(port, host)) return true;
  }
  return false;
}

/** Allocate distinct free ports for each env var name. */
export async function allocatePorts(envNames: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(envNames.map((name) => name.trim()).filter(Boolean))];
  const result: Record<string, string> = {};
  for (const name of unique) {
    result[name] = String(await findFreePort());
  }
  return result;
}
