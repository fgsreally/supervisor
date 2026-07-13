import type { ExtensionEvent } from "../../extension-system/types.js";
import type { ExtensionRuntime } from "../../extension-system/runtime.js";
import { minimizeOutput } from "./minimizer.js";

export function attachOutputMinimizerHook(runtime: ExtensionRuntime): void {
	runtime.on(
		"tool.after_call",
		(event: Extract<ExtensionEvent, { type: "tool.after_call" }>) => {
			if (
				event.result.isError ||
				event.name !== "bash" ||
				typeof event.setResult !== "function"
			) {
				return;
			}
			const textBlocks = event.result.content.filter(
				(block): block is { type: string; text: string } =>
					block.type === "text" && typeof block.text === "string",
			);
			if (textBlocks.length === 0) return;

			const details = event.result.details as
				| { engine?: string; minimized?: string }
				| undefined;
			if (details?.engine === "pi-natives" && details.minimized) {
				return;
			}

			const output = textBlocks.map((block) => block.text).join("\n");
			if (output.includes("[raw output minimized by")) {
				return;
			}
			const args = event.args as { command?: unknown; cmd?: unknown } | undefined;
			const command =
				typeof args?.command === "string"
					? args.command
					: typeof args?.cmd === "string"
						? args.cmd
						: event.name;
			const minimized = minimizeOutput(command, output);
			if (!minimized.minimized) return;
			event.setResult({
				content: [{ type: "text", text: minimized.text }],
				details: {
					minimized: true,
					originalLines: minimized.originalLines,
					minimizedLines: minimized.minimizedLines,
					filter: minimized.filterName,
				},
			});
		},
	);
}
