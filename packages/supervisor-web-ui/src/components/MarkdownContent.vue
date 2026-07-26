<template>
  <div
    class="md-content break-words"
    :class="
      variant === 'terminal'
        ? 'md-content--terminal'
        : 'md-content--prose text-[14px] leading-relaxed'
    "
    v-html="html"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { marked, Renderer } from "marked";

const props = withDefaults(
  defineProps<{
    content: string;
    /** @deprecated Prefer variant="prose" */
    prose?: boolean;
    variant?: "prose" | "terminal";
  }>(),
  {
    prose: undefined,
    variant: undefined,
  },
);

const variant = computed<"prose" | "terminal">(() => {
  if (props.variant) return props.variant;
  if (props.prose === false) return "terminal";
  return "prose";
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createTerminalRenderer(): Renderer {
  const renderer = new Renderer();
  renderer.hr = () => '<hr class="md-term-hr" />\n';
  renderer.heading = function ({ text, depth, tokens }) {
    const level = Math.min(Math.max(depth, 1), 6);
    const marks = "#".repeat(level);
    const body = tokens?.length ? this.parser.parseInline(tokens) : escapeHtml(text);
    return `<div class="md-term-h" role="heading" aria-level="${level}"><span class="md-term-h__mark">${marks}</span> ${body}</div>\n`;
  };
  renderer.codespan = ({ text }) => `<code class="md-term-code">${escapeHtml(text)}</code>`;
  renderer.code = ({ text, lang }) => {
    const language = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
    return `<pre class="md-term-pre"${language}><code>${escapeHtml(text)}</code></pre>\n`;
  };
  renderer.listitem = function (item) {
    const marker = item.task ? (item.checked ? "[x]" : "[ ]") : "•";
    const body = item.tokens?.length ? this.parser.parse(item.tokens) : escapeHtml(item.text);
    return `<li><span class="md-term-bullet" aria-hidden="true">${marker}</span><div class="md-term-li">${body}</div></li>\n`;
  };
  renderer.blockquote = function ({ tokens, text }) {
    const body = tokens?.length ? this.parser.parse(tokens) : escapeHtml(text);
    return `<blockquote class="md-term-quote">${body}</blockquote>\n`;
  };
  return renderer;
}

const html = computed(() => {
  const mode = variant.value;
  const raw = marked.parse(props.content, {
    async: false,
    breaks: true,
    gfm: true,
    ...(mode === "terminal" ? { renderer: createTerminalRenderer() } : {}),
  });
  return typeof raw === "string" ? raw : "";
});
</script>

<style scoped>
.md-content {
  color: var(--app-text-primary);
}

/* ---- document / prose ---- */
.md-content--prose :deep(p) {
  margin: 0 0 0.55em;
  color: inherit;
}
.md-content--prose :deep(p:last-child) {
  margin-bottom: 0;
}
.md-content--prose :deep(strong) {
  font-weight: 600;
}
.md-content--prose :deep(em) {
  font-style: italic;
}
.md-content--prose :deep(a) {
  color: var(--app-accent);
  text-decoration: none;
}
.md-content--prose :deep(a:hover) {
  text-decoration: underline;
}
.md-content--prose :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  padding: 0.12em 0.38em;
  border-radius: 4px;
  background: var(--app-code-inline-bg);
  color: var(--app-code-inline-text, inherit);
  word-break: break-word;
}
.md-content--prose :deep(pre) {
  margin: 0.55em 0;
  padding: 0.7em 0.85em;
  border-radius: 8px;
  background: var(--app-code-bg);
  color: var(--app-code-text);
  border: 1px solid var(--app-border-subtle);
  overflow-x: auto;
  font-size: 0.84em;
  line-height: 1.5;
}
.md-content--prose :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
  white-space: pre;
}
.md-content--prose :deep(blockquote) {
  margin: 0.55em 0;
  padding: 0.15em 0 0.15em 0.85em;
  border-left: 3px solid color-mix(in srgb, var(--app-accent) 55%, transparent);
  color: var(--app-text-secondary);
}
.md-content--prose :deep(hr) {
  margin: 0.95em 0;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--app-text-secondary) 55%, transparent);
}
.md-content--prose :deep(h1) {
  font-size: 1.28em;
  font-weight: 600;
  margin: 0 0 0.55em;
}
.md-content--prose :deep(h2) {
  font-size: 1.12em;
  font-weight: 600;
  margin: 0.95em 0 0.4em;
}
.md-content--prose :deep(h3),
.md-content--prose :deep(h4) {
  font-size: 1.02em;
  font-weight: 600;
  margin: 0.8em 0 0.35em;
}
.md-content--prose :deep(ul),
.md-content--prose :deep(ol) {
  margin: 0.45em 0;
  padding-left: 1.35em;
}
.md-content--prose :deep(p:has(+ ul)),
.md-content--prose :deep(p:has(+ ol)) {
  margin-bottom: 0;
}
.md-content--prose :deep(li) {
  margin: 0.22em 0;
  line-height: 1.55;
}

/* ---- terminal / chat (xterm-like; base font inherits from bubble) ---- */
.md-content--terminal {
  font-size: inherit;
  line-height: 1.42;
  color: var(--app-text-primary);
}
.md-content--terminal :deep(p) {
  margin: 0 0 0.85em;
}
.md-content--terminal :deep(p:last-child) {
  margin-bottom: 0;
}
.md-content--terminal :deep(strong) {
  font-weight: 700;
  color: inherit;
}
.md-content--terminal :deep(em) {
  font-style: italic;
  color: var(--app-text-secondary);
}
.md-content--terminal :deep(a) {
  color: #3ecf8e;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.md-content--terminal :deep(.md-term-h) {
  margin: 0.95em 0 0.35em;
  font-weight: 700;
  font-size: 1em;
  line-height: 1.42;
  color: #7dd3fc;
}
.md-content--terminal :deep(.md-term-h:first-child) {
  margin-top: 0;
}
.md-content--terminal :deep(.md-term-h__mark) {
  color: #64748b;
  font-weight: 500;
}
.md-content--terminal :deep(hr.md-term-hr) {
  margin: 1.05em 0;
  border: none;
  border-top: 1px dashed color-mix(in srgb, var(--app-text-secondary) 85%, #94a3b8);
  height: 0;
  opacity: 1;
}
.md-content--terminal :deep(ul),
.md-content--terminal :deep(ol) {
  margin: 0.45em 0;
  padding: 0;
  list-style: none;
}
.md-content--terminal :deep(p:has(+ ul)),
.md-content--terminal :deep(p:has(+ ol)) {
  margin-bottom: 0;
}
.md-content--terminal :deep(li) {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
  margin: 0.22em 0;
  line-height: 1.5;
}
.md-content--terminal :deep(li:first-child) {
  margin-top: 0;
}
.md-content--terminal :deep(li:last-child) {
  margin-bottom: 0;
}
.md-content--terminal :deep(.md-term-bullet) {
  flex: none;
  min-width: 1.15em;
  color: #94a3b8;
  text-align: left;
}
.md-content--terminal :deep(.md-term-li) {
  min-width: 0;
  flex: 1;
}
.md-content--terminal :deep(.md-term-li > p) {
  margin: 0;
}
.md-content--terminal :deep(.md-term-code) {
  padding: 0 0.15em;
  border-radius: 2px;
  background: rgba(56, 189, 248, 0.14);
  color: #7dd3fc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 1em;
}
.md-content--terminal :deep(.md-term-pre) {
  margin: 0.35em 0;
  padding: 0.5em 0.65em;
  border: 1px solid #2a2f36;
  border-radius: 2px;
  background: #111315;
  color: #d7dde5;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  line-height: 1.38;
}
.md-content--terminal :deep(.md-term-pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
  white-space: pre;
}
.md-content--terminal :deep(.md-term-quote) {
  margin: 0.3em 0;
  padding: 0 0 0 0.7em;
  border-left: 2px solid #475569;
  color: #94a3b8;
}
.md-content--terminal :deep(.md-term-quote p) {
  margin: 0;
}
.md-content--terminal :deep(table) {
  width: 100%;
  margin: 0.35em 0;
  border-collapse: collapse;
  font-size: 0.9em;
}
.md-content--terminal :deep(th),
.md-content--terminal :deep(td) {
  padding: 0.15em 0.4em;
  border: 1px solid #334155;
  text-align: left;
}
.md-content--terminal :deep(th) {
  color: #7dd3fc;
}

html[data-theme="light"] .md-content--terminal :deep(.md-term-h) {
  color: #0369a1;
}
html[data-theme="light"] .md-content--terminal :deep(.md-term-h__mark),
html[data-theme="light"] .md-content--terminal :deep(.md-term-bullet) {
  color: #64748b;
}
html[data-theme="light"] .md-content--terminal :deep(.md-term-code) {
  background: rgba(2, 132, 199, 0.1);
  color: #0369a1;
}
html[data-theme="light"] .md-content--terminal :deep(.md-term-pre) {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #0f172a;
}
html[data-theme="light"] .md-content--terminal :deep(a) {
  color: #059669;
}
</style>
