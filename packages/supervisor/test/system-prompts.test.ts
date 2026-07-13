import { describe, expect, it } from "vitest";
import {
	appendPromptSection,
	appendReadOrchestrationHint,
	getPackagedPromptsDir,
	loadPromptTemplate,
	renderPromptTemplate,
} from "../src/agent/system-prompts.js";

describe("supervisor: system-prompts", () => {
	it("loads templates from packaged prompts directory", () => {
		expect(getPackagedPromptsDir()).toContain("prompts");
		expect(loadPromptTemplate("reading-strategy")).toContain("Reading strategy (two-phase)");
	});

	it("renders variable placeholders", () => {
		const rendered = renderPromptTemplate("context-file-section", {
			path: "/tmp/AGENTS.md",
			content: "hello",
		});
		expect(rendered).toContain("# Context File: /tmp/AGENTS.md");
		expect(rendered).toContain("hello");
	});

	it("appendReadOrchestrationHint adds guidance once", () => {
		const once = appendReadOrchestrationHint("base prompt");
		expect(once).toContain("Reading strategy (two-phase)");
		const twice = appendReadOrchestrationHint(once);
		expect(twice).toBe(once);
	});

	it("appendPromptSection dedupes by marker", () => {
		const once = appendPromptSection("base", "skills-preamble", "The following skills");
		const twice = appendPromptSection(once, "skills-preamble", "The following skills");
		expect(twice).toBe(once);
	});
});
