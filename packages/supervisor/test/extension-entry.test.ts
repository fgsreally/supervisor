import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	requireExtensionEntry,
	resolveExtensionEntry,
	resolveExtensionEntries,
} from "../src/extension/index.js";

describe("extension entry resolution", () => {
	it("uses package.json main when present", () => {
		const root = join(tmpdir(), `ext-main-${Date.now()}`);
		mkdirSync(root, { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "demo", main: "./src/index.ts" }),
			"utf8",
		);
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "index.ts"), "export default {}", "utf8");

		expect(resolveExtensionEntry(root)).toBe(join(root, "src", "index.ts"));
		expect(resolveExtensionEntries(root)).toHaveLength(1);
		expect(requireExtensionEntry(root)).toBe(join(root, "src", "index.ts"));

		rmSync(root, { recursive: true, force: true });
	});

	it("falls back to index.ts", () => {
		const root = join(tmpdir(), `ext-index-${Date.now()}`);
		mkdirSync(root, { recursive: true });
		writeFileSync(join(root, "index.ts"), "export default {}", "utf8");

		expect(resolveExtensionEntry(root)).toBe(join(root, "index.ts"));

		rmSync(root, { recursive: true, force: true });
	});
});
