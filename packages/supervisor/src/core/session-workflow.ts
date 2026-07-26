/** Session stage label (replaces former meta.workflow { stage, status }). */

export function normalizeSessionStage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const stage = value.trim();
  return stage.length > 0 ? stage : null;
}
