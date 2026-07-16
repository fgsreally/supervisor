import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import extension from "../index.js";
import { computeBankScope } from "../bank.js";
import { loadHindsightConfig, resolveMemoryMode } from "../config.js";
import { extractFactsFromMessages, recallLocalByQuery, retainLocalFacts } from "../local-store.js";

describe("@earendil-works/supervisor-hindsight", () => {
  it("exports supervisor-hindsight extension", () => {
    expect(extension.name).toBe("supervisor-hindsight");
    expect(typeof extension.setup).toBe("function");
  });

  it("defaults to local fallback when API URL is unset", () => {
    const prev = process.env.HINDSIGHT_API_URL;
    delete process.env.HINDSIGHT_API_URL;
    const config = loadHindsightConfig({ ...process.env, HINDSIGHT_LOCAL_FALLBACK: "true" });
    expect(resolveMemoryMode(config)).toBe("local");
    if (prev !== undefined) process.env.HINDSIGHT_API_URL = prev;
  });

  it("uses API mode when HINDSIGHT_API_URL is set", () => {
    const config = loadHindsightConfig({
      ...process.env,
      HINDSIGHT_API_URL: "http://127.0.0.1:9999",
    });
    expect(resolveMemoryMode(config)).toBe("api");
    const scope = computeBankScope(config, "/workspace/my-app");
    expect(scope.bankId).toContain("supervisor");
    expect(scope.recallTags?.[0]).toBe("project:my-app");
  });

  it("retains and recalls local jsonl memories", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hindsight-ext-"));
    try {
      await retainLocalFacts(dir, "session-1", [
        { content: "The project uses SQLite for persistence." },
      ]);
      await extractFactsFromMessages(
        [
          {
            role: "assistant",
            content: "The project uses SQLite for persistence. Updated the implementation.",
          },
        ],
        dir,
        "session-2",
      );

      const file = readFileSync(join(dir, "hindsight.jsonl"), "utf-8");
      expect(file).toContain("SQLite for persistence");

      const recalled = recallLocalByQuery(dir, "SQLite persistence");
      expect(recalled.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
