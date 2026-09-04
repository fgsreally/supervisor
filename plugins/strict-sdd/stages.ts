import { readFileSync } from "node:fs";
import type { StageDefinition, StageId } from "./types.js";

function prompt(name: string): string {
  return readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), "utf-8");
}

const DISCOVERY_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "web_search",
  "web_fetch",
  "ask",
  "workflow_status",
  "workflow_write_artifact",
  "workflow_complete_stage",
];

export const STAGES: Record<StageId, StageDefinition> = {
  brainstorm: {
    id: "brainstorm",
    prompt: prompt("brainstorm"),
    allow: DISCOVERY_TOOLS,
    deny: ["edit", "bash", "spawn_agent"],
    requiredArtifacts: ["proposal.md"],
    next: ["design"],
  },
  design: {
    id: "design",
    prompt: prompt("design"),
    allow: [...DISCOVERY_TOOLS, "spawn_agent"],
    deny: ["edit", "bash"],
    requiredArtifacts: ["design.md"],
    next: ["spec"],
  },
  spec: {
    id: "spec",
    prompt: prompt("spec"),
    allow: [...DISCOVERY_TOOLS, "spawn_agent"],
    deny: ["edit", "bash"],
    requiredArtifacts: ["specs"],
    next: ["mockup"],
  },
  mockup: {
    id: "mockup",
    prompt: prompt("mockup"),
    allow: [...DISCOVERY_TOOLS, "spawn_agent"],
    deny: ["edit", "bash"],
    requiredArtifacts: ["specs"],
    next: ["planning"],
  },
  planning: {
    id: "planning",
    prompt: prompt("planning"),
    allow: [...DISCOVERY_TOOLS, "spawn_agent"],
    deny: ["edit", "bash"],
    requiredArtifacts: ["plan.json"],
    next: ["test", "vertical"],
    choice: true,
  },
  test: {
    id: "test",
    prompt: prompt("test"),
    allow: ["workflow_status"],
    deny: [],
    requiredArtifacts: ["execution.json"],
    next: ["implement"],
  },
  vertical: {
    id: "vertical",
    prompt: prompt("test"),
    allow: ["workflow_status"],
    deny: [],
    requiredArtifacts: ["execution.json"],
    next: ["implement"],
  },
  implement: {
    id: "implement",
    prompt: prompt("implement"),
    allow: ["workflow_status"],
    deny: [],
    requiredArtifacts: ["execution.json"],
    next: ["archive"],
  },
  archive: {
    id: "archive",
    prompt: prompt("archive"),
    allow: ["workflow_status"],
    deny: [],
    requiredArtifacts: ["execution.json"],
    next: ["implement", "vertical"],
  },
};
