import { homedir, platform } from "node:os";
import { Type, type Static } from "typebox";
import type { Agent } from "../../types.js";
import { runWatson } from "../watson.js";
import {
  externalAgentAvailability,
  getExternalAgentConfig,
  getExternalAgentDetectArgs,
  getExternalAgentInstallCommand,
} from "./external-agent-config.js";

export const ExternalAgentRepairResultSchema = Type.Object({
  fixed: Type.Boolean({ description: "是否已修复到本机可检测" }),
  summary: Type.String({ description: "给用户看的简短说明" }),
  command: Type.Optional(Type.String({ description: "若需更新启动命令则给出完整命令路径或名称" })),
  args: Type.Optional(
    Type.Array(Type.String(), { description: "若需更新启动参数则给出完整参数列表" }),
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
    "你要修复本机外部 Agent 的可用性，使检测命令能成功。",
    "",
    `Agent 名称：${agent.name}`,
    `backendType：${agent.backendType}`,
    `当前启动命令：${config.command || "(空)"}`,
    `当前启动参数：${JSON.stringify(config.args)}`,
    `检测参数：${JSON.stringify(detectArgs)}`,
    `当前不可用原因：${availability.unavailableReason ?? "未知"}`,
    `推荐安装命令：${installCommand ?? "(无)"}`,
    `操作系统：${platform()}`,
    `工作目录：${homedir()}`,
    "",
    "可采取的行动：",
    "1. 在 PATH / 常见安装位置查找可执行文件；若命令名或路径不对，在结果中给出正确 command。",
    "2. 若未安装，可执行推荐安装命令（或等价官方安装方式）。",
    "3. 安装或改路径后，用检测参数验证（通常 --version）。",
    "4. 对 kimi/cursor/mimo，启动参数需保留 acp（可在结果 args 中带上）。",
    "5. 完成后必须调用 submit_result，summary 用中文简述做了什么；不要编造已修复。",
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
      "这是本机外部 CLI 修复任务。优先定位或安装可执行文件，再用检测命令验证。必须通过 submit_result 提交结果。",
  });
  if (run.result == null) {
    throw new Error("华生未返回修复结果");
  }
  return {
    ...run.result,
    args: run.result.args ? ensureAcpArgs(agent.backendType, run.result.args) : undefined,
  };
}
