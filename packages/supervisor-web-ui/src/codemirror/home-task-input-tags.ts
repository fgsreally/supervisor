import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

export type ProjectTagSource = {
  id: string | number;
  name: string;
};

class ProjectTagWidget extends WidgetType {
  constructor(readonly name: string) {
    super();
  }

  eq(other: ProjectTagWidget): boolean {
    return other.name === this.name;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-home-project-tag";
    span.contentEditable = "false";

    const icon = document.createElement("span");
    icon.className = "cm-home-project-tag-icon";
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

    const label = document.createElement("span");
    label.className = "cm-home-project-tag-label";
    label.textContent = this.name;

    span.appendChild(icon);
    span.appendChild(label);
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find exact `@projectName` spans for known projects (longest name first). */
export function findProjectMentions(
  text: string,
  projects: ProjectTagSource[],
): Array<{ from: number; to: number; name: string; id: string | number }> {
  if (!text || !projects.length) return [];

  const sorted = [...projects].sort((a, b) => b.name.length - a.name.length);
  const hits: Array<{ from: number; to: number; name: string; id: string | number }> = [];
  const claimed = new Array(text.length).fill(false);

  for (const project of sorted) {
    if (!project.name) continue;
    const re = new RegExp(`@${escapeRegExp(project.name)}(?=$|\\s|[\\])}>,.!?])`, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) != null) {
      const from = match.index;
      const to = from + match[0].length;
      let overlap = false;
      for (let i = from; i < to; i++) {
        if (claimed[i]) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      for (let i = from; i < to; i++) claimed[i] = true;
      hits.push({ from, to, name: project.name, id: project.id });
    }
  }

  hits.sort((a, b) => a.from - b.from);
  return hits;
}

export function resolveProjectFromText(
  text: string,
  projects: ProjectTagSource[],
): ProjectTagSource | null {
  const mentions = findProjectMentions(text, projects);
  if (!mentions.length) return null;
  const last = mentions[mentions.length - 1]!;
  return { id: last.id, name: last.name };
}

function buildProjectTagDecorations(
  view: EditorView,
  projects: ProjectTagSource[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const mention of findProjectMentions(view.state.doc.toString(), projects)) {
    builder.add(
      mention.from,
      mention.to,
      Decoration.replace({
        widget: new ProjectTagWidget(mention.name),
        inclusive: false,
      }),
    );
  }
  return builder.finish();
}

export function homeProjectTagExtension(getProjects: () => ProjectTagSource[]): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildProjectTagDecorations(view, getProjects());
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildProjectTagDecorations(update.view, getProjects());
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export function homeTaskInputTheme(): Extension {
  return EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      fontSize: "13px",
      height: "100%",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-content": {
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      fontSize: "13px",
      lineHeight: "1.45",
      caretColor: "var(--app-text-primary)",
      color: "var(--app-text-primary)",
      padding: "8px 10px",
      minHeight: "88px",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
    },
    ".cm-line": { padding: "0" },
    ".cm-cursor": { borderLeftWidth: "2px" },
    ".cm-placeholder": {
      color: "var(--app-text-muted)",
      fontStyle: "normal",
    },
    ".cm-home-project-tag": {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      verticalAlign: "baseline",
      borderRadius: "4px",
      padding: "1px 6px 1px 4px",
      margin: "0 1px",
      fontSize: "12px",
      lineHeight: "1.35",
      userSelect: "none",
      backgroundColor: "var(--app-tag-skill-bg)",
      color: "var(--app-tag-skill-fg)",
      fontWeight: "500",
    },
    ".cm-home-project-tag-icon": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      opacity: "0.9",
    },
    ".cm-home-project-tag-label": {
      maxWidth: "180px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  });
}
