import type { MinimizerOptions } from "../pi-natives-loader.js";

/**
 * Build Rust minimizer options for executeShell.
 * Honors OMP_MINIMIZER_* env vars when set (aligned with omp shellMinimizer).
 */
export function buildMinimizerOptions(): MinimizerOptions {
  const enabled = process.env.OMP_MINIMIZER_ENABLED !== "false";
  if (!enabled) return { enabled: false };

  const options: MinimizerOptions = { enabled: true };

  const settingsPath = process.env.OMP_MINIMIZER_SETTINGS_PATH?.trim();
  if (settingsPath) options.settingsPath = settingsPath;

  const settingsHash = process.env.OMP_MINIMIZER_SETTINGS_HASH?.trim();
  if (settingsHash) options.settingsHash = settingsHash;

  const only = process.env.OMP_MINIMIZER_ONLY?.trim();
  if (only) {
    options.only = only
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const except = process.env.OMP_MINIMIZER_EXCEPT?.trim();
  if (except) {
    options.except = except
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const maxCapture = process.env.OMP_MINIMIZER_MAX_CAPTURE_BYTES?.trim();
  if (maxCapture) {
    const n = Number(maxCapture);
    if (Number.isFinite(n) && n > 0) options.maxCaptureBytes = Math.floor(n);
  }

  const outline = process.env.OMP_MINIMIZER_SOURCE_OUTLINE?.trim();
  if (outline) options.sourceOutlineLevel = outline;

  if (process.env.OMP_MINIMIZER_LEGACY_FILTERS === "1") {
    options.legacyFilters = true;
  }

  return options;
}
