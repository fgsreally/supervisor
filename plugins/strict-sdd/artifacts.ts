import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ExecutionState, WorkflowPlan } from "./types.js";

export class WorkflowArtifacts {
  readonly root: string;

  constructor(sessionDir: string) {
    this.root = join(sessionDir, "workflow");
  }

  async ensure(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  resolve(relativePath: string): string {
    const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
    const target = resolve(this.root, normalized);
    const rel = relative(this.root, target);
    if (!rel || rel === ".") return target;
    if (
      rel.startsWith(`..${sep}`) ||
      rel === ".." ||
      resolve(target) === resolve(this.root, "..")
    ) {
      throw new Error(`workflow artifact path escapes session directory: ${relativePath}`);
    }
    return target;
  }

  async write(relativePath: string, content: string): Promise<void> {
    const target = this.resolve(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf-8");
  }

  async read(relativePath: string): Promise<string | null> {
    return readFile(this.resolve(relativePath), "utf-8").catch(() => null);
  }

  async exists(relativePath: string): Promise<boolean> {
    return (await this.read(relativePath)) !== null;
  }

  async list(relativePath = ""): Promise<string[]> {
    const base = this.resolve(relativePath);
    const output: string[] = [];
    const walk = async (dir: string) => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else output.push(relative(this.root, path).replaceAll("\\", "/"));
      }
    };
    await walk(base);
    return output.sort();
  }

  async readPlan(): Promise<WorkflowPlan> {
    const text = await this.read("plan.json");
    if (!text) throw new Error("Missing workflow/plan.json");
    const value = JSON.parse(text) as WorkflowPlan;
    if (!Array.isArray(value.changes) || value.changes.length === 0) {
      throw new Error("plan.json must contain at least one change");
    }
    for (const change of value.changes) {
      if (!change.id || !change.title || !Array.isArray(change.specPaths)) {
        throw new Error("Every plan change requires id, title, and specPaths");
      }
      if (!change.test?.command || !Array.isArray(change.test.args)) {
        throw new Error(`Change ${change.id} requires a structured test command`);
      }
    }
    return value;
  }

  async readExecution(plan: WorkflowPlan): Promise<ExecutionState> {
    const text = await this.read("execution.json");
    if (text) return JSON.parse(text) as ExecutionState;
    const state: ExecutionState = {
      route: null,
      changes: plan.changes.map((change) => ({ id: change.id, status: "pending" })),
    };
    await this.writeExecution(state);
    return state;
  }

  async writeExecution(state: ExecutionState): Promise<void> {
    await this.write("execution.json", `${JSON.stringify(state, null, 2)}\n`);
  }
}
