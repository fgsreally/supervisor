import { relative, resolve } from "node:path";
import type { ExtensionContext } from "pi-supervisor";
import { WorkflowArtifacts } from "./artifacts.js";
import type {
  ChangeProgress,
  ExecutionState,
  PlannedChange,
  StageId,
  WorkflowPlan,
} from "./types.js";

const MAX_RESULT_CHARS = 12_000;

function clip(value: string, max = 8_000): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n...[truncated]`;
}

function safeCommandCwd(projectCwd: string, requested?: string): string {
  if (!requested) return projectCwd;
  const target = resolve(projectCwd, requested);
  const rel = relative(projectCwd, target);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) {
    throw new Error(`Test command cwd escapes project: ${requested}`);
  }
  return target;
}

function parseJsonResult<T extends object>(text: string): T | null {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

async function pickAgent(ctx: ExtensionContext, tag: string): Promise<number> {
  return (await ctx.agent.findByTag(tag))[0]?.id ?? ctx.agent.id;
}

async function spawnWorker(
  ctx: ExtensionContext,
  role: "test" | "implement" | "verify" | "archive",
  instructions: string,
): Promise<number> {
  const result = await ctx.session.spawn({
    parentId: ctx.session.id,
    agentId: await pickAgent(ctx, role),
    cwd: ctx.project.cwd,
    instructions,
    systemPrompt: `You are a focused ${role} worker. Complete only the assigned task. Do not start or advance any workflow, do not spawn subagents, and keep the final response concise.`,
    meta: { strictSddWorker: { role } },
  });
  return result.sessionId;
}

async function waitForWorker(ctx: ExtensionContext, sessionId: number): Promise<string> {
  const result = await ctx.session.waitForResult(sessionId, { maxChars: MAX_RESULT_CHARS });
  if (result.status === "error") throw new Error(`Worker session ${sessionId} failed`);
  return result.result;
}

function progressFor(state: ExecutionState, change: PlannedChange): ChangeProgress {
  const progress = state.changes.find((item) => item.id === change.id);
  if (!progress) throw new Error(`Missing execution state for ${change.id}`);
  return progress;
}

function nextUnarchived(plan: WorkflowPlan, state: ExecutionState): PlannedChange | undefined {
  return plan.changes.find((change) => progressFor(state, change).status !== "archived");
}

async function writeTests(
  ctx: ExtensionContext,
  artifacts: WorkflowArtifacts,
  change: PlannedChange,
  progress: ChangeProgress,
  state: ExecutionState,
): Promise<void> {
  if (progress.status !== "pending") return;
  if (!progress.testSessionId) {
    progress.testSessionId = await spawnWorker(
      ctx,
      "test",
      [
        `Write the tests for ${change.id}: ${change.title}.`,
        `Project cwd: ${ctx.project.cwd}`,
        `Workflow artifacts: ${artifacts.root}`,
        `Read only these specifications as the source of truth: ${change.specPaths.join(", ")}.`,
        `Tasks: ${change.tasks.join("; ")}.`,
        "Write meaningful unit and scenario tests before implementation. For web UI behavior include Playwright E2E tests. Prefix the change test suite with the change id. Do not modify business implementation.",
        `The planned test command is: ${change.test.command} ${change.test.args.join(" ")}`,
      ].join("\n"),
    );
    await artifacts.writeExecution(state);
  }
  const summary = await waitForWorker(ctx, progress.testSessionId);
  if (!summary.trim()) throw new Error(`Test worker for ${change.id} returned no result`);
  progress.status = "tests_written";
  await artifacts.write(`results/${change.id}-test.md`, summary);
  await artifacts.writeExecution(state);
  await ctx.session.finish(progress.testSessionId);
}

async function runTestCommand(ctx: ExtensionContext, change: PlannedChange) {
  return ctx.exec(change.test.command, change.test.args, {
    cwd: safeCommandCwd(ctx.project.cwd, change.test.cwd),
    timeout: 10 * 60_000,
  });
}

async function verifyChange(
  ctx: ExtensionContext,
  artifacts: WorkflowArtifacts,
  change: PlannedChange,
  progress: ChangeProgress,
  testOutput: string,
): Promise<{ passed: boolean; summary: string }> {
  const sessionId = await spawnWorker(
    ctx,
    "verify",
    [
      `Verify ${change.id}: ${change.title}.`,
      `Project cwd: ${ctx.project.cwd}`,
      `Workflow artifacts: ${artifacts.root}`,
      `Specifications: ${change.specPaths.join(", ")}`,
      `Expected files: ${change.files.join(", ")}`,
      "Check every Requirement and Scenario, code structure, duplication, naming, and design consistency. Do not modify files.",
      `Test output:\n${clip(testOutput)}`,
      'Return exactly JSON: {"passed": boolean, "summary": string}.',
    ].join("\n"),
  );
  progress.verifySessionIds = [...(progress.verifySessionIds ?? []), sessionId];
  const summary = await waitForWorker(ctx, sessionId);
  await ctx.session.finish(sessionId);
  const parsed = parseJsonResult<{ passed: boolean; summary: string }>(summary);
  return parsed && typeof parsed.passed === "boolean"
    ? { passed: parsed.passed, summary: parsed.summary ?? summary }
    : { passed: false, summary: `Verifier returned invalid result: ${clip(summary, 2_000)}` };
}

async function implementChange(
  ctx: ExtensionContext,
  artifacts: WorkflowArtifacts,
  change: PlannedChange,
  progress: ChangeProgress,
  state: ExecutionState,
): Promise<void> {
  if (progress.status === "ready_to_archive" || progress.status === "archived") return;
  if (progress.status !== "tests_written" && progress.status !== "implementing") {
    throw new Error(`Change ${change.id} has no confirmed tests`);
  }

  if (!progress.implementSessionId) {
    progress.implementSessionId = await spawnWorker(
      ctx,
      "implement",
      [
        `Implement ${change.id}: ${change.title}.`,
        `Project cwd: ${ctx.project.cwd}`,
        `Workflow artifacts: ${artifacts.root}`,
        `Specifications: ${change.specPaths.join(", ")}`,
        `Tasks: ${change.tasks.join("; ")}`,
        `Expected files: ${change.files.join(", ")}`,
        "Implement only this change. Do not weaken or rewrite tests. Do not add backward-compatibility code unless the specification explicitly requires it.",
      ].join("\n"),
    );
    progress.status = "implementing";
    progress.iterations = 0;
    await artifacts.writeExecution(state);
  }

  const maxIterations = change.maxIterations ?? 10;
  await waitForWorker(ctx, progress.implementSessionId);
  while ((progress.iterations ?? 0) < maxIterations) {
    progress.iterations = (progress.iterations ?? 0) + 1;
    await artifacts.writeExecution(state);
    const test = await runTestCommand(ctx, change);
    const output = `${test.stdout}\n${test.stderr}`.trim();
    await artifacts.write(`results/${change.id}-test-run-${progress.iterations}.log`, output);

    if (test.code === 0) {
      const verification = await verifyChange(ctx, artifacts, change, progress, output);
      await artifacts.write(
        `results/${change.id}-verify-${progress.iterations}.md`,
        verification.summary,
      );
      if (verification.passed) {
        progress.status = "ready_to_archive";
        progress.lastFailure = undefined;
        await artifacts.writeExecution(state);
        await ctx.session.finish(progress.implementSessionId);
        return;
      }
      progress.lastFailure = verification.summary;
      await ctx.session.sendToChild(
        progress.implementSessionId,
        `Verification failed. Fix the implementation without changing the accepted specification or weakening tests:\n${clip(verification.summary)}`,
      );
    } else {
      progress.lastFailure = output;
      await ctx.session.sendToChild(
        progress.implementSessionId,
        `Tests failed on iteration ${progress.iterations}. Fix the implementation; do not change or weaken tests:\n${clip(output)}`,
      );
    }
    await artifacts.writeExecution(state);
    await waitForWorker(ctx, progress.implementSessionId);
  }

  progress.status = "blocked";
  await artifacts.writeExecution(state);
  throw new Error(`Change ${change.id} reached the ${maxIterations} iteration limit`);
}

async function archiveChange(
  ctx: ExtensionContext,
  artifacts: WorkflowArtifacts,
  change: PlannedChange,
  progress: ChangeProgress,
  state: ExecutionState,
): Promise<void> {
  if (progress.status !== "ready_to_archive") {
    throw new Error(`Change ${change.id} is not ready to archive`);
  }
  const sessionId = await spawnWorker(
    ctx,
    "archive",
    [
      `Archive ${change.id}: ${change.title}.`,
      `Project cwd: ${ctx.project.cwd}`,
      `Workflow artifacts: ${artifacts.root}`,
      `Delta specifications: ${change.specPaths.join(", ")}`,
      "Merge delta specifications into the project openspec directory in RENAMED, REMOVED, MODIFIED, ADDED order. Merge confirmed project/design changes, then move the change material to openspec/archive/YYYY-MM-DD-[name]. Do not alter business implementation.",
      'Return exactly JSON: {"archived": true, "summary": string}.',
    ].join("\n"),
  );
  const summary = await waitForWorker(ctx, sessionId);
  await ctx.session.finish(sessionId);
  const parsed = parseJsonResult<{ archived: boolean; summary: string }>(summary);
  if (!parsed?.archived) throw new Error(`Archive worker failed: ${clip(summary, 2_000)}`);
  progress.status = "archived";
  await artifacts.write(`results/${change.id}-archive.md`, parsed.summary ?? summary);
  await artifacts.writeExecution(state);
}

export class WorkflowOrchestrator {
  private running = false;

  constructor(
    private readonly ctx: ExtensionContext,
    private readonly artifacts: WorkflowArtifacts,
  ) {}

  async run(stage: StageId): Promise<void> {
    if (this.running) return;
    if (!["test", "vertical", "implement", "archive"].includes(stage)) return;
    this.running = true;
    try {
      const workflow = await this.ctx.session.workflow.get();
      if (!workflow || workflow.stage !== stage || workflow.status !== "working") return;
      const plan = await this.artifacts.readPlan();
      const state = await this.artifacts.readExecution(plan);
      if (stage === "test") await this.runTestsFirst(plan, state);
      else if (stage === "vertical") await this.runVertical(plan, state);
      else if (stage === "implement") await this.runImplement(plan, state);
      else await this.runArchive(plan, state);
    } catch (error) {
      this.ctx.log("error", "strict-sdd automation blocked", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.ctx.session.workflow.set({ status: "waiting_confirmation" });
    } finally {
      this.running = false;
    }
  }

  private async runTestsFirst(plan: WorkflowPlan, state: ExecutionState): Promise<void> {
    state.route = "tests-first";
    await this.artifacts.writeExecution(state);
    for (const change of plan.changes) {
      await writeTests(this.ctx, this.artifacts, change, progressFor(state, change), state);
    }
    await this.ctx.session.workflow.set({ status: "waiting_confirmation" });
  }

  private async runVertical(plan: WorkflowPlan, state: ExecutionState): Promise<void> {
    state.route = "vertical";
    const change = nextUnarchived(plan, state);
    if (!change) {
      await this.ctx.session.workflow.set({ status: "completed" });
      return;
    }
    await writeTests(this.ctx, this.artifacts, change, progressFor(state, change), state);
    await this.ctx.session.workflow.set({ status: "waiting_confirmation" });
  }

  private async runImplement(plan: WorkflowPlan, state: ExecutionState): Promise<void> {
    const change = nextUnarchived(plan, state);
    if (!change) {
      await this.ctx.session.workflow.set({ stage: "archive", status: "completed" });
      return;
    }
    const progress = progressFor(state, change);
    await implementChange(this.ctx, this.artifacts, change, progress, state);
    await this.ctx.session.workflow.set({ status: "waiting_confirmation" });
  }

  private async runArchive(plan: WorkflowPlan, state: ExecutionState): Promise<void> {
    const change = nextUnarchived(plan, state);
    if (!change) {
      await this.ctx.session.workflow.set({ status: "completed" });
      return;
    }
    await archiveChange(this.ctx, this.artifacts, change, progressFor(state, change), state);
    const remaining = nextUnarchived(plan, state);
    if (!remaining) {
      await this.ctx.session.workflow.set({ status: "completed" });
      return;
    }
    await this.ctx.session.workflow.set({
      stage: state.route === "vertical" ? "vertical" : "implement",
      status: "working",
    });
  }
}
