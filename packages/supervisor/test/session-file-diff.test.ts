import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/http/session-file-diff.js";

describe("session-file-diff", () => {
  it("parseUnifiedDiff maps unified diff to inline lines with line numbers", () => {
    const raw = [
      "diff --git a/foo.ts b/foo.ts",
      "index abc..def 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,3 @@",
      " context one",
      "-deleted line",
      "+added line",
      " context two",
    ].join("\n");

    const { lines, truncated } = parseUnifiedDiff(raw);
    expect(truncated).toBe(false);
    expect(lines).toEqual([
      { type: "context", content: "context one", oldLineNo: 1, newLineNo: 1 },
      { type: "del", content: "deleted line", oldLineNo: 2 },
      { type: "add", content: "added line", newLineNo: 2 },
      { type: "context", content: "context two", oldLineNo: 3, newLineNo: 3 },
    ]);
  });

  it("parseUnifiedDiff truncates long diffs", () => {
    const body = Array.from({ length: 10 }, (_, i) => ` line ${i}`).join("\n");
    const raw = `@@ -1,10 +1,10 @@\n${body}`;
    const { lines, truncated } = parseUnifiedDiff(raw, 3);
    expect(lines).toHaveLength(3);
    expect(truncated).toBe(true);
  });
});
