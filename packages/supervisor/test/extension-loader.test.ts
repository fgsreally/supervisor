import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAndLoadExtensions } from "../src/extension-system/loader.js";
import {
	enablePackagedToolForAgent,
	listEnabledPackagedToolIds,
} from "../src/tools/loader.js";

describe("supervisor: extension loader", () => {
	it("does not load packaged tools as extensions", async () => {
		const tmp = join(tmpdir(), `sup-ext-loader-empty-${Date.now()}`);
		mkdirSync(tmp, { recursive: true });

		const result = await discoverAndLoadExtensions({
			agentHomeDir: tmp,
			cwd: tmp,
		});

		expect(result.errors).toHaveLength(0);
		expect(result.extensions).toHaveLength(0);

		rmSync(tmp, { recursive: true, force: true });
	});

	it("loads real extensions and ignores legacy packaged tool dirs", async () => {
		const tmp = join(tmpdir(), `sup-ext-loader-${Date.now()}`);
		mkdirSync(join(tmp, "extensions"), { recursive: true });
		mkdirSync(join(tmp, "extensions", "lsp"), { recursive: true });
		const customDir = join(tmp, "extensions", "custom");
		mkdirSync(customDir, { recursive: true });
		const custom = join(customDir, "index.ts");
		writeFileSync(
			custom,
			`import { defineExtension } from "@earendil-works/pi-supervisor";
export default defineExtension({ name: "custom-test", setup() {} });`,
		);

		const result = await discoverAndLoadExtensions({
			agentHomeDir: tmp,
			cwd: tmp,
		});

		expect(result.errors).toHaveLength(0);
		expect(result.extensions.map((ext) => ext.definition.name)).toEqual(["custom-test"]);

		enablePackagedToolForAgent(tmp, "lsp");
		expect(listEnabledPackagedToolIds(tmp)).toContain("lsp");

		rmSync(tmp, { recursive: true, force: true });
	}, 15000);
});
