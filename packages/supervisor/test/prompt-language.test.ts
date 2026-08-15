import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const resourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../resource");

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

describe("packaged prompt language", () => {
  it("keeps prompt and built-in Agent resources in English", () => {
    const files = [
      ...markdownFiles(join(resourceRoot, "prompts")),
      ...markdownFiles(join(resourceRoot, "agents")),
    ];
    const nonEnglish = files.filter((file) => /[\u4e00-\u9fff]/u.test(readFileSync(file, "utf8")));
    expect(nonEnglish).toEqual([]);
  });
});
