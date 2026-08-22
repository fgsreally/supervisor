import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInspectorCapture } from "../src/utils/inspector.js";

describe("Inspector capture", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes one redacted log file per payload and can clear it", () => {
    vi.stubEnv("PI_SUPERVISOR_INSPECTOR", "1");
    const root = mkdtempSync(join(tmpdir(), "supervisor-inspector-"));
    const capture = createInspectorCapture({ actor: "session", rootDir: root, sessionId: 42 });

    capture.capture({ authorization: "Bearer secret", messages: [{ content: "hello" }] }, 1);
    capture.capture({ apiKey: "secret-key", answer: "world" }, 2);

    const directory = readdirSync(root)[0];
    expect(directory).toMatch(/^inspector-/);
    const files = readdirSync(join(root, directory));
    expect(files).toHaveLength(2);
    const text = files.map((file) => readFileSync(join(root, directory, file), "utf8")).join("\n");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("secret-key");
    expect(text).not.toContain("Bearer secret");

    capture.clear();
    expect(existsSync(join(root, directory))).toBe(false);
  });
});
