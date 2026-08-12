import net from "node:net";

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
