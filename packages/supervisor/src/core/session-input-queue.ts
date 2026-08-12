import type { SessionPromptImage } from "./session-media.js";

/** Default level for routine queued inputs (user follow-ups, shadow notes). */
export const DEFAULT_SESSION_INPUT_LEVEL = 50;

/** Shadow / side-channel inputs default lower unless explicitly raised. */
export const DEFAULT_PARENT_MESSAGE_LEVEL = 0;

/**
 * At or above this level the input bypasses the queue and interrupts the active turn
 * (abort in-flight LLM work, then prompt immediately).
 */
export const SESSION_INPUT_INTERRUPT_LEVEL = 90;

export interface SessionQueuedInput {
  id: string;
  message: string;
  level: number;
  source: string | null;
  origin?: string;
  enqueuedAt: number;
  images?: SessionPromptImage[];
}

export type SessionInputDisposition = "interrupt" | "queued" | "drained";

function compareQueuedInputs(a: SessionQueuedInput, b: SessionQueuedInput): number {
  if (b.level !== a.level) return b.level - a.level;
  return a.enqueuedAt - b.enqueuedAt;
}

export class SessionInputQueue {
  private readonly queues = new Map<number, SessionQueuedInput[]>();

  enqueue(sessionId: number, entry: SessionQueuedInput): void {
    const queue = this.queues.get(sessionId) ?? [];
    queue.push(entry);
    queue.sort(compareQueuedInputs);
    this.queues.set(sessionId, queue);
  }

  dequeue(sessionId: number): SessionQueuedInput | undefined {
    const queue = this.queues.get(sessionId);
    if (!queue || queue.length === 0) return undefined;
    const next = queue.shift()!;
    if (queue.length === 0) this.queues.delete(sessionId);
    else this.queues.set(sessionId, queue);
    return next;
  }

  peek(sessionId: number): SessionQueuedInput | undefined {
    return this.queues.get(sessionId)?.[0];
  }

  size(sessionId: number): number {
    return this.queues.get(sessionId)?.length ?? 0;
  }

  list(sessionId: number): SessionQueuedInput[] {
    return [...(this.queues.get(sessionId) ?? [])];
  }

  remove(sessionId: number, inputId: string): SessionQueuedInput | undefined {
    const queue = this.queues.get(sessionId);
    if (!queue?.length) return undefined;
    const index = queue.findIndex((item) => item.id === inputId);
    if (index < 0) return undefined;
    const [removed] = queue.splice(index, 1);
    if (queue.length === 0) this.queues.delete(sessionId);
    else this.queues.set(sessionId, queue);
    return removed;
  }

  clear(sessionId: number): SessionQueuedInput[] {
    const queue = this.queues.get(sessionId) ?? [];
    this.queues.delete(sessionId);
    return queue;
  }

  sessionIds(): number[] {
    return [...this.queues.keys()];
  }
}

export function shouldInterruptSessionInput(level: number): boolean {
  return level >= SESSION_INPUT_INTERRUPT_LEVEL;
}
