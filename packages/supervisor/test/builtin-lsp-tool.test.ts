import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOverrideLspTool } from "../src/extension-system/extensions/lsp/tool.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `supervisor-lsp-${Date.now()}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

function parseToolText(result: { content: Array<{ type: string; text?: string }> }) {
	const text = result.content.find((part) => part.type === "text")?.text;
	if (!text) throw new Error("missing tool text");
	return JSON.parse(text) as Record<string, unknown>;
}

describe("supervisor: override-lsp-tool", () => {
	it("rename applies cross-file symbol rename", async () => {
		writeFileSync(
			join(tmpDir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					target: "ES2022",
					module: "Node16",
					moduleResolution: "Node16",
				},
				include: ["*.ts"],
			}),
		);
		writeFileSync(join(tmpDir, "util.ts"), `export function oldHelper() { return 1; }\n`);
		writeFileSync(join(tmpDir, "main.ts"), `import { oldHelper } from "./util.js";\noldHelper();\n`);

		const tool = createOverrideLspTool(tmpDir);
		const result = await tool.execute("tc-rename", {
			action: "rename",
			path: "util.ts",
			line: 1,
			character: 18,
			newName: "newHelper",
		});

		const body = parseToolText(result);
		expect(body.action).toBe("rename");
		expect(body.locationsUpdated).toBeGreaterThan(0);

		expect(readFileSync(join(tmpDir, "util.ts"), "utf8")).toContain("newHelper");
		expect(readFileSync(join(tmpDir, "main.ts"), "utf8")).toContain("newHelper");
	});

	it("diagnostics reports type errors after edit", async () => {
		writeFileSync(join(tmpDir, "bad.ts"), `const value: number = "not-a-number";\n`);

		const tool = createOverrideLspTool(tmpDir);
		const result = await tool.execute("tc-diag", {
			action: "diagnostics",
			path: "bad.ts",
		});

		const body = parseToolText(result);
		expect(body.action).toBe("diagnostics");
		expect(body.count).toBeGreaterThan(0);
		const diagnostics = body.diagnostics as Array<{ message: string }>;
		expect(diagnostics.some((item) => item.message.length > 0)).toBe(true);
	});
});
