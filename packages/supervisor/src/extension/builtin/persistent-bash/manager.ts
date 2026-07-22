import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const MAX_SESSIONS = 10;
const MAX_OUTPUT_CHARS = 200_000;

export interface PersistentBashSession {
  id: string;
  sessionId: number;
  command: string;
  label: string;
  cwd: string;
  pid?: number;
  status: "running" | "exited" | "failed";
  startedAt: number;
  endedAt?: number;
  exitCode?: number | null;
  output: string;
}

interface ManagedSession extends PersistentBashSession {
  child: ChildProcessWithoutNullStreams;
}

const sessions = new Map<number, Map<string, ManagedSession>>();

function publicSession(session: ManagedSession, tailChars?: number): PersistentBashSession {
  const output =
    tailChars && tailChars > 0 ? session.output.slice(-Math.floor(tailChars)) : session.output;
  return { ...session, child: undefined, output } as PersistentBashSession;
}

function appendOutput(session: ManagedSession, chunk: unknown): void {
  session.output = `${session.output}${String(chunk)}`.slice(-MAX_OUTPUT_CHARS);
}

export function listPersistentBashSessions(sessionId: number): PersistentBashSession[] {
  return [...(sessions.get(sessionId)?.values() ?? [])]
    .toSorted((left, right) => right.startedAt - left.startedAt)
    .map((session) => publicSession(session, 12_000));
}

export function getPersistentBashSession(
  sessionId: number,
  id: string,
  tailChars = 12_000,
): PersistentBashSession | undefined {
  const session = sessions.get(sessionId)?.get(id);
  return session ? publicSession(session, tailChars) : undefined;
}

export function startPersistentBashSession(options: {
  sessionId: number;
  cwd: string;
  command?: string;
  label?: string;
}): PersistentBashSession {
  const bucket = sessions.get(options.sessionId) ?? new Map<string, ManagedSession>();
  const running = [...bucket.values()].filter((session) => session.status === "running").length;
  if (running >= MAX_SESSIONS)
    throw new Error(`A Session can have at most ${MAX_SESSIONS} Bash sessions`);

  const command = options.command?.trim() ?? "";
  const child = command
    ? spawn(command, { cwd: options.cwd, shell: true, stdio: "pipe" })
    : process.platform === "win32"
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/Q"], { cwd: options.cwd, stdio: "pipe" })
      : spawn(process.env.SHELL ?? "/bin/bash", [], { cwd: options.cwd, stdio: "pipe" });
  const id = randomUUID().replaceAll("-", "").slice(0, 8);
  const session: ManagedSession = {
    id,
    sessionId: options.sessionId,
    command,
    label: options.label?.trim() || command || "Interactive shell",
    cwd: options.cwd,
    pid: child.pid,
    status: "running",
    startedAt: Date.now(),
    output: "",
    child,
  };
  child.stdout.on("data", (chunk) => appendOutput(session, chunk));
  child.stderr.on("data", (chunk) => appendOutput(session, chunk));
  child.once("error", (error) => {
    appendOutput(session, `\n${error.message}\n`);
    session.status = "failed";
    session.endedAt = Date.now();
  });
  child.once("exit", (code) => {
    session.status = code === 0 ? "exited" : "failed";
    session.exitCode = code;
    session.endedAt = Date.now();
  });
  bucket.set(id, session);
  sessions.set(options.sessionId, bucket);
  return publicSession(session);
}

export function writePersistentBashSession(sessionId: number, id: string, input: string): void {
  const session = sessions.get(sessionId)?.get(id);
  if (!session) throw new Error(`Bash session ${id} not found`);
  if (session.status !== "running") throw new Error(`Bash session ${id} is not running`);
  session.child.stdin.write(input.endsWith("\n") ? input : `${input}\n`);
}

export async function stopPersistentBashSession(sessionId: number, id: string): Promise<void> {
  const session = sessions.get(sessionId)?.get(id);
  if (!session) throw new Error(`Bash session ${id} not found`);
  if (session.status !== "running") return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    session.child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    session.child.kill();
  });
}

export async function removePersistentBashSession(sessionId: number, id: string): Promise<void> {
  await stopPersistentBashSession(sessionId, id);
  const bucket = sessions.get(sessionId);
  bucket?.delete(id);
  if (bucket?.size === 0) sessions.delete(sessionId);
}

export async function stopPersistentBashSessions(sessionId: number): Promise<void> {
  const ids = [...(sessions.get(sessionId)?.keys() ?? [])];
  await Promise.all(ids.map((id) => stopPersistentBashSession(sessionId, id).catch(() => {})));
  sessions.delete(sessionId);
}
