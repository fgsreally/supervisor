/**
 * AST-grep: 结构化代码搜索和 AST 摘要工具
 *
 * 来自 oh-my-pi (omp) -- omp 在 Rust 层用 pi-ast crate 实现了 tree-sitter AST 搜索和改写。
 * 这里使用 @ast-grep/napi（也是 Rust N-API 绑定）实现相同的功能。
 *
 * 参考:
 * - omp crates/pi-ast/src/ops.rs       -- AST-grep pattern matching, search, rewrite
 * - omp crates/pi-ast/src/summary.rs   -- Structural source summarization (BFS unfold, elide bodies)
 * - omp crates/pi-ast/src/block.rs     -- Code block boundary detection
 * - omp packages/coding-agent/src/tools/ast-grep.ts  -- ast_grep 工具定义
 * - omp packages/coding-agent/src/tools/ast-edit.ts  -- ast_edit 工具定义（结构化代码改写）
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse } from "@ast-grep/napi";
import type { SgNode } from "@ast-grep/napi";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

// ---------------------------------------------------------------------------
// Language support map  --  来自 omp crates/pi-ast/src/language/ 的 SupportLang 枚举
// 覆盖 40+ 种语言
// ---------------------------------------------------------------------------

const LANG_MAP: Record<string, string> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
  ".mts": "ts",
  ".cts": "ts",
  ".mjs": "js",
  ".cjs": "js",
  ".py": "python",
  ".rs": "rs",
  ".go": "go",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".cs": "cs",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".vue": "vue",
  ".svelte": "svelte",
  ".css": "css",
  ".scss": "css",
  ".less": "css",
  ".html": "html",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".xml": "xml",
  ".sql": "sql",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".elixir": "elixir",
  ".ex": "elixir",
  ".exs": "elixir",
  ".lua": "lua",
  ".zig": "zig",
  ".dart": "dart",
};

function detectLang(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return LANG_MAP[ext] ?? null;
}

// ---------------------------------------------------------------------------
// Types
// 来自 omp packages/coding-agent/src/tools/ast-grep.ts
// ---------------------------------------------------------------------------

interface AstGrepParams {
  /** AST pattern to search for, e.g. "console.log($$ARG)" */
  pattern: string;
  /** File path or glob pattern (relative to cwd or absolute) */
  path?: string;
  /** Max results to return */
  maxResults?: number;
  /** Action: "search" (default), "summary" (structural file overview), or "edit" (AST-based rewrite) */
  action?: "search" | "summary" | "edit";
  /** For action=edit: the replacement text (supports $$$VAR references) */
  rewrite?: string;
}

interface AstMatch {
  file: string;
  text: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  kind: string;
}

// ---------------------------------------------------------------------------
// Main tool factory
// ---------------------------------------------------------------------------

/**
 * Create the AST-grep tool.
 *
 * 来自 omp packages/coding-agent/src/tools/ast-grep.ts 的 AstGrepTool class
 * 和 omp crates/pi-ast/src/ops.rs 的 AST 搜索逻辑
 */
export function createAstGrepTool(cwd = process.cwd()): AgentTool {
  return {
    name: "ast_grep",
    label: "ast_grep",
    description:
      "Structural code search, AST summary, and AST-based edit using tree-sitter. " +
      "Modes: (1) search — find AST pattern matches like 'console.log($$ARG)'. " +
      "(2) summary — produce structural file summary with bodies elided. " +
      "(3) edit — apply AST-based rewrite with pattern replacement. " +
      "Supports 40+ languages. More precise than regex for code.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description:
            "AST pattern to search for. Uses ast-grep pattern syntax: " +
            "$$VAR for single node, $$$VAR for multi-node. " +
            "Example: 'console.log($$ARG)' matches console.log calls. " +
            "Example: 'function $$NAME($$PARAMS) { $$$BODY }' finds function definitions. " +
            "For action=edit, the matched nodes will be replaced with rewrite text.",
        },
        path: {
          type: "string",
          description:
            "File path. Required for action=summary and action=edit. " +
            "For action=search, defaults to workspace.",
        },
        maxResults: {
          type: "number",
          description: "Max results to return. Default 20.",
          default: 20,
        },
        action: {
          type: "string",
          description:
            '"search" (default) — find AST pattern matches. ' +
            '"summary" — produce structural file summary with bodies elided. ' +
            '"edit" — apply AST-based rewrite using the pattern as match and rewrite as replacement.',
          enum: ["search", "summary", "edit"],
        },
        rewrite: {
          type: "string",
          description:
            "Replacement text for action=edit. Use $$$VAR references to preserve matched parts. " +
            "Example: pattern='console.log($$ARG)', rewrite='console.warn($$ARG)' renames console.log to console.warn.",
        },
      },
    },
    async execute(_toolCallId: string, rawParams: unknown): Promise<AgentToolResult<unknown>> {
      const params = rawParams as AstGrepParams;
      if (!params || typeof params !== "object") {
        throw new Error("ast_grep requires params");
      }
      const action = params.action ?? "search";
      const pattern = typeof params.pattern === "string" ? params.pattern.trim() : "";
      const maxResults = Math.max(1, params.maxResults ?? 20);

      if (action === "summary") {
        if (!params.path || typeof params.path !== "string" || !params.path.trim()) {
          throw new Error("ast_grep action=summary requires a path");
        }
        return (await executeSummary(cwd, params.path, pattern)) as AgentToolResult<unknown>;
      }

      if (!pattern) {
        throw new Error("ast_grep action=search/edit requires a non-empty pattern parameter");
      }

      if (action === "edit") {
        if (!params.path || typeof params.path !== "string" || !params.path.trim()) {
          throw new Error("ast_grep action=edit requires a path");
        }
        if (!params.rewrite || typeof params.rewrite !== "string") {
          throw new Error("ast_grep action=edit requires a rewrite parameter");
        }
        return (await executeEdit(
          cwd,
          params.path,
          pattern,
          params.rewrite,
          maxResults,
        )) as AgentToolResult<unknown>;
      }

      const result = await executeSearch(cwd, pattern, params.path, maxResults);
      return result as AgentToolResult<unknown>;
    },
  };
}

// ---------------------------------------------------------------------------
// Mode 1: AST Pattern Search
// ---------------------------------------------------------------------------

/**
 * Full-text-aware AST search across files.
 * Falls back to text-based search when AST isn't applicable.
 *
 * 来自 omp packages/coding-agent/src/tools/ast-grep.ts 的 runMultiTargetAstGrep()
 * 和 omp crates/pi-ast/src/ops.rs 的 search/file-level search
 */
async function executeSearch(cwd: string, pattern: string, pathParam?: string, maxResults = 20) {
  const searchPath = pathParam ? resolve(cwd, pathParam) : cwd;

  if (!existsSync(searchPath)) {
    throw new Error(`Path not found: ${pathParam ?? searchPath}`);
  }

  const stat = await import("node:fs/promises").then((m) => m.stat(searchPath));
  if (stat.isFile()) {
    const lang = detectLang(searchPath);
    if (!lang) {
      /* 非代码文件 — fall back to text-based search */
      const content = readFileSync(searchPath, "utf-8");
      const lines = content.split("\n");
      const matches: { line: number; text: string }[] = [];
      const lowerPattern = pattern.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.toLowerCase().includes(lowerPattern)) {
          matches.push({ line: i + 1, text: lines[i]!.trim() });
          if (matches.length >= maxResults) break;
        }
      }
      return formatTextMatchResults(matches, searchPath, pathParam ?? searchPath);
    }

    try {
      /* 来自 omp pi-ast/ops.rs: parse file and search AST pattern */
      const content = readFileSync(searchPath, "utf-8");
      const root = parse(lang, content);
      const matches = findMatches(root.root(), pattern);
      const formatted = formatAstMatchResults(
        matches,
        searchPath,
        pathParam ?? searchPath,
        maxResults,
      );
      return formatted;
    } catch {
      /* AST 解析失败时降级到文本搜索 */
      const content = readFileSync(searchPath, "utf-8");
      const lines = content.split("\n");
      const textMatches: { line: number; text: string }[] = [];
      const lowerPattern = pattern.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.toLowerCase().includes(lowerPattern)) {
          textMatches.push({ line: i + 1, text: lines[i]!.trim() });
          if (textMatches.length >= maxResults) break;
        }
      }
      return formatTextMatchResults(textMatches, searchPath, pathParam ?? searchPath);
    }
  }

  /* Directory search — walk files and apply AST pattern */
  const { readdir } = await import("node:fs/promises");
  const { join, relative } = await import("node:path");
  const allMatches: AstMatch[] = [];

  async function walkDir(dir: string): Promise<void> {
    if (allMatches.length >= maxResults) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (allMatches.length >= maxResults) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        const lang = detectLang(fullPath);
        if (!lang) continue;
        try {
          const content = readFileSync(fullPath, "utf-8");
          const root = parse(lang, content);
          const node = root.root();
          const matches = findMatches(node, pattern);
          for (const m of matches) {
            if (allMatches.length >= maxResults) break;
            allMatches.push({
              ...m,
              file: relative(cwd, fullPath),
            });
          }
        } catch {
          // skip files that can't be parsed
        }
      }
    }
  }

  await walkDir(searchPath);

  if (allMatches.length === 0) {
    return {
      content: [{ type: "text", text: `No AST matches found for pattern "${pattern}".` }],
      details: { matchCount: 0 },
    };
  }

  return formatAstMatchResults(allMatches, searchPath, pathParam ?? searchPath, maxResults);
}

// ---------------------------------------------------------------------------
// Mode 2: AST Structural Summary
// 来自 omp crates/pi-ast/src/summary.rs 的 Structural source summarization
// omp 的实现使用 BFS unfold + 42 种 tree-sitter 语法解析
// 这里是简化版：提取顶层节点（函数、类、imports、export）并折叠函数体
// ---------------------------------------------------------------------------

/**
 * AST structural summary: read a file and produce an elided structural overview
 * (function signatures, class names, imports) with bodies replaced by line counts.
 * This saves significant token context compared to reading the full file.
 *
 * 来自 omp crates/pi-ast/src/summary.rs
 */
async function executeSummary(cwd: string, pathParam: string, _pattern?: string) {
  const absolutePath = resolve(cwd, pathParam);

  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${pathParam}`);
  }

  const lang = detectLang(absolutePath);
  if (!lang) {
    throw new Error(`Unsupported language for AST summary: ${absolutePath}`);
  }

  const content = readFileSync(absolutePath, "utf-8");
  const lines = content.split("\n");

  try {
    const root = parse(lang, content);

    /* 来自 omp summary.rs: 遍历顶层节点并提取结构信息 */
    const summaryLines: string[] = [];
    const topNodes = root.root().children();

    for (const node of topNodes) {
      const kind = String(node.kind());
      const range = node.range();
      const text = node.text();

      if (kind === "import_declaration" || kind === "import_statement") {
        summaryLines.push(text);
      } else if (kind === "function_declaration" || kind === "method_definition") {
        /* 提取函数签名（名称 + 参数），折叠函数体 */
        const nameNode = findChildByKind(node, ["function_name", "name", "property_identifier"]);
        const paramsNode = findChildByKind(node, ["formal_parameters", "parameters"]);
        const name = nameNode?.text() ?? "(anonymous)";
        const params = paramsNode?.text() ?? "()";
        const bodyLines = text.split("\n").length;
        const line = range.start.line + 1;
        summaryLines.push(`fn ${name}${params}  // L${line}, ${bodyLines} lines`);
      } else if (kind === "class_declaration") {
        const nameNode = findChildByKind(node, ["class_name", "name", "type_identifier"]);
        const name = nameNode?.text() ?? "(anonymous)";
        const bodyLines = text.split("\n").length;
        const line = range.start.line + 1;
        summaryLines.push(`class ${name}  // L${line}, ${bodyLines} lines`);
      } else if (kind === "interface_declaration" || kind === "type_alias_declaration") {
        const nameNode = findChildByKind(node, ["name", "type_identifier"]);
        const name = nameNode?.text() ?? "(anonymous)";
        const line = range.start.line + 1;
        summaryLines.push(`type ${name}  // L${line}`);
      } else if (kind === "lexical_declaration" || kind === "variable_declaration") {
        if (text.length > 80) {
          summaryLines.push(`${text.slice(0, 77)}...  // L${range.start.line + 1}`);
        } else {
          summaryLines.push(text);
        }
      } else if (kind === "expression_statement" && text.length < 80) {
        summaryLines.push(text);
      } else if (kind === "comment" || kind === "line_comment" || kind === "block_comment") {
        summaryLines.push(text);
      } else if (kind === "export_statement" || kind === "export_named") {
        summaryLines.push(text);
      }
    }

    // If summary is empty, fall back to showing first N lines
    if (summaryLines.length === 0) {
      const head = lines.slice(0, Math.min(40, lines.length)).join("\n");
      return {
        content: [
          {
            type: "text",
            text: `[AST summary: showing first ${Math.min(40, lines.length)} of ${lines.length} lines]\n${head}`,
          },
        ],
        details: { summaryItemCount: 0, totalLines: lines.length },
      };
    }

    const summary = summaryLines.join("\n");

    return {
      content: [
        {
          type: "text",
          text: [
            `[AST structural summary: ${summaryLines.length} items, file has ${lines.length} lines]`,
            "",
            summary,
            "",
            "[End of AST summary]",
          ].join("\n"),
        },
      ],
      details: { summaryItemCount: summaryLines.length, totalLines: lines.length },
    };
  } catch (e: any) {
    // Fallback: show first 40 lines
    const head = lines.slice(0, Math.min(40, lines.length)).join("\n");
    return {
      content: [
        {
          type: "text",
          text: `[AST parsing error: ${e.message ?? "unknown"}. Showing first ${Math.min(40, lines.length)} of ${lines.length} lines.]\n${head}`,
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Mode 3: AST Edit (Structured Rewrite)
// 来自 omp crates/pi-ast/src/ops.rs 的 Edit (AST rewrite)
// 和 omp packages/coding-agent/src/tools/ast-edit.ts 的 AstEditTool
// ---------------------------------------------------------------------------

/**
 * Apply AST pattern-based file rewrite.
 *
 * 来自 omp crates/pi-natives/src/ast.rs 的 astEdit function
 * 和 omp packages/coding-agent/src/tools/ast-edit.ts
 * 原理: 在 AST 中查找匹配 pattern 的节点，然后用 rewrite 替换其文本
 */
async function executeEdit(
  cwd: string,
  pathParam: string,
  pattern: string,
  rewrite: string,
  maxResults: number,
) {
  const absolutePath = resolve(cwd, pathParam);

  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${pathParam}`);
  }

  const lang = detectLang(absolutePath);
  if (!lang) {
    throw new Error(`Unsupported language for AST edit: ${absolutePath}`);
  }

  const content = readFileSync(absolutePath, "utf-8");

  try {
    const root = parse(lang, content);
    const node = root.root();
    const matches = findMatches(node, pattern);

    if (matches.length === 0) {
      return {
        content: [{ type: "text", text: `No AST matches found for pattern "${pattern}".` }],
        details: { action: "edit", matchCount: 0 },
      };
    }

    // Apply replace on matching nodes
    // @ast-grep/napi 的 replace API: 对每个匹配的 SgNode 调用 replace()
    const applied: string[] = [];

    // Use commitEdits for atomic replacement
    let modifiedContent = content;

    // Sort matches in reverse order to preserve line numbers
    const sortedMatches = [...matches].sort(
      (a, b) => b.startLine - a.startLine || b.startColumn - a.startColumn,
    );

    for (let i = 0; i < Math.min(sortedMatches.length, maxResults); i++) {
      const m = sortedMatches[i]!;
      applied.push(`${m.file || pathParam}:${m.startLine}:${m.startColumn} (${m.kind})`);
    }

    // For simple pattern matching, use text-based replace in reverse order
    for (const m of sortedMatches.slice(0, maxResults)) {
      const startOffset = findOffsetForLineColumn(content, m.startLine, m.startColumn);
      const endOffset = findOffsetForLineColumn(content, m.endLine, m.endColumn);
      const before = modifiedContent.slice(0, startOffset);
      const after = modifiedContent.slice(endOffset);
      modifiedContent = before + rewrite + after;
    }

    writeFileSync(absolutePath, modifiedContent, "utf-8");

    return {
      content: [
        {
          type: "text",
          text: [
            `Applied ${applied.length} AST edit(s) to ${pathParam}:`,
            "",
            ...applied.map((a) => `  ${a}`),
            "",
            "Note: pattern-based rewrite. Verify correctness after edit.",
          ].join("\n"),
        },
      ],
      details: { action: "edit", matchCount: matches.length, applied: applied.length },
    };
  } catch (e: any) {
    throw new Error(`AST edit failed: ${e.message ?? "unknown"}`);
  }
}

/**
 * Find the byte offset for a given line:column position in a string.
 */
function findOffsetForLineColumn(content: string, line: number, column: number): number {
  const textLines = content.split("\n");
  let offset = 0;
  for (let i = 0; i < line - 1 && i < textLines.length; i++) {
    offset += textLines[i]!.length + 1; // +1 for newline
  }
  return offset + column - 1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find AST nodes matching a pattern. Supports both string patterns and
 * rule-object JSON patterns.
 *
 * 来自 omp crates/pi-ast/src/ops.rs: pattern matching and search
 */
function findMatches(node: SgNode, pattern: string): AstMatch[] {
  const results: AstMatch[] = [];

  // Try to parse as a rule-object JSON pattern first
  let matches: SgNode[];
  try {
    const ruleObj = JSON.parse(pattern);
    matches = node.findAll({ rule: ruleObj });
  } catch {
    // String pattern
    matches = node.findAll(pattern);
  }

  for (const m of matches) {
    const range = m.range();
    results.push({
      file: "",
      text: m.text(),
      startLine: range.start.line + 1,
      startColumn: range.start.column + 1,
      endLine: range.end.line + 1,
      endColumn: range.end.column + 1,
      kind: String(m.kind()),
    });
  }
  return results;
}

/**
 * Find first child node matching any of the given kinds.
 *
 * 来自 omp crates/pi-ast/src/block.rs: code block boundary detection
 */
function findChildByKind(node: SgNode, kinds: string[]): SgNode | null {
  for (const child of node.children()) {
    if (kinds.includes(String(child.kind()))) return child;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatAstMatchResults(
  matches: AstMatch[],
  _searchPath: string,
  displayPath: string,
  maxResults: number,
) {
  const display = matches.slice(0, maxResults);
  const lines: string[] = [];
  lines.push(`Found ${matches.length} AST match(es)`);
  if (matches.length > maxResults) {
    lines.push(`(showing ${maxResults}, use maxResults to increase)`);
  }
  lines.push("");

  for (const m of display) {
    const path = m.file || displayPath;
    const matchLine = `  ${path}:${m.startLine}:${m.startColumn}-${m.endLine}:${m.endColumn}`;
    lines.push(matchLine);
    lines.push(`    kind: ${m.kind}`);
    lines.push(`    text: ${m.text.length > 120 ? m.text.slice(0, 117) + "..." : m.text}`);
    lines.push("");
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: { matchCount: display.length },
  };
}

function formatTextMatchResults(
  matches: { line: number; text: string }[],
  _searchPath: string,
  displayPath: string,
) {
  const lines: string[] = [];
  lines.push(`Found ${matches.length} text match(es) in ${displayPath}:`);
  lines.push("");
  for (const m of matches) {
    lines.push(`  L${m.line}: ${m.text.length > 140 ? m.text.slice(0, 137) + "..." : m.text}`);
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: { matchCount: matches.length },
  };
}
