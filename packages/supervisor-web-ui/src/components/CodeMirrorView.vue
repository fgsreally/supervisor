<template>
  <div ref="host" class="codemirror-host" :class="fill ? 'codemirror-host--fill' : ''" />
</template>

<script setup lang="ts">
import { javascript } from "@codemirror/lang-javascript";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useAppTheme } from "../composables/use-app-theme";

export type CodeMirrorLanguage = "typescript" | "markdown";

const props = withDefaults(
  defineProps<{
    content: string;
    fill?: boolean;
    editable?: boolean;
    language?: CodeMirrorLanguage;
  }>(),
  { fill: false, editable: false, language: "typescript" },
);

const emit = defineEmits<{ "update:content": [value: string] }>();

const { isDark } = useAppTheme();

const host = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

const tsLanguage = javascript({ typescript: true });

const tsHighlightLight = HighlightStyle.define([
  { tag: t.comment, color: "#6e7781", fontStyle: "italic" },
  { tag: t.keyword, color: "#cf222e" },
  { tag: t.string, color: "#0a3069" },
  { tag: t.number, color: "#0550ae" },
  { tag: t.bool, color: "#0550ae" },
  { tag: t.null, color: "#0550ae" },
  { tag: t.propertyName, color: "#953800" },
  { tag: t.definition(t.propertyName), color: "#953800" },
  { tag: t.function(t.variableName), color: "#8250df" },
  { tag: t.variableName, color: "#953800" },
  { tag: t.typeName, color: "#953800" },
  { tag: t.className, color: "#953800" },
  { tag: t.operator, color: "#cf222e" },
  { tag: t.punctuation, color: "#1f2328" },
  { tag: t.bracket, color: "#1f2328" },
  { tag: t.meta, color: "#6e7781" },
]);

const tsHighlightDark = HighlightStyle.define([
  { tag: t.comment, color: "#6a9955", fontStyle: "italic" },
  { tag: t.keyword, color: "#569cd6" },
  { tag: t.string, color: "#ce9178" },
  { tag: t.number, color: "#b5cea8" },
  { tag: t.bool, color: "#569cd6" },
  { tag: t.null, color: "#569cd6" },
  { tag: t.propertyName, color: "#9cdcfe" },
  { tag: t.definition(t.propertyName), color: "#9cdcfe" },
  { tag: t.function(t.variableName), color: "#dcdcaa" },
  { tag: t.variableName, color: "#9cdcfe" },
  { tag: t.typeName, color: "#4ec9b0" },
  { tag: t.className, color: "#4ec9b0" },
  { tag: t.operator, color: "#d4d4d4" },
  { tag: t.punctuation, color: "#d4d4d4" },
  { tag: t.bracket, color: "#d4d4d4" },
  { tag: t.meta, color: "#808080" },
]);

const mdHighlightLight = HighlightStyle.define([
  { tag: t.heading, color: "#0550ae", fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "#0969da", textDecoration: "underline" },
  { tag: t.url, color: "#0969da" },
  {
    tag: t.monospace,
    color: "#953800",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  { tag: t.quote, color: "#57606a", fontStyle: "italic" },
  { tag: t.contentSeparator, color: "#d0d7de" },
  { tag: t.list, color: "#0550ae" },
  { tag: t.meta, color: "#6e7781" },
  { tag: t.comment, color: "#6e7781", fontStyle: "italic" },
]);

const mdHighlightDark = HighlightStyle.define([
  { tag: t.heading, color: "#569cd6", fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold", color: "#e8e8e8" },
  { tag: t.emphasis, fontStyle: "italic", color: "#d4d4d4" },
  { tag: t.link, color: "#4fc1ff", textDecoration: "underline" },
  { tag: t.url, color: "#4fc1ff" },
  {
    tag: t.monospace,
    color: "#ce9178",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  { tag: t.quote, color: "#9a9a9a", fontStyle: "italic" },
  { tag: t.contentSeparator, color: "#404040" },
  { tag: t.list, color: "#569cd6" },
  { tag: t.meta, color: "#808080" },
  { tag: t.comment, color: "#6a9955", fontStyle: "italic" },
]);

const tsHighlight = computed(() => (isDark.value ? tsHighlightDark : tsHighlightLight));
const mdHighlight = computed(() => (isDark.value ? mdHighlightDark : mdHighlightLight));

function buildTheme() {
  const mono = props.language === "typescript";
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--app-cm-bg)",
        color: "var(--app-cm-text)",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-content": {
        fontFamily: mono
          ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          : "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        fontSize: "13px",
        lineHeight: "1.6",
        caretColor: props.editable ? "var(--app-cm-caret)" : "transparent",
        color: "var(--app-cm-text)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--app-cm-gutter-bg)",
        color: "var(--app-cm-gutter-fg)",
        borderRight: "1px solid var(--app-cm-gutter-border)",
      },
      ".cm-activeLineGutter": { backgroundColor: "var(--app-cm-active-gutter)" },
      ".cm-activeLine": { backgroundColor: "var(--app-cm-active-line)" },
      ".cm-cursor": { borderLeftColor: "var(--app-cm-caret)" },
    },
    { dark: isDark.value },
  );
}

function languageExtension() {
  if (props.language === "markdown") {
    return [markdown({ base: markdownLanguage }), syntaxHighlighting(mdHighlight.value)];
  }
  return [tsLanguage, syntaxHighlighting(tsHighlight.value)];
}

function buildExtensions() {
  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    buildTheme(),
    ...languageExtension(),
  ];
  if (!props.editable) {
    extensions.push(EditorView.editable.of(false), EditorState.readOnly.of(true));
  } else {
    extensions.push(
      EditorView.editable.of(true),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit("update:content", update.state.doc.toString());
        }
      }),
    );
  }
  return extensions;
}

function createView(parent: HTMLElement): EditorView {
  const state = EditorState.create({
    doc: props.content,
    extensions: buildExtensions(),
  });
  return new EditorView({ state, parent });
}

function replaceDocument(next: string) {
  if (!view) return;
  const current = view.state.doc.toString();
  if (current === next) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: next },
  });
}

function recreateView() {
  if (!host.value) return;
  view?.destroy();
  view = createView(host.value);
}

onMounted(() => {
  if (host.value) view = createView(host.value);
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

watch(
  () => [props.content, props.editable, props.language] as const,
  ([next], prev) => {
    if (!view) return;
    if (prev && (prev[2] !== props.language || prev[1] !== props.editable)) {
      recreateView();
      return;
    }
    replaceDocument(next);
  },
);

watch(isDark, () => {
  recreateView();
});
</script>

<style scoped>
.codemirror-host :deep(.cm-editor) {
  border: none;
}

.codemirror-host--fill {
  flex: 1 1 0;
  min-height: 0;
  height: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.codemirror-host--fill :deep(.cm-editor) {
  flex: 1 1 0;
  min-height: 0;
  height: auto;
}

.codemirror-host--fill :deep(.cm-scroller) {
  overflow: auto;
  min-height: 0;
}
</style>
