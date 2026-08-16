import boxen from "boxen";
import { createRequire } from "node:module";
import pc from "picocolors";
import { platform } from "node:os";
import { getLanIPv4 } from "./cloudflare-tunnel.js";
import type { AgentWithSystemMd } from "../types.js";
import { translateLog } from "../i18n/logs.js";

const qrcodeTerminal = createRequire(import.meta.url)("qrcode-terminal") as {
  generate(url: string, options: { small?: boolean }, cb: (qr: string) => void): void;
};

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
  if (options.tunnelUrl?.trim()) return { url: options.tunnelUrl.trim(), kind: "tunnel" };
  if (options.publicUrl?.trim()) return { url: options.publicUrl.trim(), kind: "dev" };
  const lanIp = getLanIPv4();
  if (lanIp) return { url: `http://${lanIp}:${options.port}`, kind: "lan" };
  return { url: null, kind: null };
}

export function buildDevPublicUrl(uiPort: number): string | null {
  const lanIp = getLanIPv4();
  return lanIp ? `http://${lanIp}:${uiPort}` : null;
}

function firewallHint(ports: number[]): string | null {
  if (platform() !== "win32") return null;
  return pc.dim(
    translateLog("startup.firewall", {
      ports: ports.join(", "),
    }),
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

  lines.push(kv(translateLog("startup.desktop"), desktopUrl, pc.cyan));
  if (scanUrl && scanKind === "dev") {
    lines.push(kv(translateLog("startup.phone"), scanUrl, (s) => pc.bold(pc.green(s))));
  } else if (scanUrl) {
    lines.push(kv(translateLog("startup.scan"), scanUrl, (s) => pc.bold(pc.green(s))));
  }
  lines.push(kv(translateLog("startup.api"), `127.0.0.1:${port}`, pc.dim));
  lines.push(kv(translateLog("startup.pin"), pinText, pinGenerated ? pc.yellow : pc.dim));
  lines.push("");
  lines.push(
    pc.dim(
      translateLog(devMode ? "startup.data" : "startup.home", {
        path: home,
      }),
    ),
  );
  if (!devMode) lines.push(pc.dim(translateLog("startup.database", { path: database })));

  console.log(
    boxen(lines.join("\n"), {
      title: devMode ? pc.cyan(translateLog("startup.title.dev")) : pc.cyan("supervisor"),
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
        ? pc.bold(translateLog("startup.remote"))
        : scanKind === "dev"
          ? pc.bold(translateLog("startup.mobile.dev"))
          : pc.bold(translateLog("startup.mobile"));
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
    console.log(`  ${pc.dim(translateLog("startup.tip", { port: uiPort }))}`);
    console.log("");
  }

  if (uiDistMissing && !devMode) {
    console.log(`  ${pc.yellow("!")} ${pc.dim(translateLog("startup.uiMissing"))}`);
    console.log("");
  }

  if (tunnelUrl && scanKind === "tunnel") {
    console.log(`  ${pc.dim(translateLog("startup.tunnelRestart"))}`);
    console.log("");
  }
}

export function printTunnelStarting(): void {
  console.log(pc.dim(translateLog("startup.tunnelStarting")));
}

export function printTunnelError(message: string): void {
  console.error(
    `  ${pc.red("×")} ${pc.red(translateLog("startup.tunnelError", { error: message }))}`,
  );
}

export function printExternalAgentAvailability(agents: AgentWithSystemMd[]): void {
  const external = agents.filter((agent) => agent.backendType !== "native");
  if (external.length === 0) return;

  console.log(`  ${pc.bold(translateLog("startup.externalAgents"))}`);
  for (const agent of external) {
    const status = agent.available
      ? pc.green(translateLog("startup.agentReady"))
      : pc.yellow(translateLog("startup.agentMissing"));
    const detail = agent.available
      ? agent.detectedVersion
        ? pc.dim(` (${agent.detectedVersion})`)
        : ""
      : pc.dim(
          translateLog("startup.agentUnavailable", {
            reason: agent.unavailableReason ?? "unavailable",
          }),
        );
    console.log(`    ${pc.dim("·")} ${agent.name}: ${status}${detail}`);
  }
  console.log("");
}

export function warnMissingUiDistStyled(): void {
  // no-op: banner handles this
}
