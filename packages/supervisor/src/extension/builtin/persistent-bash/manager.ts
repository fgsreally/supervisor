import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { JobRecord } from "../../../core/jobs.js";
import type { ExtensionJobFacade } from "../../types.js";

const MAX_SESSIONS = 10;
const MAX_OUTPUT_CHARS = 200_000;

export interface PersistentBashSession {
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
  jobs: ExtensionJobFacade;
  output: string;
  stopping: boolean;
  settled: boolean;
  updates: Promise<void>;
}

const sessions = new Map<string, ManagedSession>();

function publicSession(job: JobRecord, tailChars?: number): PersistentBashSession {
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

export async function listPersistentBashSessions(
  _sessionId: number,
  jobs: ExtensionJobFacade,
): Promise<PersistentBashSession[]> {
  return (await jobs.list({ kind: "shell" })).map((job) => publicSession(job, 12_000));
}

export async function getPersistentBashSession(
  sessionId: number,
  id: string,
  jobs: ExtensionJobFacade,
  tailChars = 12_000,
): Promise<PersistentBashSession | undefined> {
  const job = await jobs.get(id);
  return job?.sessionId === sessionId && job.kind === "shell"
    ? publicSession(job, tailChars)
    : undefined;
}

export async function startPersistentBashSession(options: {
  sessionId: number;
  cwd: string;
  jobs: ExtensionJobFacade;
  command?: string;
  label?: string;
}): Promise<PersistentBashSession> {
  const running = (await options.jobs.list({ kind: "shell" })).filter(
    (job) => job.status === "running",
  ).length;
  if (running >= MAX_SESSIONS) {
    throw new Error(`A Session can have at most ${MAX_SESSIONS} Bash sessions`);
  }

  const command = options.command?.trim() ?? "";
  const child = command
    ? spawn(command, { cwd: options.cwd, shell: true, stdio: "pipe" })
    : process.platform === "win32"
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/Q"], { cwd: options.cwd, stdio: "pipe" })
      : spawn(process.env.SHELL ?? "/bin/bash", [], { cwd: options.cwd, stdio: "pipe" });
  const job = await options.jobs.create({
    kind: "shell",
    name: "persistent-bash",
    label: options.label?.trim() || command || "Interactive shell",
    status: "running",
    executionMode: "background",
    capabilities: ["cancel", "input", "read_output"],
    metadata: { command, cwd: options.cwd, pid: child.pid },
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
    writePersistentBashSession(options.sessionId, job.id, input),
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

export function writePersistentBashSession(sessionId: number, id: string, input: string): void {
  const session = sessions.get(id);
  if (!session || session.sessionId !== sessionId) throw new Error(`Bash Job ${id} not found`);
  if (session.stopping || session.child.exitCode !== null) {
    throw new Error(`Bash Job ${id} is not running`);
  }
  session.child.stdin.write(input.endsWith("\n") ? input : `${input}\n`);
}

export async function stopPersistentBashSessions(
  sessionId: number,
  jobs: ExtensionJobFacade,
): Promise<void> {
  const ids = [...sessions.values()]
    .filter((session) => session.sessionId === sessionId)
    .map((session) => session.id);
  await Promise.all(ids.map((id) => jobs.cancel(id).catch(() => undefined)));
}
