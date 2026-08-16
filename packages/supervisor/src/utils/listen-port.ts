/** Parse the actual listen port from Vite/webpack-style ready output. */
export function detectListenPort(output: string): number | undefined {
  const patterns = [
    /Local:\s+https?:\/\/[^:\s]+:(\d{2,5})/i,
    /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})/i,
    /listening(?:\s+on)?(?:\s+port)?\s+(\d{2,5})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(output);
    if (!match?.[1]) continue;
    const port = Number.parseInt(match[1], 10);
    if (Number.isFinite(port) && port > 0 && port < 65536) return port;
  }
  return undefined;
}
