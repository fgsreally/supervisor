import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  AstFindMatch,
  AstFindOptions,
  AstFindResult,
  AstReplaceOptions,
  AstReplaceResult,
  BashFixupResult,
  GlobMatch,
  GlobOptions,
  GlobResult,
  GrepMatch,
  GrepOptions,
  GrepResult,
  HtmlToMarkdownOptions,
  ListWorkspaceOptions,
  ListWorkspaceResult,
  MinimizerOptions,
  MinimizerResult,
  ShellExecuteOptions,
  ShellRunResult,
  SummaryOptions,
  SummaryResult,
} from "@oh-my-pi/pi-natives";

export type PiNativesBindings = {
  __ompInstallTokioRuntime?: () => void;
  executeShell: (
    options: ShellExecuteOptions,
    onChunk?: ((error: Error | null, chunk: string) => void) | null,
  ) => Promise<ShellRunResult>;
  grep: (
    options: GrepOptions,
    onMatch?: ((error: Error | null, match: GrepMatch) => void) | null,
  ) => Promise<GrepResult>;
  glob: (
    options: GlobOptions,
    onMatch?: ((error: Error | null, match: GlobMatch) => void) | null,
  ) => Promise<GlobResult>;
  summarizeCode: (options: SummaryOptions) => SummaryResult;
  applyBashFixups: (command: string) => BashFixupResult;
  astGrep: (options: AstFindOptions) => Promise<AstFindResult>;
  astEdit: (options: AstReplaceOptions) => Promise<AstReplaceResult>;
  htmlToMarkdown: (html: string, options?: HtmlToMarkdownOptions | null) => Promise<string>;
  listWorkspace: (options: ListWorkspaceOptions) => Promise<ListWorkspaceResult>;
  invalidateFsScanCache: (path?: string | null) => void;
};

export type {
  AstFindMatch,
  AstFindOptions,
  AstFindResult,
  AstReplaceOptions,
  AstReplaceResult,
  BashFixupResult,
  GlobMatch,
  GlobOptions,
  GlobResult,
  GrepMatch,
  GrepOptions,
  GrepResult,
  HtmlToMarkdownOptions,
  ListWorkspaceOptions,
  ListWorkspaceResult,
  MinimizerOptions,
  MinimizerResult,
  ShellExecuteOptions,
  ShellRunResult,
  SummaryOptions,
  SummaryResult,
};

/** Platforms that omp publishes prebuilt `.node` binaries for. */
const SUPPORTED_PLATFORMS = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64"];

const REQUIRED_BINDINGS: Array<keyof PiNativesBindings> = [
  "executeShell",
  "grep",
  "glob",
  "summarizeCode",
  "applyBashFixups",
  "astGrep",
  "astEdit",
  "htmlToMarkdown",
  "listWorkspace",
  "invalidateFsScanCache",
];

let cached: PiNativesBindings | null | undefined;

/**
 * Load the Rust native addon for the **current** OS/CPU only.
 *
 * Supervisor runs on **Node**, not Bun. The official `@oh-my-pi/pi-natives`
 * JS loader uses Bun-only `import.meta.dir`, so we require the platform
 * package directly (e.g. `@oh-my-pi/pi-natives-win32-x64`).
 */
export function loadPiNativesBindings(): PiNativesBindings {
  if (cached !== undefined) return cached as PiNativesBindings;

  const platformTag = `${process.platform}-${process.arch}`;
  if (!SUPPORTED_PLATFORMS.includes(platformTag)) {
    throw new Error(
      `native: unsupported platform ${platformTag} (supported: ${SUPPORTED_PLATFORMS.join(", ")})`,
    );
  }

  const require = createRequire(import.meta.url);
  const pkgName = `@oh-my-pi/pi-natives-${platformTag}`;
  let pkgJsonPath: string;
  try {
    pkgJsonPath = require.resolve(`${pkgName}/package.json`);
  } catch {
    throw new Error(
      `native: missing platform package ${pkgName}. Reinstall this extension so npm can fetch the native binary for your machine.`,
    );
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { main?: string };
  const main = pkgJson.main ?? `pi_natives.${platformTag}.node`;
  const addonPath = join(dirname(pkgJsonPath), main);
  const bindings = require(addonPath) as PiNativesBindings;

  for (const key of REQUIRED_BINDINGS) {
    if (typeof bindings[key] !== "function") {
      throw new Error(`native: ${addonPath} does not export ${key}`);
    }
  }

  bindings.__ompInstallTokioRuntime?.();
  cached = bindings;
  return bindings;
}

export function isPiNativesAvailable(): boolean {
  try {
    loadPiNativesBindings();
    return true;
  } catch {
    return false;
  }
}
