import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendRotatingTextLog } from "../src/utils/text-log.js";

describe("rotating text log", () => {
  it("keeps the newest complete lines within the byte limit", () => {
    const dir = mkdtempSync(join(tmpdir(), "supervisor-log-"));
    const path = join(dir, "events.log");

    appendRotatingTextLog(path, "old line", 24);
    appendRotatingTextLog(path, "new line", 24);
    appendRotatingTextLog(path, "newest line", 24);

    const text = readFileSync(path, "utf8");
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(24);
    expect(text).toContain("newest line");
    expect(text).not.toContain("old line");
  });
});
