import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { CreateJobInput, JobRecord, UpdateJobInput } from "../../core/jobs/jobs.js";

const MAX_SESSIONS = 10;
const MAX_OUTPUT_CHARS = 200_000;

/** Session-scoped job host (matches ExtensionJobFacade shape). */
export interface BashJobHost {
  create(input: CreateJobInput): Promise<JobRecord>;
  get(id: string): Promise<JobRecord | undefined>;
  list(options?: { limit?: number; kind?: string }): Promise<JobRecord[]>;
  update(id: string, patch: UpdateJobInput): Promise<JobRecord>;
  cancel(id: string): Promise<JobRecord>;
  input(id: string, input: string): Promise<void>;
  setCancelHandler(id: string, handler: () => void | Promise<void>): void;
  setInputHandler(id: string, handler: (input: string) => void | Promise<void>): void;
}

export interface BackgroundBashSession {
  id: string;
  sessionId: number;
  command: string;
  label: string;
  cwd: string;
  pid?: number;
  status: "running" | "exited" | "failed" | "cancelled" | "interrupted";
  startedAt: number;
  endedAt?: number;
  exitCode?: number | null;
  output: string;
}

interface ManagedSession {
  id: string;
  sessionId: number;
  child: ChildProcessWithoutNullStreams;
  jobs: BashJobHost;
  output: string;
  stopping: boolean;
  settled: boolean;
  updates: Promise<void>;
}

const sessions = new Map<string, ManagedSession>();

function publicSession(job: JobRecord, tailChars?: number): BackgroundBashSession {
  const metadata = job.metadata;
  const output = tailChars ? job.output.slice(-Math.max(1, Math.floor(tailChars))) : job.output;
  const status =
    job.status === "succeeded"
      ? "exited"
      : job.status === "cancelled" || job.status === "interrupted"
        ? job.status
        : job.status === "failed"
          ? "failed"
          : "running";
  return {
    id: job.id,
    sessionId: job.sessionId,
    command: typeof metadata.command === "string" ? metadata.command : "",
    label: job.label,
    cwd: typeof metadata.cwd === "string" ? metadata.cwd : "",
    ...(typeof metadata.pid === "number" ? { pid: metadata.pid } : {}),
    status,
    startedAt: job.startedAt ?? job.createdAt,
    ...(job.finishedAt === undefined ? {} : { endedAt: job.finishedAt }),
    ...(typeof metadata.exitCode === "number" || metadata.exitCode === null
      ? { exitCode: metadata.exitCode as number | null }
      : {}),
    output,
  };
}

async function stopChild(session: ManagedSession): Promise<void> {
  if (session.stopping || session.child.exitCode !== null) return;
  session.stopping = true;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    session.child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    session.child.kill();
  });
  sessions.delete(session.id);
}

export async function listBackgroundBashSessions(
  _sessionId: number,
  jobs: BashJobHost,
): Promise<BackgroundBashSession[]> {
  return (await jobs.list({ kind: "shell" })).map((job) => publicSession(job, 12_000));
}

export async function getBackgroundBashSession(
  sessionId: number,
  id: string,
  jobs: BashJobHost,
  tailChars = 12_000,
): Promise<BackgroundBashSession | undefined> {
  const managed = sessions.get(id);
  if (managed && managed.sessionId === sessionId) {
    const job = await jobs.get(id);
    if (!job || job.sessionId !== sessionId || job.kind !== "shell") return undefined;
    const pub = publicSession(job, tailChars);
    // Prefer live memory output (DB append is async and can lag).
    const live = managed.output;
    if (live.length >= (job.output?.length ?? 0)) {
      return {
        ...pub,
        output: tailChars ? live.slice(-Math.max(1, Math.floor(tailChars))) : live,
        pid: managed.child.pid ?? pub.pid,
        status: managed.child.exitCode === null && !managed.stopping ? "running" : pub.status,
      };
    }
    return pub;
  }
  const job = await jobs.get(id);
  return job?.sessionId === sessionId && job.kind === "shell"
    ? publicSession(job, tailChars)
    : undefined;
}

export async function startBackgroundBashSession(options: {
  sessionId: number;
  cwd: string;
  jobs: BashJobHost;
  command?: string;
  label?: string;
  env?: NodeJS.ProcessEnv;
  kind?: "shell" | "service";
}): Promise<BackgroundBashSession> {
  const running = (await options.jobs.list()).filter((job) => job.status === "running").length;
  if (running >= MAX_SESSIONS) {
    throw new Error(`A Session can have at most ${MAX_SESSIONS} background bash tasks`);
  }

  const command = options.command?.trim() ?? "";
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const child = command
    ? spawn(command, { cwd: options.cwd, env, shell: true, stdio: "pipe" })
    : process.platform === "win32"
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/Q"], { cwd: options.cwd, env, stdio: "pipe" })
      : spawn(process.env.SHELL ?? "/bin/bash", [], { cwd: options.cwd, env, stdio: "pipe" });
  const job = await options.jobs.create({
    kind: options.kind ?? "shell",
    name: "bash",
    label: options.label?.trim() || command || "Interactive shell",
    status: "running",
    executionMode: "background",
    capabilities: ["cancel", "input", "read_output"],
    metadata: { command, cwd: options.cwd, pid: child.pid, pidStartedAt: Date.now() },
  });
  const session: ManagedSession = {
    id: job.id,
    sessionId: options.sessionId,
    child,
    jobs: options.jobs,
    output: "",
    stopping: false,
    settled: false,
    updates: Promise.resolve(),
  };
  sessions.set(job.id, session);
  options.jobs.setCancelHandler(job.id, () => stopChild(session));
  options.jobs.setInputHandler(job.id, (input) =>
    writeBackgroundBashSession(options.sessionId, job.id, input),
  );

  const appendOutput = (chunk: unknown) => {
    session.output = `${session.output}${String(chunk)}`.slice(-MAX_OUTPUT_CHARS);
    const output = session.output;
    session.updates = session.updates
      .then(async () => {
        await options.jobs.update(job.id, { output });
      })
      .catch(() => {});
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  child.once("error", async (error) => {
    appendOutput(`\n${error.message}\n`);
    await session.updates;
    if (!session.stopping && !session.settled) {
      session.settled = true;
      void options.jobs.update(job.id, {
        status: "failed",
        output: session.output,
        error: { message: error.message },
      });
    }
    sessions.delete(job.id);
  });
  child.once("exit", async (code) => {
    await session.updates;
    if (!session.stopping && !session.settled) {
      session.settled = true;
      void options.jobs.update(job.id, {
        status: code === 0 ? "succeeded" : "failed",
        output: session.output,
        metadata: { exitCode: code },
        ...(code === 0 ? { result: { exitCode: code } } : { error: { exitCode: code } }),
      });
    }
    sessions.delete(job.id);
  });
  return publicSession((await options.jobs.get(job.id))!);
}

/** Block until ready pattern, output growth, process exit, or timeout (kimi TaskOutput-style). */
export async function waitBackgroundBashSession(options: {
  sessionId: number;
  id: string;
  jobs: BashJobHost;
  timeoutMs?: number;
  pattern?: string;
  /** Also succeed when output grows by at least this many chars from the baseline. */
  untilChangeChars?: number;
  pollMs?: number;
  tailChars?: number;
}): Promise<{
  matched: boolean;
  changed: boolean;
  timedOut: boolean;
  exited: boolean;
  item: BackgroundBashSession;
}> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 90_000, 500), 300_000);
  const pollMs = Math.min(Math.max(options.pollMs ?? 500, 100), 5_000);
  const untilChangeChars = Math.max(0, Math.floor(options.untilChangeChars ?? 24));
  let pattern: RegExp;
  try {
    pattern = options.pattern?.trim()
      ? new RegExp(options.pattern.trim(), "i")
      : /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+|Local:\s+https?:\/\/|ready in \d+/i;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid bash wait pattern: ${message}`);
  }
  const deadline = Date.now() + timeoutMs;

  let item = await getBackgroundBashSession(
    options.sessionId,
    options.id,
    options.jobs,
    options.tailChars ?? 12_000,
  );
  if (!item) throw new Error(`Background bash task ${options.id} not found`);
  const baselineLen = (item.output || "").length;

  while (true) {
    const output = item.output || "";
    if (pattern.test(output)) {
      return {
        matched: true,
        changed: output.length > baselineLen,
        timedOut: false,
        exited: item.status !== "running",
        item,
      };
    }
    if (untilChangeChars > 0 && output.length - baselineLen >= untilChangeChars) {
      return {
        matched: false,
        changed: true,
        timedOut: false,
        exited: item.status !== "running",
        item,
      };
    }
    if (item.status !== "running") {
      return { matched: false, changed: false, timedOut: false, exited: true, item };
    }
    if (Date.now() >= deadline) {
      return { matched: false, changed: false, timedOut: true, exited: false, item };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    item = (await getBackgroundBashSession(
      options.sessionId,
      options.id,
      options.jobs,
      options.tailChars ?? 12_000,
    ))!;
    if (!item) throw new Error(`Background bash task ${options.id} not found`);
  }
}

export function writeBackgroundBashSession(sessionId: number, id: string, input: string): void {
  const session = sessions.get(id);
  if (!session || session.sessionId !== sessionId) throw new Error(`Bash task ${id} not found`);
  if (session.stopping || session.child.exitCode !== null) {
    throw new Error(`Bash task ${id} is not running`);
  }
  session.child.stdin.write(input.endsWith("\n") ? input : `${input}\n`);
}

export async function stopBackgroundBashSessions(
  sessionId: number,
  jobs: BashJobHost,
): Promise<void> {
  const ids = [...sessions.values()]
    .filter((session) => session.sessionId === sessionId)
    .map((session) => session.id);
  await Promise.all(ids.map((id) => jobs.cancel(id).catch(() => undefined)));
}
