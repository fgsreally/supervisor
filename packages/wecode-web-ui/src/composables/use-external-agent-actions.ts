import type { Agent } from "@/api";
import { useAgentStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { translate } from "@/i18n";

export function isExternalAgent(agent: Pick<Agent, "backendType">): boolean {
  return agent.backendType !== "native";
}

export async function refreshExternalAgents(): Promise<Agent[]> {
  const agentStore = useAgentStore();
  return agentStore.detectExternalAgents();
}

export async function installExternalAgent(agent: Agent): Promise<Agent | null> {
  if (!agent.installCommand?.trim()) {
    showUiMessage(translate("externalAgent.installCommandMissing"), "error");
    return null;
  }
  try {
    const updated = await useAgentStore().installExternalAgent(agent.id);
    if (updated.available === false) {
      showUiMessage(translate("externalAgent.installNotDetected"), "info");
    } else {
      showUiMessage(translate("externalAgent.installDone"), "success");
    }
    return updated;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : translate("externalAgent.installFailed"), "error");
    return null;
  }
}
