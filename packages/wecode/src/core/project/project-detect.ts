import { readdirSync } from "node:fs";

/**
 * Browser-accessible HTML entries at the project root (dev servers such as Vite
 * serve them at /<file>.html). Sorted with index.html first.
 */
export function detectHtmlEntries(cwd: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(cwd, { withFileTypes: true })
      .filter((item) => item.isFile() && /\.html?$/i.test(item.name))
      .map((item) => item.name);
  } catch {
    return [];
  }
  return entries.sort((a, b) =>
    a.toLowerCase() === "index.html"
      ? -1
      : b.toLowerCase() === "index.html"
        ? 1
        : a.localeCompare(b),
  );
}
