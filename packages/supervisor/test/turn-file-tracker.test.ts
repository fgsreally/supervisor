import { describe, expect, it } from "vitest";
import { handleAgentEventForTurnFiles, normalizeFilePath, TurnFileTracker } from "../src/turn-file-tracker.js";

describe("supervisor: TurnFileTracker", () => {
	it("normalizeFilePath returns relative path under cwd", () => {
		expect(normalizeFilePath("/proj", "src/foo.ts")).toBe("src/foo.ts");
	});

	it("records write as added when file did not exist", () => {
		const tracker = new TurnFileTracker("/proj", 0);
		tracker.startTurn();
		tracker.onToolStart("tc1", "write", { path: "new-file.ts" });
		tracker.onToolEnd("tc1", "write", false);
		const turn = tracker.finishTurn();
		expect(turn.files.added).toEqual(["new-file.ts"]);
		expect(turn.files.modified).toEqual([]);
	});

	it("records edit as modified", () => {
		const tracker = new TurnFileTracker("/proj", 0);
		tracker.startTurn();
		tracker.onToolStart("tc1", "edit", { path: "src/existing.ts", edits: [{ oldText: "a", newText: "b" }] });
		tracker.onToolEnd("tc1", "edit", false);
		const turn = tracker.finishTurn();
		expect(turn.files.modified).toEqual(["src/existing.ts"]);
	});

	it("skips failed tool calls", () => {
		const tracker = new TurnFileTracker("/proj", 0);
		tracker.startTurn();
		tracker.onToolStart("tc1", "write", { path: "fail.ts" });
		tracker.onToolEnd("tc1", "write", true);
		const turn = tracker.finishTurn();
		expect(turn.files.added).toEqual([]);
	});

	it("parses bash rm as deleted", () => {
		const tracker = new TurnFileTracker("/proj", 0);
		tracker.startTurn();
		tracker.onToolStart("tc1", "bash", { command: "rm src/old.ts" });
		tracker.onToolEnd("tc1", "bash", false);
		const turn = tracker.finishTurn();
		expect(turn.files.deleted).toEqual(["src/old.ts"]);
	});

	it("handleAgentEventForTurnFiles returns turn on agent_end", () => {
		const tracker = new TurnFileTracker("/proj", 0);
		handleAgentEventForTurnFiles(tracker, { type: "agent_start" });
		handleAgentEventForTurnFiles(tracker, {
			type: "tool_execution_start",
			toolCallId: "tc1",
			toolName: "edit",
			args: { path: "a.ts", edits: [{ oldText: "x", newText: "y" }] },
		});
		handleAgentEventForTurnFiles(tracker, {
			type: "tool_execution_end",
			toolCallId: "tc1",
			toolName: "edit",
			result: {},
			isError: false,
		});
		const turn = handleAgentEventForTurnFiles(tracker, { type: "agent_end", messages: [] });
		expect(turn?.files.modified).toEqual(["a.ts"]);
		expect(turn?.index).toBe(0);
	});
});
