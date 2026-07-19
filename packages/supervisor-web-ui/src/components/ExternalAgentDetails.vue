<template>
  <div class="external-agent-details max-w-3xl">
    <section class="external-agent-section border rounded-md overflow-hidden">
      <div class="external-agent-section__title px-4 py-3 border-b text-[14px] font-medium">
        运行配置
      </div>
      <dl class="divide-y external-agent-divider">
        <div class="external-agent-row px-4 py-3 grid grid-cols-[9rem_minmax(0,1fr)] gap-4">
          <dt>运行后端</dt>
          <dd class="font-medium">{{ backendLabel }}</dd>
        </div>
        <div class="external-agent-row px-4 py-3 grid grid-cols-[9rem_minmax(0,1fr)] gap-4">
          <dt>启动命令</dt>
          <dd class="font-mono text-[12px] break-all">{{ command }}</dd>
        </div>
        <div class="external-agent-row px-4 py-3 grid grid-cols-[9rem_minmax(0,1fr)] gap-4">
          <dt>会话恢复</dt>
          <dd>{{ resumeLabel }}</dd>
        </div>
        <div class="external-agent-row px-4 py-3 grid grid-cols-[9rem_minmax(0,1fr)] gap-4">
          <dt>资源管理</dt>
          <dd>由 {{ backendLabel }} 管理</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Agent } from "@/api";

const props = defineProps<{ agent: Agent }>();

const backendLabel = computed(() => {
  if (props.agent.backendType === "codex") return "Codex";
  if (props.agent.backendType === "claude") return "Claude Code";
  if (props.agent.backendType === "kimi") return "Kimi Code";
  return "ACP";
});

const command = computed(() => {
  const legacy = props.agent.meta.external as { command?: string; args?: string[] } | undefined;
  const command =
    typeof props.agent.meta.command === "string" ? props.agent.meta.command : legacy?.command;
  const args = Array.isArray(props.agent.meta.args) ? props.agent.meta.args : legacy?.args;
  return [command, ...(args ?? [])].filter(Boolean).join(" ") || "-";
});

const resumeLabel = computed(() => {
  if (props.agent.backendType === "codex") return "Codex thread";
  if (props.agent.backendType === "claude") return "Claude session";
  if (props.agent.backendType === "kimi") return "ACP session";
  return "ACP session";
});
</script>

<style scoped>
.external-agent-section {
  background: var(--app-settings-card);
  border-color: var(--app-border-subtle);
}

.external-agent-section__title,
.external-agent-divider > * {
  border-color: var(--app-border-subtle);
}

.external-agent-row {
  font-size: 13px;
  color: var(--app-text-primary);
}

.external-agent-row dt {
  color: var(--app-text-secondary);
}
</style>
