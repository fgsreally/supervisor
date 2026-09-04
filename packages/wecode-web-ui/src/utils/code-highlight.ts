/** Lightweight syntax highlighting for chat code blocks and file preview. */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function normalizeLang(lang?: string): string {
  const raw = (lang ?? "").trim().toLowerCase();
  if (!raw || raw === "text" || raw === "plain" || raw === "plaintext") return "";
  if (/^(?:htm|xhtml|svg|vue)$/.test(raw)) return "html";
  if (/^(?:javascript|jsx|mjs|cjs)$/.test(raw)) return "js";
  if (/^(?:typescript|tsx)$/.test(raw)) return "ts";
  if (/^(?:shell|zsh|bash|sh|ps1)$/.test(raw)) return "bash";
  if (raw === "scss" || raw === "less" || raw === "sass") return "css";
  if (raw === "yml") return "yaml";
  if (raw === "py" || raw === "python") return "python";
  if (raw === "jsonc" || raw === "jsonl") return "json";
  if (raw === "md" || raw === "markdown") return "markdown";
  return raw;
}

function wrapTok(kind: string, value: string): string {
  return `<span class="tok-${kind}">${escapeHtml(value)}</span>`;
}

const JS_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "class",
  "extends",
  "implements",
  "interface",
  "type",
  "import",
  "export",
  "from",
  "default",
  "async",
  "await",
  "new",
  "throw",
  "try",
  "catch",
  "finally",
  "true",
  "false",
  "null",
  "undefined",
  "this",
  "typeof",
  "instanceof",
  "in",
  "of",
  "void",
  "yield",
  "delete",
  "super",
  "static",
  "get",
  "set",
  "enum",
  "as",
  "with",
]);

const JS_BUILTINS = new Set([
  "document",
  "window",
  "globalThis",
  "self",
  "Math",
  "JSON",
  "console",
  "Array",
  "Object",
  "Promise",
  "Date",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Error",
  "TypeError",
  "Number",
  "String",
  "Boolean",
  "RegExp",
  "Symbol",
  "BigInt",
  "Proxy",
  "Reflect",
  "Intl",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "NaN",
  "Infinity",
  "localStorage",
  "sessionStorage",
  "navigator",
  "location",
  "history",
  "fetch",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "Element",
  "Node",
  "Event",
  "HTMLElement",
  "URL",
  "Blob",
  "File",
  "FormData",
  "Headers",
  "Request",
  "Response",
  "TextEncoder",
  "TextDecoder",
  "atob",
  "btoa",
  "encodeURIComponent",
  "decodeURIComponent",
]);

function paintJsPlain(value: string): string {
  const re = /([A-Za-z_$][\w$]*)|(\d+(?:\.\d+)?)|(\s+)|(.)/g;
  let out = "";
  let prevWasDot = false;
  let pendingDeclName = false;
  const tokens = Array.from(value.matchAll(re));

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const ident = token[1];
    const num = token[2];
    const space = token[3];
    const other = token[4];

    if (space) {
      out += escapeHtml(space);
      continue;
    }
    if (num) {
      out += wrapTok("number", num);
      prevWasDot = false;
      pendingDeclName = false;
      continue;
    }
    if (other) {
      out += escapeHtml(other);
      prevWasDot = other === ".";
      if (other !== ".") pendingDeclName = false;
      continue;
    }
    if (!ident) continue;

    let j = i + 1;
    while (j < tokens.length && tokens[j]![3]) j += 1;
    const followedByParen = tokens[j]?.[4] === "(";

    if (prevWasDot) {
      out += wrapTok(followedByParen ? "function" : "property", ident);
      pendingDeclName = false;
    } else if (pendingDeclName) {
      out += wrapTok("function", ident);
      pendingDeclName = false;
    } else if (JS_KEYWORDS.has(ident)) {
      out += wrapTok("keyword", ident);
      pendingDeclName = ident === "function" || ident === "class";
    } else if (followedByParen) {
      out += wrapTok("function", ident);
      pendingDeclName = false;
    } else if (JS_BUILTINS.has(ident)) {
      out += wrapTok("builtin", ident);
      pendingDeclName = false;
    } else {
      out += escapeHtml(ident);
      pendingDeclName = false;
    }
    prevWasDot = false;
  }

  return out;
}

function paintSqlPlain(value: string): string {
  return escapeHtml(value)
    .replace(
      /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AND|OR|NOT|NULL|AS|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|ORDER|BY|LIMIT|OFFSET|INTO|VALUES|SET)\b/gi,
      '<span class="tok-keyword">$1</span>',
    )
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
}

function paintCssPlain(value: string): string {
  return escapeHtml(value)
    .replace(/(^|[{};\s])([a-zA-Z_-][\w-]*)(\s*:)/g, '$1<span class="tok-property">$2</span>$3')
    .replace(/(@[a-zA-Z-]+|!important)\b/g, '<span class="tok-keyword">$1</span>')
    .replace(/#[0-9a-fA-F]{3,8}\b/g, '<span class="tok-number">$&</span>')
    .replace(
      /\b(\d+(?:\.\d+)?)(px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/g,
      '<span class="tok-number">$1$2</span>',
    );
}

function paintPythonPlain(value: string): string {
  const re = /([A-Za-z_][\w]*)|(\d+(?:\.\d+)?)|(\s+)|(.)/g;
  let out = "";
  let pendingDefName = false;
  for (const token of value.matchAll(re)) {
    const ident = token[1];
    const num = token[2];
    const space = token[3];
    const other = token[4];
    if (space) {
      out += escapeHtml(space);
      continue;
    }
    if (num) {
      out += wrapTok("number", num);
      pendingDefName = false;
      continue;
    }
    if (other) {
      out += escapeHtml(other);
      pendingDefName = false;
      continue;
    }
    if (!ident) continue;
    if (
      /^(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|with|yield|lambda|pass|break|continue|raise|True|False|None|and|or|not|in|is|global|nonlocal|async|await)$/.test(
        ident,
      )
    ) {
      out += wrapTok("keyword", ident);
      pendingDefName = ident === "def" || ident === "class";
    } else if (pendingDefName) {
      out += wrapTok("function", ident);
      pendingDefName = false;
    } else {
      out += escapeHtml(ident);
      pendingDefName = false;
    }
  }
  return out;
}

function paintYamlPlain(value: string): string {
  return escapeHtml(value)
    .replace(
      /^(\s*)([A-Za-z_][\w.-]*)(\s*:)/gm,
      '$1<span class="tok-property">$2</span>$3',
    )
    .replace(
      /\b(true|false|null|True|False|None|yes|no|on|off)\b/g,
      '<span class="tok-keyword">$1</span>',
    )
    .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
}

/** Sequential tokenize so comments/strings never overlap incorrectly. */
function highlightByTokens(
  text: string,
  options: {
    lineComment?: boolean;
    blockComment?: boolean;
    hashComment?: boolean;
    paintPlain: (value: string) => string;
  },
): string {
  let out = "";
  let cursor = 0;
  let i = 0;
  const flushPlain = (end: number) => {
    if (end > cursor) out += options.paintPlain(text.slice(cursor, end));
  };

  while (i < text.length) {
    if (options.blockComment && text.startsWith("/*", i)) {
      flushPlain(i);
      const endToken = text.indexOf("*/", i + 2);
      const end = endToken < 0 ? text.length : endToken + 2;
      out += wrapTok("comment", text.slice(i, end));
      cursor = end;
      i = end;
      continue;
    }
    if (options.lineComment && text.startsWith("//", i)) {
      flushPlain(i);
      let end = text.indexOf("\n", i);
      if (end < 0) end = text.length;
      out += wrapTok("comment", text.slice(i, end));
      cursor = end;
      i = end;
      continue;
    }
    if (options.hashComment && text[i] === "#" && (i === 0 || text[i - 1] === "\n")) {
      flushPlain(i);
      let end = text.indexOf("\n", i);
      if (end < 0) end = text.length;
      out += wrapTok("comment", text.slice(i, end));
      cursor = end;
      i = end;
      continue;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      flushPlain(i);
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === ch) {
          j += 1;
          break;
        }
        if (ch !== "`" && text[j] === "\n") break;
        j += 1;
      }
      out += wrapTok("string", text.slice(i, j));
      cursor = j;
      i = j;
      continue;
    }
    i += 1;
  }
  flushPlain(text.length);
  return out;
}

function highlightJsLike(text: string): string {
  return highlightByTokens(text, {
    lineComment: true,
    blockComment: true,
    paintPlain: paintJsPlain,
  });
}

function highlightCss(text: string): string {
  return highlightByTokens(text, {
    blockComment: true,
    paintPlain: paintCssPlain,
  });
}

function highlightHtmlAttrs(attrs: string): string {
  if (!attrs) return "";
  let out = "";
  let cursor = 0;
  const re = /([^\s"'=<>/`]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))?|[^\s]+|\s+/g;
  for (const match of attrs.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > cursor) out += escapeHtml(attrs.slice(cursor, start));
    const whole = match[0];
    if (/^\s+$/.test(whole)) {
      out += whole;
    } else if (match[1]) {
      out += wrapTok("attr", match[1]);
      if (match[2]) out += escapeHtml(match[2]);
      const quoted =
        match[3] != null
          ? `"${match[3]}"`
          : match[4] != null
            ? `'${match[4]}'`
            : match[5] != null
              ? match[5]
              : "";
      if (quoted) out += wrapTok("string", quoted);
    } else {
      out += escapeHtml(whole);
    }
    cursor = start + whole.length;
  }
  if (cursor < attrs.length) out += escapeHtml(attrs.slice(cursor));
  return out;
}

function highlightHtmlTag(tag: string): string {
  const m = /^(<\/?)([a-zA-Z][\w:-]*)([\s\S]*?)(\/?>)$/.exec(tag);
  if (!m) return wrapTok("tag", tag);
  const [, open, name, attrs, close] = m;
  return (
    wrapTok("tag", open) +
    wrapTok("tag-name", name) +
    highlightHtmlAttrs(attrs) +
    wrapTok("tag", close)
  );
}

/** Find `>` that closes a tag, ignoring `>` inside quoted attributes. */
function findHtmlTagEnd(text: string, start: number): number {
  let i = start + 1;
  let quote: string | null = null;
  while (i < text.length) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === ">") return i;
    i += 1;
  }
  return -1;
}

function highlightHtml(text: string): string {
  let out = "";
  let cursor = 0;
  while (cursor < text.length) {
    if (text.startsWith("<!--", cursor)) {
      const endToken = text.indexOf("-->", cursor + 4);
      const end = endToken < 0 ? text.length : endToken + 3;
      out += wrapTok("comment", text.slice(cursor, end));
      cursor = end;
      continue;
    }
    if (text[cursor] === "<") {
      const end = findHtmlTagEnd(text, cursor);
      if (end < 0) {
        out += escapeHtml(text.slice(cursor));
        break;
      }
      const tag = text.slice(cursor, end + 1);
      out += highlightHtmlTag(tag);
      cursor = end + 1;

      const open = /^<(style|script)\b/i.exec(tag);
      if (open && !/^<\//.test(tag) && !/\/>$/.test(tag)) {
        const kind = open[1]!.toLowerCase();
        const closeRe = kind === "style" ? /<\/style\s*>/i : /<\/script\s*>/i;
        const rest = text.slice(cursor);
        const closeMatch = closeRe.exec(rest);
        if (closeMatch && closeMatch.index != null) {
          const body = rest.slice(0, closeMatch.index);
          out += kind === "style" ? highlightCss(body) : highlightJsLike(body);
          cursor += closeMatch.index;
        }
      }
      continue;
    }
    const next = text.indexOf("<", cursor);
    const chunk = next < 0 ? text.slice(cursor) : text.slice(cursor, next);
    out += escapeHtml(chunk);
    cursor = next < 0 ? text.length : next;
  }
  return out;
}

function readJsonString(text: string, start: number): number {
  let j = start + 1;
  while (j < text.length) {
    const ch = text[j]!;
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === '"') return j + 1;
    if (ch === "\n") break;
    j += 1;
  }
  return j;
}

function highlightJson(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') {
      const end = readJsonString(text, i);
      const raw = text.slice(i, end);
      let k = end;
      while (k < text.length && /\s/.test(text[k]!)) k += 1;
      const isKey = text[k] === ":";
      out += wrapTok(isKey ? "property" : "string", raw);
      i = end;
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (m) {
        out += wrapTok("number", m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (/[a-zA-Z]/.test(ch)) {
      const m = /^(true|false|null)/.exec(text.slice(i));
      if (m) {
        out += wrapTok("keyword", m[0]);
        i += m[0].length;
        continue;
      }
    }
    if ("{}[]:,".includes(ch)) {
      out += wrapTok("punct", ch);
      i += 1;
      continue;
    }
    // whitespace / other
    let j = i + 1;
    while (j < text.length) {
      const c = text[j]!;
      if (
        c === '"' ||
        c === "-" ||
        (c >= "0" && c <= "9") ||
        (c >= "a" && c <= "z") ||
        (c >= "A" && c <= "Z") ||
        "{}[],:".includes(c)
      ) {
        break;
      }
      j += 1;
    }
    out += escapeHtml(text.slice(i, j));
    i = j;
  }
  return out;
}

function highlightMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/^(#{1,6}\s.+)$/gm, '<span class="tok-keyword">$1</span>')
    .replace(/(`[^`\n]+`)/g, '<span class="tok-string">$1</span>')
    .replace(/(\*\*[^*\n]+\*\*)/g, '<span class="tok-keyword">$1</span>');
}

export function highlightCode(text: string, lang?: string): string {
  const normalized = normalizeLang(lang);
  if (!normalized) return escapeHtml(text);
  if (normalized === "html") return highlightHtml(text);
  if (normalized === "css") return highlightCss(text);
  if (normalized === "json") return highlightJson(text);
  if (normalized === "yaml") {
    return highlightByTokens(text, { hashComment: true, paintPlain: paintYamlPlain });
  }
  if (normalized === "python") {
    return highlightByTokens(text, {
      hashComment: true,
      paintPlain: paintPythonPlain,
    });
  }
  if (normalized === "sql") {
    return highlightByTokens(text, { paintPlain: paintSqlPlain });
  }
  if (normalized === "markdown") return highlightMarkdown(text);
  if (/^(?:js|ts|bash)$/.test(normalized)) return highlightJsLike(text);
  return escapeHtml(text);
}
