import type { ExtensionContext } from "pi-supervisor";

export type StrictSddStatus = "working" | "waiting_choice" | "waiting_confirmation" | "completed";

export interface StrictSddWorkflowState {
  stage: string;
  status: StrictSddStatus;
}

const META_KEY = "strictSdd";

function readStatus(meta: Record<string, unknown>): StrictSddStatus {
  const state = meta[META_KEY];
  if (!state || typeof state !== "object" || Array.isArray(state)) return "working";
  const status = (state as Record<string, unknown>).status;
  return status === "waiting_choice" || status === "waiting_confirmation" || status === "completed"
    ? status
    : "working";
}

export async function getWorkflow(ctx: ExtensionContext): Promise<StrictSddWorkflowState | null> {
  const workflow = await ctx.session.workflow.get();
  if (!workflow?.stage) return null;
  return { stage: workflow.stage, status: readStatus(await ctx.session.meta.get()) };
}

export async function setWorkflow(
  ctx: ExtensionContext,
  patch: { stage?: string; status?: StrictSddStatus },
): Promise<StrictSddWorkflowState> {
  const current = await getWorkflow(ctx);
  const stage = patch.stage ?? current?.stage;
  if (!stage) throw new Error("Strict SDD workflow requires a stage");
  if (patch.stage !== undefined) await ctx.session.workflow.set({ stage: patch.stage });
  const status = patch.status ?? current?.status ?? "working";
  await ctx.session.meta.patch({ [META_KEY]: { status } });
  return { stage, status };
}
