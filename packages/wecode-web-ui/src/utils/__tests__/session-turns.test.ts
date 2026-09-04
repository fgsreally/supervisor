import { describe, expect, it } from "vitest";
import type { ChatEntry } from "@/types/chat-entry";
import { chatEntriesToTurns } from "../session-turns";
import { MemoryMessageStorage } from "../message-storage";

describe("chatEntriesToTurns", () => {
  it("maps each user message to one turn tick", () => {
    const entries = [
      {
        id: "u1",
        type: "message",
        createdAt: 1,
        message: { role: "user", content: "你好世界" },
      },
      {
        id: "a1",
        type: "message",
        createdAt: 2,
        message: { role: "assistant", content: "收到" },
      },
      {
        id: "u2",
        type: "message",
        createdAt: 3,
        message: { role: "user", content: "第二问" },
      },
    ] as ChatEntry[];

    const turns = chatEntriesToTurns("s1", entries);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      sessionId: "s1",
      turnId: "u1",
      userEntryId: "u1",
      summary: "你好世界",
    });
    expect(turns[1]?.turnId).toBe("u2");
  });

  it("skips injected user messages", () => {
    const entries = [
      {
        id: "u1",
        type: "message",
        injectedSource: "system",
        message: { role: "user", content: "hidden" },
      },
    ] as ChatEntry[];
    expect(chatEntriesToTurns("s1", entries)).toEqual([]);
  });
});

describe("MemoryMessageStorage pruneDeletedSessions", () => {
  it("removes local caches missing from remote list", async () => {
    const storage = new MemoryMessageStorage();
    await storage.init();
    await storage.upsertTurns("keep", [
      {
        sessionId: "keep",
        turnId: "t1",
        userEntryId: "t1",
        summary: "a",
        createdAt: 1,
        roleHint: "user",
      },
    ]);
    await storage.upsertTurns("gone", [
      {
        sessionId: "gone",
        turnId: "t2",
        userEntryId: "t2",
        summary: "b",
        createdAt: 2,
        roleHint: "user",
      },
    ]);
    await storage.putSyncMeta({
      sessionId: "gone",
      oldestRowId: 1,
      newestRowId: 2,
      hasMore: false,
      updatedAt: Date.now(),
    });

    const removed = await storage.pruneDeletedSessions(["keep"]);
    expect(removed).toEqual(["gone"]);
    expect(await storage.listTurns("gone")).toEqual([]);
    expect(await storage.getSyncMeta("gone")).toBeNull();
    expect(await storage.listTurns("keep")).toHaveLength(1);
  });
});
