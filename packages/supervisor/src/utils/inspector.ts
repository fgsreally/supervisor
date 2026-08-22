import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { inspect } from "node:util";
import { join } from "node:path";

type InspectorActor = "session" | "watson";

type PayloadHookHarness = {
  on(
    type: "before_provider_payload",
    handler: (event: { type: "before_provider_payload"; payload: unknown }) => {
      payload: unknown;
    },
  ): () => void;
};

export interface InspectorCapture {
  attach(harness: PayloadHookHarness): void;
  capture(payload: unknown, turn?: number): void;
  detach(): void;
  clear(): void;
}

export function inspectorEnabled(): boolean {
  return process.env.PI_SUPERVISOR_INSPECTOR === "1";
}

export function createInspectorCapture(options: {
  actor: InspectorActor;
  rootDir: string;
  sessionId?: number | string;
}): InspectorCapture {
  let directory: string | undefined;
  let sequence = 0;
  let unsubscribe: (() => void) | undefined;

  function ensureDirectory(): string {
    if (directory) return directory;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    directory = join(options.rootDir, `inspector-${stamp}`);
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  function capture(payload: unknown, turn?: number): void {
    if (!inspectorEnabled()) return;
    const index = turn ?? ++sequence;
    const fileName = `turn-${String(index).padStart(4, "0")}-${Date.now()}.log`;
    const header = [
      `actor: ${options.actor}`,
      ...(options.sessionId == null ? [] : [`session: ${options.sessionId}`]),
      `turn: ${index}`,
      `time: ${new Date().toISOString()}`,
      "",
      "=== payload ===",
      "",
    ].join("\n");
    writeFileSync(
      join(ensureDirectory(), fileName),
      `${header}${inspect(redact(payload), { depth: Infinity, colors: false, compact: false, maxArrayLength: Infinity, maxStringLength: Infinity })}\n`,
      "utf8",
    );
  }

  function detach(): void {
    unsubscribe?.();
    unsubscribe = undefined;
  }

  return {
    attach(harness): void {
      detach();
      unsubscribe = harness.on("before_provider_payload", (event) => {
        capture(event.payload);
        return { payload: event.payload };
      });
    },
    capture,
    detach,
    clear(): void {
      detach();
      if (directory && existsSync(directory)) rmSync(directory, { recursive: true, force: true });
      directory = undefined;
      sequence = 0;
    },
  };
}

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
      .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "[REDACTED]");
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? "[REDACTED]" : redact(item, seen);
  }
  return output;
}

function isSensitiveKey(key: string): boolean {
  return /(?:api[_-]?key|authorization|cookie|password|secret|token|private[_-]?key)/i.test(key);
}

export function removeInspectorDirectory(rootDir: string): void {
  if (existsSync(rootDir)) rmSync(rootDir, { recursive: true, force: true });
}
