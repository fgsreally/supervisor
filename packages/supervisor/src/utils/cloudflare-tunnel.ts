/**
 * Cloudflare Quick Tunnel — spawns the bundled `cloudflared` binary
 * (auto-downloaded via the npm package) and parses the trycloudflare.com URL.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";

const START_TIMEOUT_MS = 45_000;
const URL_RE = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

export interface QuickTunnel {
  url: string;
  stop: () => void;
}

async function resolveCloudflaredBin(): Promise<string> {
  const cloudflared = await import("cloudflared");
  let binPath = cloudflared.bin;
  // Packaged Electron/asar layout (defensive; no-op for normal node installs).
  if (binPath.includes("app.asar")) {
    binPath = binPath.replace("app.asar", "app.asar.unpacked");
  }
  if (!existsSync(binPath)) {
    console.log("[tunnel] Downloading cloudflared binary…");
    await cloudflared.install(binPath);
  }
  if (!existsSync(binPath)) {
    throw new Error(
      "Failed to install cloudflared. Install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/downloads/",
    );
  }
  return binPath;
}

/**
 * Start a Quick Tunnel pointing at http://127.0.0.1:{port}.
 * Uses --protocol http2 to avoid QUIC/UDP blocks on some networks.
 */
export async function startQuickTunnel(port: number): Promise<QuickTunnel> {
  const binPath = await resolveCloudflaredBin();
  console.log(`[tunnel] Starting Cloudflare Quick Tunnel → http://127.0.0.1:${port}`);

  return new Promise<QuickTunnel>((resolve, reject) => {
    const proc: ChildProcess = spawn(
      binPath,
      ["tunnel", "--url", `http://127.0.0.1:${port}`, "--protocol", "http2", "--no-autoupdate"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let settled = false;
    let output = "";

    const stop = () => {
      if (!proc.killed) {
        try {
          proc.kill("SIGTERM");
        } catch {
          try {
            proc.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
      }
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stop();
      reject(new Error(message));
    };

    const timeout = setTimeout(() => {
      fail("Timeout waiting for Cloudflare Quick Tunnel URL");
    }, START_TIMEOUT_MS);

    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      const match = text.match(URL_RE) ?? output.match(URL_RE);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        const url = match[0];
        console.log(`[tunnel] Public URL: ${url}`);
        resolve({ url, stop });
      }
    };

    proc.stderr?.on("data", onChunk);
    proc.stdout?.on("data", onChunk);

    proc.on("error", (error) => {
      fail(`Failed to start cloudflared: ${error.message}`);
    });

    proc.on("exit", (code) => {
      if (!settled) {
        fail(`cloudflared exited with code ${code} before publishing a URL`);
      }
    });

    const onSignal = () => stop();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    proc.on("exit", () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    });
  });
}

/** Prefer a physical LAN IPv4 address for same-WiFi QR codes. */
export function getLanIPv4(): string | null {
  const interfaces = networkInterfaces();
  let fallback: string | null = null;
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    const virtual = isVirtualInterface(name);
    for (const info of addrs) {
      if (info.internal || info.family !== "IPv4") continue;
      if (!virtual) return info.address;
      fallback ??= info.address;
    }
  }
  return fallback;
}

function isVirtualInterface(name: string): boolean {
  return /^(docker|br-|veth|vEthernet|vgate|wintun|vmnet|VMware|VirtualBox|vboxnet|Hyper-V|Default Switch|WSL|tun|tap|singbox|sing-box|clash|utun|tailscale|Tailscale|ZeroTier|zt|wg|wireguard|ham|Hamachi|npcap|lo)/i.test(
    name,
  );
}
