import { Facet, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { findChatTokens } from "../utils/chat-token-patterns";
import {
  fileIconSvg,
  getFileBaseName,
  getFileIconKind,
  getFilePathFromToken,
  getSkillNameFromToken,
} from "../utils/file-type-icon";
import { getExternalProjectSource } from "../utils/project-path";
import {
  normalizeSlashCommandName,
  resolveSlashCommandSource,
  slashSourceIconSvg,
  type SlashCommandCatalog,
  type SlashCommandSource,
} from "../utils/slash-command-source";
import { useSessionStore } from "@/store";

export const slashCatalogFacet = Facet.define<SlashCommandCatalog, SlashCommandCatalog>({
  combine: (values) =>
    values.at(-1) ?? {
      skills: [],
      prompts: [],
      commands: [],
    },
});

export const pastedTextCatalogFacet = Facet.define<
  Record<string, { chars: number }>,
  Record<string, { chars: number }>
>({ combine: (values) => values.at(-1) ?? {} });

export const attachmentCatalogFacet = Facet.define<
  Record<string, { name: string; size: number }>,
  Record<string, { name: string; size: number }>
>({ combine: (values) => values.at(-1) ?? {} });

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
    let source: string | undefined;
    try {
      const sessionStore = useSessionStore();
      source =
        getExternalProjectSource(
          path,
          sessionStore.projects.map((p) => ({ id: p.id, name: p.name, cwd: p.cwd })),
          sessionStore.currentSession?.cwd,
        ) ?? undefined;
    } catch {
      source = undefined;
    }
    return buildFileTagElement(fileIconSvg(kind), getFileBaseName(path), source);
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class SlashTagWidget extends WidgetType {
  constructor(
    readonly token: string,
    readonly slashSource: SlashCommandSource,
  ) {
    super();
  }

  eq(other: SlashTagWidget): boolean {
    return other.token === this.token && other.slashSource === this.slashSource;
  }

  toDOM(): HTMLElement {
    const label = normalizeSlashCommandName(this.token);
    return buildSlashTagElement(this.slashSource, label);
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class PastedTextTagWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly chars: number,
  ) {
    super();
  }

  eq(other: PastedTextTagWidget): boolean {
    return other.id === this.id && other.chars === this.chars;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-chat-tag cm-chat-tag--pasted";
    span.contentEditable = "false";
    span.setAttribute("role", "button");
    span.setAttribute("tabindex", "0");
    span.textContent = `粘贴文本 · ${this.chars} 字`;
    span.addEventListener("click", () => {
      span.dispatchEvent(
        new CustomEvent("chat-pasted-text-open", { bubbles: true, detail: this.id }),
      );
    });
    span.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        span.click();
      }
    });
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class ImageTagWidget extends WidgetType {
  constructor(readonly token: string) {
    super();
  }

  eq(other: ImageTagWidget): boolean {
    return other.token === this.token;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-chat-tag cm-chat-tag--image";
    span.contentEditable = "false";
    span.textContent = this.token.slice(1, -1);
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class AttachmentTagWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly size: number,
  ) {
    super();
  }

  eq(other: AttachmentTagWidget): boolean {
    return other.id === this.id && other.name === this.name && other.size === this.size;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-chat-tag cm-chat-tag--attachment";
    span.contentEditable = "false";
    span.textContent = `${this.name} · ${formatAttachmentSize(this.size)}`;
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFileTagElement(iconSvg: string, label: string, source?: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "cm-chat-tag cm-chat-tag--file";
  span.contentEditable = "false";

  const icon = document.createElement("span");
  icon.className = "cm-chat-tag-icon";
  icon.innerHTML = iconSvg;
  span.appendChild(icon);

  if (source) {
    const sourceEl = document.createElement("span");
    sourceEl.className = "cm-chat-tag-source";
    sourceEl.textContent = source;
    span.appendChild(sourceEl);
  }

  const text = document.createElement("span");
  text.className = "cm-chat-tag-label";
  text.textContent = label;
  span.appendChild(text);
  return span;
}

/** Match UserMessageRow `.slash-command-tag--*` look. */
function buildSlashTagElement(source: SlashCommandSource, label: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `cm-chat-tag cm-chat-tag--slash cm-chat-tag--slash-${source}`;
  span.contentEditable = "false";

  const icon = document.createElement("span");
  icon.className = "cm-chat-tag-icon";
  icon.innerHTML = slashSourceIconSvg(source);
  span.appendChild(icon);

  const text = document.createElement("strong");
  text.className = "cm-chat-tag-label";
  text.textContent = label;
  span.appendChild(text);
  return span;
}

function buildTagDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decorations: Array<[number, number, Decoration]> = [];
  const text = view.state.doc.toString();
  const catalog = view.state.facet(slashCatalogFacet);
  const pastedTexts = view.state.facet(pastedTextCatalogFacet);
  const attachments = view.state.facet(attachmentCatalogFacet);

  const pastedRe = /\uE000paste:([a-zA-Z0-9_-]+)\uE001/g;
  for (const match of text.matchAll(pastedRe)) {
    const item = pastedTexts[match[1]!];
    if (!item || match.index == null) continue;
    decorations.push([
      match.index,
      match.index + match[0].length,
      Decoration.replace({
        widget: new PastedTextTagWidget(match[1]!, item.chars),
        inclusive: false,
      }),
    ]);
  }

  for (const match of text.matchAll(/\[Image #(\d+)\]/g)) {
    if (match.index == null) continue;
    decorations.push([
      match.index,
      match.index + match[0].length,
      Decoration.replace({
        widget: new ImageTagWidget(match[0]),
        inclusive: false,
      }),
    ]);
  }

  const attachmentRe = /\uE000attachment:([a-zA-Z0-9_-]+)\uE001/g;
  for (const match of text.matchAll(attachmentRe)) {
    const item = attachments[match[1]!];
    if (!item || match.index == null) continue;
    decorations.push([
      match.index,
      match.index + match[0].length,
      Decoration.replace({
        widget: new AttachmentTagWidget(match[1]!, item.name, item.size),
        inclusive: false,
      }),
    ]);
  }

  for (const token of findChatTokens(text)) {
    if (token.kind === "file") {
      decorations.push([
        token.from,
        token.to,
        Decoration.replace({
          widget: new FileTagWidget(token.text),
          inclusive: false,
        }),
      ]);
      continue;
    }

    // skill (/skill:x) and slash (/name) both use message-area slash styling
    const slashSource =
      token.kind === "skill" ? ("skill" as const) : resolveSlashCommandSource(token.text, catalog);
    // Prefer display name without /skill: prefix
    const displayToken =
      token.kind === "skill" ? `/${getSkillNameFromToken(token.text)}` : token.text;

    decorations.push([
      token.from,
      token.to,
      Decoration.replace({
        widget: new SlashTagWidget(displayToken, slashSource),
        inclusive: false,
      }),
    ]);
  }
  decorations.sort(([fromA], [fromB]) => fromA - fromB);
  for (const [from, to, decoration] of decorations) builder.add(from, to, decoration);
  return builder.finish();
}

export const chatInputTagExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildTagDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.facet(slashCatalogFacet) !== update.state.facet(slashCatalogFacet) ||
        update.startState.facet(pastedTextCatalogFacet) !==
          update.state.facet(pastedTextCatalogFacet) ||
        update.startState.facet(attachmentCatalogFacet) !==
          update.state.facet(attachmentCatalogFacet)
      ) {
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
      fontWeight: "400",
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
    ".cm-chat-tag--image": {
      border: "1px solid color-mix(in srgb, var(--app-accent) 24%, var(--app-border))",
      color: "var(--app-text-secondary)",
      backgroundColor: "color-mix(in srgb, var(--app-hover) 78%, transparent)",
    },
    ".cm-chat-tag--attachment": {
      border: "1px solid color-mix(in srgb, var(--app-accent) 28%, var(--app-border))",
      color: "var(--app-accent)",
      backgroundColor: "color-mix(in srgb, var(--app-accent) 10%, transparent)",
      maxWidth: "280px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    ".cm-chat-tag--pasted": {
      border: "1px solid color-mix(in srgb, var(--app-accent) 28%, var(--app-border))",
      color: "var(--app-accent)",
      backgroundColor: "color-mix(in srgb, var(--app-accent) 10%, transparent)",
      cursor: "pointer",
    },
    ".cm-chat-tag--slash": {
      border: "1px solid rgb(7 166 90 / 24%)",
      borderRadius: "6px",
      padding: "2px 8px",
      fontSize: "12px",
      fontWeight: "500",
      color: "#075f32",
      backgroundColor: "rgb(255 255 255 / 72%)",
    },
    ".cm-chat-tag--slash-skill": {
      color: "#075f32",
      borderColor: "rgb(7 166 90 / 26%)",
      backgroundColor: "rgb(231 248 239 / 92%)",
    },
    ".cm-chat-tag--slash-prompt": {
      color: "#3f5688",
      borderColor: "rgb(87 107 149 / 28%)",
      backgroundColor: "rgb(232 239 250 / 94%)",
    },
    ".cm-chat-tag--slash-custom": {
      color: "#7a4b00",
      borderColor: "rgb(217 119 6 / 28%)",
      backgroundColor: "rgb(255 244 224 / 94%)",
    },
    ".cm-chat-tag--slash-mcp": {
      color: "#5640a3",
      borderColor: "rgb(91 78 180 / 28%)",
      backgroundColor: "rgb(238 234 255 / 94%)",
    },
    ".cm-chat-tag-icon": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      opacity: "1",
    },
    ".cm-chat-tag-source": {
      flexShrink: "0",
      maxWidth: "96px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "11px",
      fontWeight: "600",
      opacity: "0.78",
    },
    ".cm-chat-tag-source::after": {
      content: '"·"',
      marginLeft: "4px",
      fontWeight: "500",
      opacity: "0.7",
    },
    ".cm-chat-tag-label": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      maxWidth: "240px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    ".cm-chat-tag--slash .cm-chat-tag-label": {
      fontFamily: "inherit",
      fontWeight: "600",
    },
  });
}
