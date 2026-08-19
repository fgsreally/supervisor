import { homedir, platform } from "node:os";
import { Type, type Static } from "typebox";
import type { Agent } from "../../../types.js";
import { runWatson } from "../../agent/watson.js";
import {
  externalAgentAvailability,
  getExternalAgentConfig,
  getExternalAgentDetectArgs,
  getExternalAgentInstallCommand,
} from "./external-agent-config.js";

export const ExternalAgentRepairResultSchema = Type.Object({
  fixed: Type.Boolean({ description: "Whether the Agent is fixed and detectable locally" }),
  summary: Type.String({ description: "A short explanation for the user" }),
  command: Type.Optional(
    Type.String({
      description:
        "A complete executable path or command name if the launch command must be updated",
    }),
  ),
  args: Type.Optional(
    Type.Array(Type.String(), {
      description: "A complete argument list if launch arguments must be updated",
    }),
  ),
});

export type ExternalAgentRepairResult = Static<typeof ExternalAgentRepairResultSchema>;

const ACP_BACKENDS = new Set<Agent["backendType"]>(["kimi", "cursor", "mimo"]);

function ensureAcpArgs(backendType: Agent["backendType"], args: string[]): string[] {
  const visible = args.filter((arg) => arg !== "acp");
  return ACP_BACKENDS.has(backendType) ? [...visible, "acp"] : visible;
}

export function buildExternalAgentRepairPrompt(agent: Agent): string {
  const config = getExternalAgentConfig(agent);
  const availability = externalAgentAvailability(agent);
  const installCommand = getExternalAgentInstallCommand(agent);
  const detectArgs = getExternalAgentDetectArgs(agent);
  return [
    "Repair the local external Agent so its detection command succeeds.",
    "",
    `Agent name: ${agent.name}`,
    `Backend type: ${agent.backendType}`,
    `Current launch command: ${config.command || "(empty)"}`,
    `Current launch arguments: ${JSON.stringify(config.args)}`,
    `Detection arguments: ${JSON.stringify(detectArgs)}`,
    `Current unavailable reason: ${availability.unavailableReason ?? "unknown"}`,
    `Recommended install command: ${installCommand ?? "(none)"}`,
    `Operating system: ${platform()}`,
    `Working directory: ${homedir()}`,
    "",
    "Possible actions:",
    "1. Search PATH and common installation locations; if the command name or path is wrong, return the correct command.",
    "2. If it is not installed, run the recommended install command or an equivalent official installation method.",
    "3. After installing or changing the path, verify it with the detection arguments, usually --version.",
    "4. For kimi/cursor/mimo, preserve the acp launch argument in the returned args.",
    "5. Call submit_result when finished. Write the summary in Chinese for the user and do not claim a fix you did not verify.",
  ].join("\n");
}

export async function runExternalAgentRepair(agent: Agent): Promise<ExternalAgentRepairResult> {
  const run = await runWatson({
    mode: "agent",
    cwd: homedir(),
    kind: "external-agent-repair",
    toolsPreset: "coding",
    resultSchema: ExternalAgentRepairResultSchema,
    prompt: buildExternalAgentRepairPrompt(agent),
    injectSystem:
      "This is a local external CLI repair task. Locate or install the executable, verify it with the detection command, and submit the result through submit_result.",
  });
  if (run.result == null) {
    throw new Error("华生未返回修复结果");
  }
  return {
    ...run.result,
    args: run.result.args ? ensureAcpArgs(agent.backendType, run.result.args) : undefined,
  };
}
