import { sessionLog } from "./session-log.js";

/** Lightweight timing logs to locate slow session create / prompt stages. */
export function beginSessionTiming(sessionId: number | string, phase: string): () => void {
  const started = Date.now();
  const label = `[session-timing ${sessionId}] ${phase}`;
  console.log(`${label} start`);
  sessionLog(sessionId, "info", `${phase} start`, ["system", "timing"], { phase });
  return () => {
    const durationMs = Date.now() - started;
    console.log(`${label} done ${durationMs}ms`);
    sessionLog(sessionId, "info", `${phase} done ${durationMs}ms`, ["system", "timing"], {
      phase,
      durationMs,
    });
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
