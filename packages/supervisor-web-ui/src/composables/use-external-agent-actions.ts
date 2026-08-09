import type { Agent } from "@/api";
import { useAgentStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";

export function isExternalAgent(agent: Pick<Agent, "backendType">): boolean {
  return agent.backendType !== "native";
}

export async function refreshExternalAgents(): Promise<Agent[]> {
  const agentStore = useAgentStore();
  return agentStore.detectExternalAgents();
}

export async function installExternalAgent(agent: Agent): Promise<Agent | null> {
  if (!agent.installCommand?.trim()) {
    showUiMessage("未配置安装命令", "error");
    return null;
  }
  try {
    const updated = await useAgentStore().installExternalAgent(agent.id);
    if (updated.available === false) {
      showUiMessage("安装命令已执行，但仍未检测到可执行文件，请稍后重试检测", "info");
    } else {
      showUiMessage("安装完成", "success");
    }
    return updated;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "安装失败", "error");
    return null;
  }
}
