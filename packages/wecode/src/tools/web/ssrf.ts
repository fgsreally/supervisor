import { lookup } from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "kubernetes.default.svc",
  "localhost",
]);

const BLOCKED_IPV4_PREFIXES = ["10.", "0."];

const BLOCKED_IPV4_RANGES: Array<{ start: number; end: number }> = [
  { start: ip4ToInt("172.16.0.0"), end: ip4ToInt("172.31.255.255") },
  { start: ip4ToInt("192.168.0.0"), end: ip4ToInt("192.168.255.255") },
  { start: ip4ToInt("169.254.0.0"), end: ip4ToInt("169.254.255.255") },
  { start: ip4ToInt("100.64.0.0"), end: ip4ToInt("100.127.255.255") },
  { start: ip4ToInt("127.0.0.0"), end: ip4ToInt("127.255.255.255") },
];

function ip4ToInt(ip: string): number {
  const parts = ip.split(".");
  return ((+parts[0]! << 24) | (+parts[1]! << 16) | (+parts[2]! << 8) | +parts[3]!) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  for (const prefix of BLOCKED_IPV4_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  const n = ip4ToInt(ip);
  for (const range of BLOCKED_IPV4_RANGES) {
    if (n >= range.start && n <= range.end) return true;
  }
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]!);
  const hexMapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = Number.parseInt(hexMapped[1]!, 16);
    const lo = Number.parseInt(hexMapped[2]!, 16);
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isBlockedIPv4(ipv4);
  }
  return false;
}

const MAX_REDIRECTS = 5;

export async function assertSafeUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme "${parsed.protocol}" — only http(s) allowed`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new Error(`SSRF protection: blocked hostname "${hostname}"`);
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isBlockedIPv4(hostname)) {
      throw new Error(`SSRF protection: blocked private/internal IP "${hostname}"`);
    }
    return;
  }

  if (hostname.includes(":")) {
    if (isBlockedIPv6(hostname)) {
      throw new Error(`SSRF protection: blocked private/internal IPv6 "${hostname}"`);
    }
    return;
  }

  try {
    const { address, family } = await lookup(hostname);
    if (family === 4 && isBlockedIPv4(address)) {
      throw new Error(
        `SSRF protection: hostname "${hostname}" resolves to blocked IP "${address}"`,
      );
    }
    if (family === 6 && isBlockedIPv6(address)) {
      throw new Error(
        `SSRF protection: hostname "${hostname}" resolves to blocked IPv6 "${address}"`,
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("SSRF protection:")) throw error;
    throw new Error(`SSRF protection: DNS resolution failed for "${hostname}"`);
  }
}

export async function safeFetch(
  url: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  await assertSafeUrl(url);
  let currentUrl = url;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const response = await fetchImpl(currentUrl, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, currentUrl).toString();
      await assertSafeUrl(currentUrl);
      continue;
    }
    return response;
  }
  throw new Error("SSRF protection: too many redirects");
}
