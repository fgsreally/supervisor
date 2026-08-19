import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSessionUserPrompt,
  PASTED_TEXT_INLINE_LIMIT,
} from "../src/core/session/session-pasted-text.js";

let home: string | undefined;

afterEach(async () => {
  if (home) await rm(home, { recursive: true, force: true });
  home = undefined;
  delete process.env.SUPERVISOR_HOME;
});

describe("session pasted text prompts", () => {
  it("keeps short pasted text inline and escapes XML", async () => {
    const result = await buildSessionUserPrompt(1, 2, "before \uE000paste:p1\uE001 after", [
      { id: "p1", text: '<log>&"' },
    ]);

    expect(result.parts[0]).toMatchObject({ mode: "inline" });
    expect(result.message).toContain("&lt;log&gt;&amp;&quot;");
    expect(result.message).toContain('mode="inline"');
  });

  it("writes long pasted text below the session-owned directory", async () => {
    home = await mkdtemp(join(tmpdir(), "supervisor-paste-test-"));
    process.env.SUPERVISOR_HOME = home;
    const text = "x".repeat(PASTED_TEXT_INLINE_LIMIT + 1);
    const result = await buildSessionUserPrompt(3, 4, "\uE000paste:p1\uE001", [{ id: "p1", text }]);

    expect(result.parts[0]?.mode).toBe("attachment");
    const attachmentPath = result.parts[0]?.path;
    expect(attachmentPath).toMatch(/^@\/attachments\/paste-.+\.txt$/);
    const files = await readdir(join(home, "projects", "3", "sessions", "4", "attachments"));
    expect(files).toHaveLength(1);
    expect(
      await readFile(
        join(home, "projects", "3", "sessions", "4", "attachments", files[0]!),
        "utf8",
      ),
    ).toBe(text);
  });

  it("passes uploaded attachments as safe session-relative XML references", async () => {
    const result = await buildSessionUserPrompt(
      3,
      4,
      "请检查 \uE000attachment:a1\uE001",
      [],
      [
        {
          id: "a1",
          name: "report.pdf",
          path: "@/attachments/attachment-a1-report.pdf",
          mimeType: "application/pdf",
          size: 1234,
        },
      ],
    );

    expect(result.message).toContain(
      '<attachment id="a1" name="report.pdf" mimeType="application/pdf" size="1234" path="@/attachments/attachment-a1-report.pdf" />',
    );
    expect(result.message).toContain("请检查");
    expect(result.message).not.toContain("<text>");
  });
});
