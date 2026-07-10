import { describe, expect, it } from "vitest";
import { normalizeAskToolResult, normalizeStreamingToolResult, parseAskResultFromToolResult } from "../ask-tool";

describe("normalizeAskToolResult", () => {
	it("extracts human summary instead of stringifying full payload", () => {
		const normalized = normalizeAskToolResult({
			content: [{ type: "text", text: "正式专业" }],
			details: {
				questions: [{ id: "q1", label: "Q", prompt: "风格?", options: [] }],
				answers: [{ id: "q1", value: "formal", label: "正式专业" }],
				cancelled: false,
			},
		});

		expect(normalized.content).toEqual([{ type: "text", text: "正式专业" }]);
		expect(normalized.details?.answers?.[0]?.label).toBe("正式专业");
	});
});

describe("normalizeStreamingToolResult", () => {
	it("normalizes ask tool results from agent events", () => {
		const normalized = normalizeStreamingToolResult("ask", {
			content: [{ type: "text", text: "猫娘可爱" }],
			details: {
				answers: [{ id: "q1", value: "neko", label: "猫娘可爱" }],
				cancelled: false,
			},
		});

		expect(normalized.content).toEqual([{ type: "text", text: "猫娘可爱" }]);
		expect(normalized.details).toBeDefined();
	});

	it("still stringifies non-ask unknown objects", () => {
		const normalized = normalizeStreamingToolResult("custom_tool", { foo: "bar" });
		expect(normalized.content[0]?.text).toContain("foo");
	});
});

describe("parseAskResultFromToolResult", () => {
	it("unwraps JSON wrapper stored in content text", () => {
		const details = parseAskResultFromToolResult({
			content: [
				{
					type: "text",
					text: JSON.stringify({
						content: [{ type: "text", text: "正式专业" }],
						details: {
							answers: [{ id: "doc-style", value: "formal", label: "正式专业" }],
							cancelled: false,
						},
					}),
				},
			],
		});

		expect(details?.answers?.[0]?.label).toBe("正式专业");
	});
});
