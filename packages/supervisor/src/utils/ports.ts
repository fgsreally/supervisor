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

/** Preferred listen port hint so concurrent Sessions do not all start at 4396. */
export function preferredServicePortHint(sessionId: number): number {
  const span = SESSION_SERVICE_PREFERRED_PORT_MAX - SESSION_SERVICE_PREFERRED_PORT_MIN + 1;
  return SESSION_SERVICE_PREFERRED_PORT_MIN + (Math.abs(sessionId) % span);
}

/** First free TCP port in [min, max] on 127.0.0.1, skipping `occupied`. */
export async function findFreePortInRange(
  min: number,
  max: number,
  occupied: Iterable<number> = [],
  startAt = min,
): Promise<number | undefined> {
  const skip = new Set(
    [...occupied].filter((port) => Number.isInteger(port) && port >= min && port <= max),
  );
  const span = max - min + 1;
  if (span <= 0) return undefined;
  const origin = startAt >= min && startAt <= max ? startAt : min;
  for (let i = 0; i < span; i++) {
    const port = min + ((origin - min + i) % span);
    if (skip.has(port)) continue;
    if (await isLoopbackTcpPortOpen(port)) continue;
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

/** True when either IPv4 or IPv6 loopback accepts TCP connections on the port. */
export async function isLoopbackTcpPortOpen(port: number, timeoutMs = 400): Promise<boolean> {
  if (await isTcpPortOpen(port, "127.0.0.1", timeoutMs)) return true;
  return isTcpPortOpen(port, "::1", timeoutMs);
}

/** True when any of the given ports is accepting connections. */
export async function anyTcpPortOpen(ports: number[], host = "127.0.0.1"): Promise<boolean> {
  for (const port of ports) {
    if (await isTcpPortOpen(port, host)) return true;
  }
  return false;
}

/** True when any port accepts TCP connections on either loopback address. */
export async function anyLoopbackTcpPortOpen(ports: number[]): Promise<boolean> {
  for (const port of ports) {
    if (await isLoopbackTcpPortOpen(port)) return true;
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
