import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPiNativesBindings } from "../pi-natives-loader.js";

const GLOB_TIMEOUT_MS = 5000;

function escapeGlobMetachars(value: string): string {
  return value.replace(/[*?[{]/g, "[$&]");
}

export type SuffixResolution = {
  absolutePath: string;
  displayPath: string;
  from: string;
};

/**
 * Resolve a missing path via unique workspace suffix glob (omp read behavior).
 */
export async function findUniqueSuffixMatch(
  rawPath: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<SuffixResolution | null> {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized) return null;

  const pattern = `**/${escapeGlobMetachars(normalized)}`;
  const timeoutSignal = AbortSignal.timeout(GLOB_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const natives = loadPiNativesBindings();
    const result = await natives.glob(
      {
        pattern,
        path: cwd,
        hidden: true,
        gitignore: true,
        signal: combinedSignal,
        timeoutMs: GLOB_TIMEOUT_MS,
      },
      null,
    );

    if (result.matches.length !== 1) return null;

    const match = result.matches[0]!;
    const displayPath = match.path.replace(/\\/g, "/");
    return {
      absolutePath: resolve(cwd, displayPath),
      displayPath,
      from: rawPath,
    };
  } catch {
    return null;
  }
}

export async function resolveReadablePath(
  rawPath: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<{ absolutePath: string; suffixResolution?: SuffixResolution }> {
  const trimmed = rawPath.trim();
  const direct = resolve(cwd, trimmed);
  if (existsSync(direct)) {
    return { absolutePath: direct };
  }

  const suffix = await findUniqueSuffixMatch(trimmed, cwd, signal);
  if (suffix) {
    return { absolutePath: suffix.absolutePath, suffixResolution: suffix };
  }

  return { absolutePath: direct };
}

export function prependSuffixNotice(text: string, suffix?: SuffixResolution): string {
  if (!suffix) return text;
  const notice = `[Path '${suffix.from}' not found; resolved to '${suffix.displayPath}' via suffix match]`;
  return text ? `${notice}\n${text}` : notice;
}
