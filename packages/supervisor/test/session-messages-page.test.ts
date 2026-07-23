import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SupervisorDb } from "../src/db/db.js";
import { SQLiteSessionStorage } from "../src/core/session-storage.js";
import {
  getSessionMessageByEntryId,
  querySessionMessagesPage,
} from "../src/core/session-message-query.js";
import { LITE_TOOL_RESULT_CHARS, toLiteSessionMessage } from "../src/core/session-message-lite.js";
import type { SessionMessageResponse } from "../src/types.js";

describe("session message pagination + lite", () => {
  it("pages newest-first with beforeId and truncates tool results in lite view", async () => {
    const dir = join(tmpdir(), `supervisor-msg-page-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const db = new SupervisorDb(join(dir, "test.db"));
    try {
      const session = db.insert({
        project_id: null,
        parent_id: null,
        session_id: null,
        pid: null,
        status: "idle",
        cwd: dir,
        meta: "{}",
      });
      const storage = new SQLiteSessionStorage(db, session.id);

      for (let i = 0; i < 5; i++) {
        await storage.appendEntry({
          id: `user-${i}`,
          parentId: i === 0 ? null : `tool-${i - 1}`,
          timestamp: new Date().toISOString(),
          type: "message",
          message: { role: "user", content: `hello ${i}`, timestamp: Date.now() },
        });
        await storage.appendEntry({
          id: `assistant-${i}`,
          parentId: `user-${i}`,
          timestamp: new Date().toISOString(),
          type: "message",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: `reply ${i}` },
              {
                type: "toolCall",
                id: `call-${i}`,
                name: "bash",
                arguments: { command: "echo hi" },
              },
            ],
            timestamp: Date.now(),
          },
        });
        await storage.appendEntry({
          id: `tool-${i}`,
          parentId: `assistant-${i}`,
          timestamp: new Date().toISOString(),
          type: "toolResult",
          toolCallId: `call-${i}`,
          toolName: "bash",
          content: [{ type: "text", text: "x".repeat(LITE_TOOL_RESULT_CHARS + 200) }],
          isError: false,
        } as never);
      }

      const page = querySessionMessagesPage(db, session.id, { limit: 4, view: "lite" });
      expect(page.messages.length).toBeGreaterThanOrEqual(4);
      expect(page.hasMore).toBe(true);
      expect(page.oldestRowId).not.toBeNull();

      const tool = page.messages.find((m) => m.type === "toolResult") as SessionMessageResponse & {
        content?: Array<{ text?: string }>;
      };
      expect(tool).toBeTruthy();
      expect(tool.meta?.liteTruncated).toBe(true);
      const text = tool.content?.[0]?.text ?? "";
      expect(text.length).toBeLessThanOrEqual(LITE_TOOL_RESULT_CHARS + 10);

      const older = querySessionMessagesPage(db, session.id, {
        limit: 20,
        beforeId: page.oldestRowId!,
        view: "lite",
      });
      expect(older.messages.length).toBeGreaterThan(0);
      expect(older.newestRowId!).toBeLessThan(page.oldestRowId!);

      const full = getSessionMessageByEntryId(db, session.id, tool.id);
      expect(full).toBeTruthy();
      const fullText =
        (full as SessionMessageResponse & { content?: Array<{ text?: string }> }).content?.[0]
          ?.text ?? "";
      expect(fullText.length).toBe(LITE_TOOL_RESULT_CHARS + 200);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("toLiteSessionMessage strips image data", () => {
    const lite = toLiteSessionMessage({
      id: "u1",
      parentId: null,
      type: "message",
      isOld: false,
      source: null,
      origin: null,
      meta: {},
      createdAt: 1,
      message: {
        role: "user",
        content: [
          { type: "text", text: "see" },
          { type: "image", mimeType: "image/png", data: "base64-huge" },
        ],
      },
    } as SessionMessageResponse);
    const parts = (lite.message as { content: Array<{ type: string; data?: string }> }).content;
    const image = parts.find((p) => p.type === "image");
    expect(image?.data).toBe("");
    expect(lite.meta.liteTruncated).toBe(true);
  });
});
