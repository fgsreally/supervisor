<template>
  <div
    class="md-content break-words"
    :class="
      variant === 'terminal'
        ? 'md-content--terminal'
        : 'md-content--prose text-[14px] leading-relaxed'
    "
    v-html="html"
    @click="onContentClick"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { marked, Renderer } from "marked";
import { escapeHtml, highlightCode } from "@/utils/code-highlight";

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

function createTerminalRenderer(): Renderer {
  const renderer = new Renderer();
  renderer.hr = () => '<hr class="md-term-hr" />\n';
  renderer.heading = function ({ text, depth, tokens }) {
    const level = Math.min(Math.max(depth, 1), 6);
    const body = tokens?.length ? this.parser.parseInline(tokens) : escapeHtml(text);
    return `<div class="md-term-h" role="heading" aria-level="${level}">${body}</div>\n`;
  };
  renderer.codespan = ({ text }) => `<code class="md-term-code">${escapeHtml(text)}</code>`;
  renderer.code = ({ text, lang }) => {
    const language = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
    return `<pre class="md-term-pre"${language}><code>${highlightCode(text, lang)}</code></pre>\n`;
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

function onContentClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest("a");
  const href = anchor?.getAttribute("href");
  if (!href || /^(?:https?:|mailto:|#)/i.test(href)) return;
  event.preventDefault();
  window.dispatchEvent(
    new CustomEvent("supervisor:open-file", { detail: { path: decodeURIComponent(href) } }),
  );
}
</script>

<style scoped>
.md-content {
  color: var(--md-text, var(--app-text-primary));
  font-family: var(--md-font-family, inherit);
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
  color: var(--md-strong, inherit);
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
  background: var(--md-inline-code-bg, var(--app-code-inline-bg));
  color: var(--md-inline-code-text, var(--app-code-inline-text, inherit));
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
  padding: 0.35em 0.75em;
  border-left: 3px solid var(--md-quote-border, var(--app-accent));
  background: var(--md-quote-bg, transparent);
  color: var(--md-quote-text, var(--app-text-secondary));
}
.md-content--prose :deep(hr) {
  margin: 0.95em 0;
  border: none;
  border-top: 1px solid var(--md-divider, var(--app-border-subtle));
}
.md-content--prose :deep(h1),
.md-content--prose :deep(h2),
.md-content--prose :deep(h3),
.md-content--prose :deep(h4) {
  color: var(--md-heading, var(--app-text-primary));
  font-weight: var(--md-heading-weight, 600);
}
.md-content--prose :deep(h1) {
  font-size: 1.28em;
  margin: 0 0 0.55em;
}
.md-content--prose :deep(h2) {
  font-size: 1.12em;
  margin: 0.95em 0 0.4em;
}
.md-content--prose :deep(h3),
.md-content--prose :deep(h4) {
  font-size: 1.02em;
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
.md-content--prose :deep(ul > li::marker) {
  color: var(--md-list-marker, var(--app-accent));
}
.md-content--prose :deep(th) {
  background: var(--md-table-header-bg, var(--app-hover));
  color: var(--md-table-header-text, var(--app-text-primary));
}
.md-content--prose :deep(th),
.md-content--prose :deep(td) {
  border-color: var(--md-table-border, var(--app-border-subtle));
}

/* ---- terminal / chat ---- */
.md-content--terminal {
  font-size: inherit;
  line-height: 1.42;
  color: var(--md-text, var(--app-text-primary));
}
.md-content--terminal :deep(p) {
  margin: 0 0 0.85em;
}
.md-content--terminal :deep(p:last-child) {
  margin-bottom: 0;
}
.md-content--terminal :deep(strong) {
  font-weight: 650;
  color: var(--md-strong, inherit);
}
.md-content--terminal :deep(em) {
  font-style: italic;
  color: var(--md-muted, var(--app-text-secondary));
}
.md-content--terminal :deep(a) {
  color: #3ecf8e;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.md-content--terminal :deep(.md-term-h) {
  margin: 0.95em 0 0.35em;
  font-weight: var(--md-heading-weight, 600);
  font-size: 1em;
  line-height: 1.42;
  color: var(--md-heading, var(--app-text-primary));
}
.md-content--terminal :deep(.md-term-h:first-child) {
  margin-top: 0;
}
.md-content--terminal :deep(.md-term-h__mark) {
  color: var(--md-heading-marker, var(--app-accent));
  font-weight: 500;
}
.md-content :deep(.tok-keyword) {
  color: #c084fc;
}
.md-content :deep(.tok-string) {
  color: #ce9178;
}
.md-content :deep(.tok-number) {
  color: #b5cea8;
}
.md-content :deep(.tok-comment) {
  color: #6a9955;
  font-style: italic;
}
.md-content :deep(.tok-tag),
.md-content :deep(.tok-tag-name) {
  color: #569cd6;
}
.md-content :deep(.tok-attr) {
  color: #9cdcfe;
}
.md-content :deep(.tok-property) {
  color: #9cdcfe;
}
.md-content :deep(.tok-function) {
  color: #dcdcaa;
}
.md-content :deep(.tok-builtin) {
  color: #4ec9b0;
}
.md-content :deep(.tok-punct) {
  color: #d4d4d4;
}
.md-content--terminal :deep(hr.md-term-hr) {
  margin: 1.05em 0;
  border: none;
  border-top: 1px solid var(--md-divider, var(--app-border-subtle));
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
  color: var(--md-list-marker, var(--app-accent));
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
  padding: 0.05em 0.28em;
  border-radius: 3px;
  background: var(--md-inline-code-bg, var(--app-code-inline-bg));
  color: var(--md-inline-code-text, var(--app-accent));
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
  padding: 0.25em 0.7em;
  border-left: 3px solid var(--md-quote-border, var(--app-accent));
  background: var(--md-quote-bg, transparent);
  color: var(--md-quote-text, var(--app-text-secondary));
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
  border: 1px solid var(--md-table-border, var(--app-border-subtle));
  text-align: left;
}
.md-content--terminal :deep(th) {
  color: var(--md-table-header-text, var(--app-text-primary));
  background: var(--md-table-header-bg, transparent);
}

html[data-theme="light"] .md-content--terminal :deep(.md-term-pre) {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #0f172a;
}
html[data-theme="light"] .md-content--terminal :deep(a) {
  color: #059669;
}

@media (max-width: 767px) {
  .md-content {
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .md-content--prose :deep(pre),
  .md-content--terminal :deep(.md-term-pre) {
    max-width: 100%;
    overflow-x: hidden;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .md-content--prose :deep(pre code),
  .md-content--terminal :deep(.md-term-pre code) {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .md-content--terminal :deep(table),
  .md-content--prose :deep(table) {
    display: block;
    max-width: 100%;
    overflow-x: hidden;
    table-layout: fixed;
    word-break: break-word;
  }
}
</style>
