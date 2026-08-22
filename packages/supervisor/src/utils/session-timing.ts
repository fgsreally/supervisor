import { sessionLog, sessionLogEvent } from "./session-log.js";

/** Lightweight timing logs to locate slow session create / prompt stages. */
export function beginSessionTiming(sessionId: number | string, phase: string): () => void {
  const started = Date.now();
  sessionLogEvent(
    sessionId,
    "info",
    "runtime.sessionTimingStart",
    { id: sessionId, phase },
    ["timing"],
    { phase },
  );
  return () => {
    const durationMs = Date.now() - started;
    sessionLogEvent(
      sessionId,
      "info",
      "runtime.sessionTimingDone",
      { id: sessionId, phase, durationMs },
      ["timing"],
      { phase, durationMs },
    );
  };
}

export async function timedSessionStep<T>(
  sessionId: number | string,
  phase: string,
  work: () => Promise<T>,
): Promise<T> {
  const done = beginSessionTiming(sessionId, phase);
  try {
    return await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sessionLog(sessionId, "error", `${phase} failed: ${message}`, ["system", "timing"], {
      phase,
      error: message,
    });
    throw error;
  } finally {
    done();
  }
}
