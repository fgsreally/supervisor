/** Normalize unknown thrown/rejected values into a user-facing message. */
export function formatUnknownError(error: unknown, fallback = "未知错误"): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message || fallback;
  }
  if (error && typeof error === "object") {
    const item = error as Record<string, unknown>;
    if (typeof item.message === "string" && item.message.trim()) return item.message.trim();
    if (typeof item.error === "string" && item.error.trim()) return item.error.trim();
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}
