/**
 * Output minimizer for shell tool results.
 *
 * Inspired by oh-my-pi's shell output minimizer (pi-shell/src/minimizer/).
 * Reference: oh-my-pi/crates/pi-shell/src/minimizer/  -- 来自 oh-my-pi (omp) 的 output minimizer 移植
 * omp 的原版实现是 Rust 原生，有 25+ filters + TOML 配置。
 * 这里是 TypeScript 移植版本，包含 11 个最常用的 filter，未来可以扩展。
 *
 * Pipeline stages（来自 omp pi-shell/src/minimizer/pipeline.rs）:
 * 1. match_output  — detect known patterns and replace with a one-line summary
 * 2. strip_lines   — remove lines matching patterns (e.g. progress, timestamps)
 * 3. keep_lines    — only keep lines matching certain patterns
 * 4. replace       — regex text substitution
 * 5. head/tail     — keep first/last N lines
 */

// ---------------------------------------------------------------------------
// Filter Types  -- 来自 omp pi-shell/src/minimizer/config.rs 的 MinimizerConfig/MinimizerOptions
// ---------------------------------------------------------------------------

export interface MinimizerFilter {
  /** Command pattern to match (e.g. "git", "npm", "cargo") -- 来自 omp detect.rs 的 CommandIdentity.program */
  matchCommand: string;
  /** Optional subcommand pattern (e.g. "log", "build", "test") -- 来自 omp detect.rs 的 CommandIdentity.subcommand */
  matchSubcommand?: string;

  /** Short-circuit: if full output matches this, replace with a one-line summary -- 来自 omp pipeline.rs 的 match_output 阶段 */
  matchOutput?: Array<{
    pattern: string;
    summary: string;
    unless?: string;
  }>;

  /** Lines matching these patterns are removed -- 来自 omp pipeline.rs 的 strip_lines_matching 阶段 */
  stripLines?: string[];

  /** Only keep lines matching these patterns (takes precedence over strip) -- 来自 omp pipeline.rs 的 keep_lines_matching 阶段 */
  keepLines?: string[];

  /** Regex substitutions applied line-by-line -- 来自 omp pipeline.rs 的 replace 阶段 */
  replace?: Array<{
    pattern: string;
    replacement: string;
  }>;

  /** Keep only first N lines -- 来自 omp pipeline.rs 的 head_lines 阶段 */
  head?: number;

  /** Keep only last N lines -- 来自 omp pipeline.rs 的 tail_lines 阶段 */
  tail?: number;

  /** Max total lines after head/tail -- 来自 omp pipeline.rs 的 max_lines 阶段 */
  maxLines?: number;
}

// ---------------------------------------------------------------------------
// Built-in Filters
// 每个 filter 的匹配模式来自 omp crates/pi-shell/src/minimizer/filters/ 中的 Rust 实现
// ---------------------------------------------------------------------------

const BUILTIN_FILTERS: MinimizerFilter[] = [
  // ---- git log ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/git.rs
  {
    matchCommand: "git",
    matchSubcommand: "log",
    matchOutput: [
      {
        pattern: "^commit\\s+[0-9a-f]{40}",
        summary: "[git log: matches found]",
        unless: "^$",
      },
    ],
    stripLines: ["^commit\\s+[0-9a-f]{40}", "^Author:", "^Date:", "^    "],
    keepLines: [],
    head: 30,
  },

  // ---- git diff ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/git.rs
  {
    matchCommand: "git",
    matchSubcommand: "diff",
    stripLines: [
      "^--- ",
      "^\\+\\+\\+ ",
      "^@@ ",
      "^diff --git",
      "^index ",
      "^new file",
      "^deleted file",
    ],
    keepLines: [],
    maxLines: 200,
  },

  // ---- git status ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/git.rs
  {
    matchCommand: "git",
    matchSubcommand: "status",
    matchOutput: [
      {
        pattern: "nothing to commit",
        summary: "[git status: clean]",
      },
      {
        pattern: "nothing added to commit",
        summary: "[git status: unstaged changes]",
      },
    ],
    stripLines: ['^\\(use "git', '^\\(use \\"git', "no changes added"],
  },

  // ---- npm ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/pkg.rs (package manager)
  {
    matchCommand: "npm",
    matchOutput: [
      {
        pattern: "up to date",
        summary: "[npm: up to date]",
      },
      {
        pattern: "added \\d+ packages?",
        summary: "[npm: packages added/changed]",
      },
      {
        pattern: "found \\d+ vulnerabilities?",
        summary: "[npm: vulnerabilities detected; see full output]",
      },
    ],
    stripLines: ["^npm http", "^npm warn", "^npm notice", "^  - "],
    head: 50,
    tail: 20,
    maxLines: 70,
  },

  // ---- cargo build ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/cargo.rs
  {
    matchCommand: "cargo",
    matchSubcommand: "build",
    matchOutput: [
      {
        pattern: "Finished\\s+\\[",
        summary: "[cargo build: completed]",
      },
      {
        pattern: "Compiling\\s+",
        summary: "[cargo build: compiling...]",
        unless: "^error",
      },
    ],
    stripLines: [
      "^   Compiling\\s+",
      "^    Finished\\s+",
      "^     Running\\s+",
      "^       Fresh\\s+",
      "^   Downloading",
      "^    Updating",
      "^   Locking",
    ],
    keepLines: ["^error", "^warning", "^(\\s*\\d+:)?\\s*error\\[", "^   = note:", "^   = help:"],
    maxLines: 100,
  },

  // ---- cargo test ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/cargo.rs
  {
    matchCommand: "cargo",
    matchSubcommand: "test",
    matchOutput: [
      {
        pattern: "test result:",
        summary: "[cargo test: see results below]",
      },
    ],
    stripLines: [
      "^    Finished\\s+",
      "^     Running\\s+",
      "^   Compiling\\s+",
      "^       Fresh\\s+",
    ],
    head: 100,
    tail: 30,
    maxLines: 130,
  },

  // ---- pytest ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/python.rs
  {
    matchCommand: "pytest",
    matchOutput: [
      {
        pattern: "passed\\/failed",
        summary: "[pytest: results below]",
      },
    ],
    stripLines: [
      "^=+\\s+(test session|short test summary)",
      "^platform\\s+",
      "^rootdir\\s*:",
      "^plugins\\s*:",
      "^collected\\s+",
      "^\\.s*\\.?$",
    ],
    keepLines: ["FAILED", "ERROR", "PASSED", "passed", "failed", "^test_"],
    head: 80,
    tail: 20,
    maxLines: 100,
  },

  // ---- docker build ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/docker.rs
  {
    matchCommand: "docker",
    matchSubcommand: "build",
    stripLines: ["^\\[\\d+/\\d+\\]", "^\\s*=>\\s+", "^\\s*=>#\\s+", "^#\\d+ "],
    keepLines: ["^error", "^ERROR", "^Successfully", "^exporting"],
    maxLines: 50,
  },

  // ---- make ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/generic.rs
  {
    matchCommand: "make",
    matchOutput: [
      {
        pattern: "Nothing to be done",
        summary: "[make: nothing to do]",
      },
    ],
    stripLines: ["^(make\\[\\d+\\]):"],
    maxLines: 100,
  },

  // ---- npx ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/js_tools.rs
  {
    matchCommand: "npx",
    stripLines: ["^npm http", "^npm warn", "^Need to install", "^    Installing"],
    maxLines: 100,
  },

  // ---- go test/build ----
  // 来自 omp crates/pi-shell/src/minimizer/filters/go.rs
  {
    matchCommand: "go",
    matchSubcommand: "test",
    stripLines: ["^ok\\s+", "^\\?\\s+"],
    keepLines: ["^--- FAIL", "^FAIL", "^    "],
    head: 60,
    tail: 20,
    maxLines: 80,
  },
];

// ---------------------------------------------------------------------------
// Command Detection
// 来自 omp crates/pi-shell/src/minimizer/detect.rs
// ---------------------------------------------------------------------------

interface CommandIdentity {
  program: string;
  subcommand?: string;
}

// 来自 omp detect.rs: detect() / detect_tokens()
function detectCommand(command: string): CommandIdentity | null {
  const trimmed = command.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return null;

  const program = tokens[0]!.toLowerCase();
  // Common subcommand patterns
  const subcommand = tokens.find((t) => !t.startsWith("-")) ?? undefined;

  // Handle known multi-arg patterns where subcommand is at index 1
  // e.g., "git log", "cargo build", "npm install"
  let firstArg = tokens[1];
  if (firstArg && !firstArg.startsWith("-") && tokens.length > 1) {
    return { program, subcommand: firstArg.toLowerCase() };
  }

  return { program };
}

// ---------------------------------------------------------------------------
// Minimizer
// ---------------------------------------------------------------------------

export interface MinimizerResult {
  minimized: boolean;
  text: string;
  originalLines: number;
  minimizedLines: number;
  filterName?: string;
}

/**
 * Apply output minimization to a shell command's output.
 *
 * Pipeline logic 来自 omp crates/pi-shell/src/minimizer/pipeline.rs
 * Returns the minimized text (or original if no filter matches).
 */
export function minimizeOutput(command: string, stdout: string): MinimizerResult {
  const identity = detectCommand(command);
  if (!identity) {
    return {
      minimized: false,
      text: stdout,
      originalLines: stdout.split("\n").length,
      minimizedLines: stdout.split("\n").length,
    };
  }

  const lines = stdout.split("\n");
  const originalLines = lines.length;

  for (const filter of BUILTIN_FILTERS) {
    if (filter.matchCommand !== identity.program) continue;

    // Check subcommand (来自 omp detect.rs)
    if (filter.matchSubcommand) {
      if (!identity.subcommand || identity.subcommand !== filter.matchSubcommand) continue;
    }

    let processed = [...lines];
    let matchedFilter = filter.matchCommand;
    if (filter.matchSubcommand) matchedFilter += ` ${filter.matchSubcommand}`;

    // Stage 1: match_output short-circuit (来自 omp pipeline.rs 的 match_output 阶段)
    if (filter.matchOutput) {
      const fullText = processed.join("\n");
      for (const mo of filter.matchOutput) {
        const re = new RegExp(mo.pattern, "m");
        if (re.test(fullText)) {
          if (mo.unless) {
            const unlessRe = new RegExp(mo.unless, "m");
            if (unlessRe.test(fullText)) continue;
          }
          return {
            minimized: true,
            text: mo.summary,
            originalLines,
            minimizedLines: 1,
            filterName: `${matchedFilter} (match_output)`,
          };
        }
      }
    }

    // Stage 2: strip lines matching patterns (来自 omp pipeline.rs 的 strip_lines_matching 阶段)
    if (filter.stripLines && filter.stripLines.length > 0) {
      const stripRes: RegExp[] = filter.stripLines.map((p) => new RegExp(p));
      processed = processed.filter((line) => !stripRes.some((re) => re.test(line)));
    }

    // Stage 3: keep only matching lines (来自 omp pipeline.rs 的 keep_lines_matching 阶段)
    if (filter.keepLines && filter.keepLines.length > 0) {
      const keepRes: RegExp[] = filter.keepLines.map((p) => new RegExp(p));
      const kept = processed.filter((line) => keepRes.some((re) => re.test(line)));
      if (kept.length > 0) {
        processed = kept;
      }
    }

    // Stage 4: regex replace (来自 omp pipeline.rs 的 replace 阶段)
    if (filter.replace) {
      for (const r of filter.replace) {
        const re = new RegExp(r.pattern, "g");
        processed = processed.map((line) => line.replace(re, r.replacement));
      }
    }

    // Stage 5: head/tail (来自 omp pipeline.rs 的 head_lines / tail_lines 阶段)
    if (filter.head !== undefined && processed.length > filter.head) {
      const tail = filter.tail !== undefined ? processed.slice(-filter.tail) : [];
      processed = processed.slice(0, filter.head);
      if (tail.length > 0) {
        processed.push(`[... ${originalLines - filter.head - tail.length} lines omitted]`);
        processed.push(...tail);
      } else if (originalLines > filter.head) {
        processed.push(`[... ${originalLines - filter.head} lines omitted]`);
      }
    }

    // Stage 6: max lines cap (来自 omp pipeline.rs 的 max_lines 阶段)
    if (filter.maxLines !== undefined && processed.length > filter.maxLines) {
      const omitted = processed.length - filter.maxLines;
      processed = processed.slice(0, filter.maxLines);
      processed.push(
        `[... ${omitted + (originalLines - filter.maxLines > 0 ? originalLines - filter.maxLines - omitted : 0)} lines omitted]`,
      );
    }

    const result = processed.join("\n");
    // Only report minimized if we actually changed something
    if (result !== stdout) {
      return {
        minimized: true,
        text: result,
        originalLines,
        minimizedLines: processed.length,
        filterName: matchedFilter,
      };
    }

    return {
      minimized: false,
      text: stdout,
      originalLines,
      minimizedLines: lines.length,
    };
  }

  return { minimized: false, text: stdout, originalLines, minimizedLines: lines.length };
}

// ---------------------------------------------------------------------------
// Test / Demo
// ---------------------------------------------------------------------------

/**
 * Quick test: pipe the output of a real command through the minimizer.
 */
export function demoMinimizer(): void {
  const testCases: Array<{ command: string; output: string }> = [
    {
      command: "git log --oneline -5",
      output: [
        "commit a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
        "Author: Developer <dev@example.com>",
        "Date:   Mon Jan 1 12:00:00 2025 +0000",
        "",
        "    fix: resolve issue with login flow",
        "",
        "commit b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c",
        "Author: Developer <dev@example.com>",
        "Date:   Mon Jan 1 11:00:00 2025 +0000",
        "",
        "    feat: add user profile page",
      ].join("\n"),
    },
    {
      command: "npm install express",
      output: ["added 42 packages in 3s", "", "42 packages are looking for funding"].join("\n"),
    },
    {
      command: "cargo build",
      output: [
        "   Compiling pi-core v0.1.0",
        "   Compiling supervisor v0.1.0",
        "error[E0308]: mismatched types",
        "  --> src/main.rs:42:5",
        "   |",
        '42 |     let x: i32 = "hello";',
        "   |         -----   ^^^^^^^ expected `i32`, found `&str`",
        "   |         |",
        "   |         expected due to this",
        "   = note: expected type `i32`",
        "            found type `&str`",
        "",
        "error: could not compile `pi-core` due to 1 previous error",
        "    Finished dev [unoptimized + debuginfo] target",
      ].join("\n"),
    },
  ];

  for (const { command, output } of testCases) {
    const result = minimizeOutput(command, output);
    const saved = ((1 - result.minimizedLines / result.originalLines) * 100).toFixed(0);
    console.log(`\n=== ${command} ===`);
    console.log(`Original: ${result.originalLines} lines`);
    if (result.minimized) {
      console.log(`Minimized: ${result.minimizedLines} lines (saved ${saved}%)`);
      console.log(`Result:\n${result.text}`);
    } else {
      console.log("No minimization applied (unchanged)");
    }
  }
}

// Run demo if executed directly
const isMain =
  process.argv[1]?.endsWith("output-minimizer.ts") ||
  process.argv[1]?.endsWith("output-minimizer.js");
if (isMain) {
  demoMinimizer();
}
