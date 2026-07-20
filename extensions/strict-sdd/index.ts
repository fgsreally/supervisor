import { stat } from "node:fs/promises";
import {
  Type,
  defineExtension,
  type ExtensionEvent,
  type SessionWorkflowState,
} from "@earendil-works/pi-supervisor";
import { WorkflowArtifacts } from "./artifacts.js";
import { WorkflowOrchestrator } from "./orchestrator.js";
import { STAGES } from "./stages.js";
import type { StageDefinition, StageId } from "./types.js";

function isStage(value: string): value is StageId {
  return Object.hasOwn(STAGES, value);
}

function stageSummary(stage: StageDefinition, workflow: SessionWorkflowState) {
  return {
    stage: stage.id,
    status: workflow.status,
    next: stage.next,
    choices: stage.choice ? stage.next : undefined,
    requiredArtifacts: stage.requiredArtifacts,
  };
}

async function validateStage(stage: StageDefinition, artifacts: WorkflowArtifacts): Promise<void> {
  if (stage.id === "spec") {
    const specs = (await artifacts.list("specs")).filter((path) => path.endsWith("/spec.md"));
    if (specs.length === 0) throw new Error("Spec stage requires specs/<capability>/spec.md");
    return;
  }
  if (stage.id === "mockup") {
    const files = await artifacts.list("specs");
    const specs = files.filter((path) => path.endsWith("/spec.md"));
    const mockups = new Set(files.filter((path) => path.endsWith("/mockup.html")));
    const missing = specs
      .map((path) => path.replace(/spec\.md$/, "mockup.html"))
      .filter((path) => !mockups.has(path));
    if (specs.length === 0 || missing.length > 0) {
      throw new Error(`Every capability requires mockup.html. Missing: ${missing.join(", ")}`);
    }
    return;
  }
  if (stage.id === "planning") {
    await artifacts.readPlan();
    return;
  }
  for (const path of stage.requiredArtifacts) {
    const target = artifacts.resolve(path);
    const exists = await stat(target).then(
      () => true,
      () => false,
    );
    if (!exists) throw new Error(`Missing required workflow artifact: ${path}`);
  }
}

export default defineExtension({
  name: "strict-sdd",
  async setup(ctx) {
    // Worker sessions are deliberately single-purpose and never run a workflow.
    if (ctx.session.isChild) return;

    const artifacts = new WorkflowArtifacts(ctx.session.dir);
    await artifacts.ensure();
    const orchestrator = new WorkflowOrchestrator(ctx, artifacts);
    const commonPrompt = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("./prompts/common.md", import.meta.url), "utf-8"),
    );
    let repairingTransition = false;
    let previousStage: StageId | null = null;

    const applyStage = async (workflow: SessionWorkflowState) => {
      if (!isStage(workflow.stage)) {
        throw new Error(`Unknown strict-sdd stage: ${workflow.stage}`);
      }
      const stage = STAGES[workflow.stage];
      ctx.inject.reattach("strict-sdd-stage", `${commonPrompt}\n\n${stage.prompt}`, {
        priority: 100,
        dedupeAfterTurns: 0,
      });

      const allTools = ctx.agent.listTools().map((tool) => tool.name);
      const allowed = stage.allow.includes("*") ? allTools : stage.allow;
      const active = allowed.filter(
        (name) => !stage.deny.includes("*") && !stage.deny.includes(name),
      );
      await ctx.session.tools.setActive([...new Set(active)]);
      previousStage = stage.id;
    };

    ctx.agent.registerTool({
      name: "workflow_status",
      description:
        "Read the current Strict SDD stage, status, required artifacts, and next routes.",
      parameters: Type.Object({}),
      async execute() {
        const workflow = await ctx.session.workflow.get();
        if (!workflow || !isStage(workflow.stage)) {
          return { content: [{ type: "text", text: "No active Strict SDD workflow." }] };
        }
        const details = {
          ...stageSummary(STAGES[workflow.stage], workflow),
          artifacts: await artifacts.list(),
        };
        return { content: [{ type: "text", text: JSON.stringify(details) }], details };
      },
    });

    ctx.agent.registerTool({
      name: "workflow_write_artifact",
      description: "Write a Strict SDD stage artifact into this Session's workflow directory.",
      parameters: Type.Object({
        path: Type.String({ minLength: 1 }),
        content: Type.String(),
      }),
      async execute(params: { path: string; content: string }) {
        await artifacts.write(params.path, params.content);
        return {
          content: [{ type: "text", text: `Saved workflow artifact: ${params.path}` }],
          details: { path: params.path },
        };
      },
    });

    ctx.agent.registerTool({
      name: "workflow_complete_stage",
      description:
        "Validate and submit the current Strict SDD stage for the fixed user confirmation or route choice.",
      parameters: Type.Object({}),
      async execute() {
        const workflow = await ctx.session.workflow.get();
        if (!workflow || !isStage(workflow.stage)) throw new Error("No active workflow stage");
        const stage = STAGES[workflow.stage];
        if (["test", "vertical", "implement", "archive"].includes(stage.id)) {
          throw new Error(`${stage.id} is controlled by the workflow program`);
        }
        await validateStage(stage, artifacts);
        const nextStatus = stage.choice ? "waiting_choice" : "waiting_confirmation";
        const next = await ctx.session.workflow.set({ status: nextStatus });
        const details = stageSummary(stage, next);
        return {
          content: [
            {
              type: "text",
              text: stage.choice
                ? `Stage ${stage.id} is waiting for a route choice: ${stage.next.join(" or ")}`
                : `Stage ${stage.id} is waiting for confirmation.`,
            },
          ],
          details,
        };
      },
    });

    const offStage = ctx.on<Extract<ExtensionEvent, { type: "workflow.stage_changed" }>>(
      "workflow.stage_changed",
      async (event) => {
        if (repairingTransition || event.to === null) return;
        if (!isStage(event.to) || !event.workflow) {
          if (previousStage) {
            repairingTransition = true;
            try {
              await ctx.session.workflow.set({
                stage: previousStage,
                status: "waiting_confirmation",
              });
            } finally {
              repairingTransition = false;
            }
          }
          return;
        }
        if (event.from && isStage(event.from) && !STAGES[event.from].next.includes(event.to)) {
          repairingTransition = true;
          try {
            await ctx.session.workflow.set({
              stage: event.from,
              status: STAGES[event.from].choice ? "waiting_choice" : "waiting_confirmation",
            });
          } finally {
            repairingTransition = false;
          }
          return;
        }
        await applyStage(event.workflow);
        await orchestrator.run(event.to);
      },
    );

    const offStatus = ctx.on<Extract<ExtensionEvent, { type: "workflow.status_changed" }>>(
      "workflow.status_changed",
      async (event) => {
        if (event.to === "working" && isStage(event.stage)) {
          await orchestrator.run(event.stage);
        }
      },
    );

    let workflow = await ctx.session.workflow.get();
    if (!workflow) {
      workflow = await ctx.session.workflow.set({ stage: "brainstorm", status: "working" });
    } else {
      await applyStage(workflow);
      if (workflow.status === "working" && isStage(workflow.stage)) {
        void orchestrator.run(workflow.stage);
      }
    }

    ctx.log("info", "strict-sdd workflow active", { ...workflow });
    return () => {
      offStage();
      offStatus();
      ctx.inject.clear("strict-sdd-stage");
    };
  },
});
