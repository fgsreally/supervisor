/**
 * Startup banner — compact, boxed layout (Claude Code / pi style).
 */
import boxen from "boxen";
import pc from "picocolors";
import qrcodeTerminal from "qrcode-terminal";
import { platform } from "node:os";
import { getLanIPv4 } from "./cloudflare-tunnel.js";
import type { AgentWithSystemMd } from "../types.js";

export interface StartupBannerOptions {
  port: number;
  pin: string;
  pinGenerated: boolean;
  home: string;
  database: string;
  workspaceCwd: string;
  publicUrl?: string | null;
  tunnelUrl?: string | null;
  uiDistMissing?: boolean;
  devMode?: boolean;
}

function kv(label: string, value: string, valueStyle: (s: string) => string = pc.white): string {
  return `${pc.dim(label.padEnd(9))}${valueStyle(value)}`;
}

function printQr(url: string): void {
  qrcodeTerminal.generate(url, { small: true }, (code: string) => {
    for (const line of code.split("\n")) {
      if (line.length) console.log(line);
    }
  });
}

export function resolveScanUrl(options: {
  port: number;
  publicUrl?: string | null;
  tunnelUrl?: string | null;
}): { url: string | null; kind: "tunnel" | "dev" | "lan" | null } {
  if (options.tunnelUrl?.trim()) {
    return { url: options.tunnelUrl.trim(), kind: "tunnel" };
  }
  if (options.publicUrl?.trim()) {
    return { url: options.publicUrl.trim(), kind: "dev" };
  }
  const lanIp = getLanIPv4();
  if (lanIp) {
    return { url: `http://${lanIp}:${options.port}`, kind: "lan" };
  }
  return { url: null, kind: null };
}

export function buildDevPublicUrl(uiPort: number): string | null {
  const lanIp = getLanIPv4();
  if (!lanIp) return null;
  return `http://${lanIp}:${uiPort}`;
}

function firewallHint(ports: number[]): string | null {
  if (platform() !== "win32") return null;
  const list = ports.join(", ");
  return pc.dim(
    `Windows 防火墙若拦截，以管理员运行：netsh advfirewall firewall add rule name="Supervisor Dev" dir=in action=allow protocol=TCP localport=${list}`,
  );
}

export function printStartupBanner(options: StartupBannerOptions): void {
  const { port, pin, pinGenerated, home, database, devMode, publicUrl, tunnelUrl, uiDistMissing } =
    options;

  const uiPort = Number(process.env.PI_SUPERVISOR_UI_PORT || "5163");
  const desktopUrl = devMode ? `http://127.0.0.1:${uiPort}` : `http://127.0.0.1:${port}`;
  const { url: scanUrl, kind: scanKind } = resolveScanUrl({ port, publicUrl, tunnelUrl });
  const pinText = pinGenerated ? pin : pc.dim("(configured)");

  const lines: string[] = [];
  lines.push(kv("Desktop", desktopUrl, pc.cyan));
  if (scanUrl && scanKind === "dev") {
    lines.push(kv("Phone", scanUrl, (s) => pc.bold(pc.green(s))));
  } else if (scanUrl) {
    lines.push(kv("Scan", scanUrl, (s) => pc.bold(pc.green(s))));
  }
  lines.push(kv("API", `127.0.0.1:${port}`, pc.dim));
  lines.push(kv("PIN", pinText, pinGenerated ? pc.yellow : pc.dim));
  if (devMode) {
    lines.push("");
    lines.push(pc.dim(`Data  ${home}`));
  } else {
    lines.push("");
    lines.push(pc.dim(`Home  ${home}`));
    lines.push(pc.dim(`DB    ${database}`));
  }

  const title = devMode ? pc.cyan("supervisor") + pc.dim(" · dev") : pc.cyan("supervisor");
  console.log(
    boxen(lines.join("\n"), {
      title,
      titleAlignment: "left",
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: "round",
      borderColor: "cyan",
      dimBorder: true,
    }),
  );

  if (scanUrl) {
    console.log("");
    const scanLabel =
      scanKind === "tunnel"
        ? pc.bold("Remote  ") + pc.dim("Cloudflare")
        : scanKind === "dev"
          ? pc.bold("Mobile  ") + pc.dim("same WiFi → open in browser, then enter PIN")
          : pc.bold("Mobile  ") + pc.dim("same WiFi");
    console.log(`  ${scanLabel}`);
    console.log("");
    printQr(scanUrl);
    console.log("");
  }

  if (devMode) {
    const hint = firewallHint([uiPort, port]);
    if (hint) {
      console.log(`  ${pc.yellow("!")} ${hint}`);
      console.log("");
    }
    console.log(
      `  ${pc.dim("Tip: use")} ${pc.white("pnpm dev")} ${pc.dim("(not dev:supervisor) — phone needs port")} ${pc.white(String(uiPort))}`,
    );
    console.log("");
  }

  if (uiDistMissing && !devMode) {
    console.log(
      `  ${pc.yellow("!")} ${pc.dim("UI dist missing —")} ${pc.white("pnpm run build:ui")} ${pc.dim("for single-port serve")}`,
    );
    console.log("");
  }

  if (tunnelUrl && scanKind === "tunnel") {
    console.log(`  ${pc.dim("Tunnel URL changes on restart.")}`);
    console.log("");
  }
}

export function printTunnelStarting(): void {
  console.log(pc.dim("  Starting Cloudflare Quick Tunnel…"));
}

export function printTunnelError(message: string): void {
  console.error(`  ${pc.red("×")} ${pc.red(message)}`);
}

export function printExternalAgentAvailability(agents: AgentWithSystemMd[]): void {
  const external = agents.filter((agent) => agent.backendType !== "native");
  if (external.length === 0) return;

  console.log(`  ${pc.bold("External agents")}`);
  for (const agent of external) {
    const status = agent.available ? pc.green("ready") : pc.yellow("missing");
    const detail = agent.available
      ? agent.detectedVersion
        ? pc.dim(` (${agent.detectedVersion})`)
        : ""
      : pc.dim(` — ${agent.unavailableReason ?? "不可用"}`);
    console.log(`    ${pc.dim("·")} ${agent.name}: ${status}${detail}`);
  }
  console.log("");
}

export function warnMissingUiDistStyled(): void {
  // no-op: banner handles this
}
