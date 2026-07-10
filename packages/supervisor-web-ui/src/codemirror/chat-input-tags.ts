import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { findChatTokens } from "../utils/chat-token-patterns";
import {
	fileIconSvg,
	getFileBaseName,
	getFileIconKind,
	getFilePathFromToken,
	getSkillNameFromToken,
	skillIconSvg,
} from "../utils/file-type-icon";

class FileTagWidget extends WidgetType {
	constructor(readonly token: string) {
		super();
	}

	eq(other: FileTagWidget): boolean {
		return other.token === this.token;
	}

	toDOM(): HTMLElement {
		const path = getFilePathFromToken(this.token);
		const kind = getFileIconKind(path);
		return buildTagElement("file", fileIconSvg(kind), getFileBaseName(path));
	}

	ignoreEvent(): boolean {
		return false;
	}
}

class SkillTagWidget extends WidgetType {
	constructor(readonly token: string) {
		super();
	}

	eq(other: SkillTagWidget): boolean {
		return other.token === this.token;
	}

	toDOM(): HTMLElement {
		return buildTagElement("skill", skillIconSvg(), getSkillNameFromToken(this.token));
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function buildTagElement(variant: "file" | "skill", iconSvg: string, label: string): HTMLElement {
	const span = document.createElement("span");
	span.className = `cm-chat-tag cm-chat-tag--${variant}`;
	span.contentEditable = "false";

	const icon = document.createElement("span");
	icon.className = "cm-chat-tag-icon";
	icon.innerHTML = iconSvg;

	const text = document.createElement("span");
	text.className = "cm-chat-tag-label";
	text.textContent = label;

	span.appendChild(icon);
	span.appendChild(text);
	return span;
}

function buildTagDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const text = view.state.doc.toString();
	for (const token of findChatTokens(text)) {
		const widget = token.kind === "file" ? new FileTagWidget(token.text) : new SkillTagWidget(token.text);
		builder.add(
			token.from,
			token.to,
			Decoration.replace({
				widget,
				inclusive: false,
			}),
		);
	}
	return builder.finish();
}

export const chatInputTagExtension = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildTagDecorations(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) {
				this.decorations = buildTagDecorations(update.view);
			}
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);

export function chatInputTheme(editorHeightPx: number) {
	return EditorView.theme({
		"&": {
			backgroundColor: "transparent",
			fontSize: "14px",
			height: "100%",
		},
		"&.cm-focused": { outline: "none" },
		".cm-content": {
			fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
			fontSize: "14px",
			lineHeight: "1.625",
			caretColor: "var(--app-cm-caret)",
			color: "var(--app-cm-text)",
			padding: "10px 14px 6px",
			minHeight: `${Math.max(40, editorHeightPx - 8)}px`,
		},
		".cm-scroller": {
			height: "100%",
			maxHeight: `${Math.max(40, editorHeightPx - 8)}px`,
			overflow: "auto",
			fontFamily: "inherit",
		},
		".cm-line": { padding: "0" },
		".cm-cursor": { borderLeftWidth: "2px" },
		".cm-chat-tag": {
			display: "inline-flex",
			alignItems: "center",
			gap: "4px",
			verticalAlign: "baseline",
			borderRadius: "4px",
			padding: "1px 6px 1px 4px",
			margin: "0 2px",
			fontSize: "13px",
			lineHeight: "1.4",
			userSelect: "none",
		},
		".cm-chat-tag--file": {
			backgroundColor: "var(--app-tag-file-bg)",
			color: "var(--app-tag-file-fg)",
		},
		".cm-chat-tag--skill": {
			backgroundColor: "var(--app-tag-skill-bg)",
			color: "var(--app-tag-skill-fg)",
			fontWeight: "500",
		},
		".cm-chat-tag-icon": {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: "0",
			opacity: "1",
		},
		".cm-chat-tag--skill .cm-chat-tag-icon": {
			color: "#ff9f1a",
		},
		".cm-chat-tag-label": {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			maxWidth: "240px",
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap",
		},
		".cm-chat-tag--skill .cm-chat-tag-label": {
			fontFamily: "inherit",
		},
	});
}
