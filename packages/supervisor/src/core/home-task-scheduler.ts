import type { SupervisorDb } from "../db/db.js";
import type { HomeTask } from "../types.js";
import { listReadyHomeTaskChildren } from "./home-task-plan.js";

export interface HomeTaskSpawnFn {
  (options: {
    projectId: number;
    cwd: string;
    agentId: number;
    instructions: string;
    title: string;
    meta?: Record<string, unknown>;
  }): Promise<{ id: number }>;
}

export interface HomeTaskSchedulerHost {
  db: SupervisorDb;
  resolveDefaultSpawnAgentId(): number;
  spawn: HomeTaskSpawnFn;
}

/** Spawn all dependency-ready children that do not yet have a session. */
export async function scheduleReadyHomeTasks(
  host: HomeTaskSchedulerHost,
  parentId: number,
): Promise<HomeTask[]> {
  const parent = host.db.getHomeTask(parentId);
  if (!parent || parent.parentId != null) return [];
  if (parent.phase !== "executing") return [];

  const children = host.db.listHomeTaskChildren(parentId);
  const ready = listReadyHomeTaskChildren(children);
  if (ready.length === 0) return [];

  const started: HomeTask[] = [];

  await Promise.all(
    ready.map(async (child) => {
      const projectId = child.projectId ?? parent.projectId;
      if (projectId == null) {
        host.db.updateHomeTask(child.id, {
          status: "error",
          error: "缺少绑定项目",
        });
        return;
      }
      const project = host.db.getProject(projectId);
      if (!project) {
        host.db.updateHomeTask(child.id, {
          status: "error",
          error: `Project ${projectId} not found`,
        });
        return;
      }

      const agentId = child.agentId ?? host.resolveDefaultSpawnAgentId();
      if (!host.db.getAgent(agentId)) {
        host.db.updateHomeTask(child.id, {
          status: "error",
          error: `Agent ${agentId} not found`,
        });
        return;
      }

      try {
        const session = await host.spawn({
          projectId: project.id,
          cwd: project.cwd,
          agentId,
          instructions: child.description,
          title: child.title,
          meta: child.subagentIds.length > 0 ? { subagentIds: child.subagentIds } : undefined,
        });
        started.push(
          host.db.updateHomeTask(child.id, {
            sessionId: session.id,
            status: "in_progress",
            error: null,
          }),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        host.db.updateHomeTask(child.id, {
          status: "error",
          error: message,
        });
      }
    }),
  );

  const latestChildren = host.db.listHomeTaskChildren(parentId);
  if (latestChildren.length > 0 && latestChildren.every((child) => child.status === "error")) {
    host.db.updateHomeTask(parentId, {
      status: "error",
      phase: "error",
      error: "all ready subtasks failed to spawn",
    });
  }

  return started;
}
