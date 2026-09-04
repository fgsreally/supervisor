import type { HighlighterCore } from "shiki/core";
import { normalizeLang } from "./code-highlight";

let highlighterPromise: Promise<HighlighterCore> | undefined;
const loaders: Record<string, () => Promise<unknown>> = {
  javascript: () => import("shiki/langs/javascript.mjs"), typescript: () => import("shiki/langs/typescript.mjs"), jsx: () => import("shiki/langs/jsx.mjs"), tsx: () => import("shiki/langs/tsx.mjs"),
  json: () => import("shiki/langs/json.mjs"), jsonc: () => import("shiki/langs/jsonc.mjs"), html: () => import("shiki/langs/html.mjs"), vue: () => import("shiki/langs/vue.mjs"), css: () => import("shiki/langs/css.mjs"), scss: () => import("shiki/langs/scss.mjs"),
  python: () => import("shiki/langs/python.mjs"), yaml: () => import("shiki/langs/yaml.mjs"), markdown: () => import("shiki/langs/markdown.mjs"), sql: () => import("shiki/langs/sql.mjs"), shell: () => import("shiki/langs/shell.mjs"), rust: () => import("shiki/langs/rust.mjs"), go: () => import("shiki/langs/go.mjs"), java: () => import("shiki/langs/java.mjs"), xml: () => import("shiki/langs/xml.mjs"), dockerfile: () => import("shiki/langs/dockerfile.mjs"),
};

function languageId(lang?: string) {
  const value = normalizeLang(lang);
  return value === "js" ? "javascript" : value === "ts" ? "typescript" : value === "bash" ? "shell" : value || "text";
}

async function getHighlighter(language: string) {
  const load = loaders[language];
  if (!load) return undefined;
  const [core, engine, grammar] = await Promise.all([import("shiki/core"), import("shiki/engine/javascript"), load()]);
  highlighterPromise ??= core.createHighlighterCore({ themes: [import("shiki/themes/dark-plus.mjs"), import("shiki/themes/light-plus.mjs")], langs: [grammar as never], engine: engine.createJavaScriptRegexEngine() });
  const highlighter = await highlighterPromise;
  await highlighter.loadLanguage(grammar as never);
  return highlighter;
}

export async function highlightCodeWithShiki(code: string, lang?: string, dark = true): Promise<string> {
  const language = languageId(lang);
  const highlighter = await getHighlighter(language);
  if (!highlighter) return `<pre class="shiki"><code>${code.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code></pre>`;
  return highlighter.codeToHtml(code, { lang: language, theme: dark ? "dark-plus" : "light-plus" });
}
