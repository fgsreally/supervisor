<template>
  <div class="external-agent-details max-w-3xl space-y-3">
    <section class="external-agent-section border rounded-md overflow-hidden">
      <dl class="divide-y external-agent-divider">
        <div class="external-agent-row px-4 py-3 grid grid-cols-[7rem_minmax(0,1fr)] gap-3 items-center">
          <dt>运行后端</dt>
          <dd class="font-medium">{{ backendLabel }}</dd>
        </div>
        <div class="external-agent-row px-4 py-3 grid grid-cols-[7rem_minmax(0,1fr)] gap-3 items-start">
          <dt class="pt-0.5">启动命令</dt>
          <dd class="min-w-0 flex items-start gap-2">
            <code class="external-agent-command flex-1 font-mono text-[12px] break-all">{{
              commandLine
            }}</code>
            <button
              type="button"
              class="external-agent-wrench"
              title="修改启动命令"
              aria-label="修改启动命令"
              @click="openEditor"
            >
              <Wrench class="w-4 h-4" />
            </button>
          </dd>
        </div>
        <div
          v-if="availabilityLabel"
          class="external-agent-row px-4 py-3 grid grid-cols-[7rem_minmax(0,1fr)] gap-3 items-center"
        >
          <dt>可用性</dt>
          <dd>{{ availabilityLabel }}</dd>
        </div>
      </dl>
    </section>

    <Teleport to="body">
      <div
        v-if="editorOpen"
        class="external-command-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
        @click.self="closeEditor"
      >
        <section
          class="external-command-dialog w-full max-w-lg overflow-hidden rounded-lg border shadow-xl"
        >
          <header class="h-12 px-4 border-b flex items-center shrink-0">
            <h2 class="text-[15px] font-medium flex-1">修改启动命令</h2>
            <button type="button" class="external-command-close" title="关闭" @click="closeEditor">
              <X class="w-5 h-5" />
            </button>
          </header>
          <div class="p-4 space-y-3">
            <label class="block text-[13px]">
              <span class="external-command-label mb-1 block">命令</span>
              <UiField v-model="draft.command" type="text" class="font-mono" placeholder="agent" />
            </label>
            <label class="block text-[13px]">
              <span class="external-command-label mb-1 block">参数（每行一个）</span>
              <UiField
                v-model="draft.args"
                as="textarea"
                rows="6"
                class="font-mono resize-y"
                placeholder="--yolo&#10;acp"
              />
            </label>
            <p class="text-[12px] external-command-hint">
              实际启动为：<code>{{ previewLine }}</code>
            </p>
          </div>
          <footer class="px-4 py-3 border-t flex justify-end gap-2">
            <UiButton @click="closeEditor">取消</UiButton>
            <UiActionButton :disabled="!canSave" :loading="saving" @click="save">
              保存
            </UiActionButton>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Wrench, X } from "lucide-vue-next";
import type { Agent } from "@/api";
import { useAgentStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import UiActionButton from "./UiActionButton.vue";
import { UiButton, UiField } from "./ui";

const props = defineProps<{ agent: Agent }>();
const emit = defineEmits<{ saved: [] }>();

const agentStore = useAgentStore();
const editorOpen = ref(false);
const saving = ref(false);
const draft = reactive({ command: "", args: "" });

const backendLabel = computed(() => {
  if (props.agent.backendType === "codex") return "Codex";
  if (props.agent.backendType === "claude") return "Claude Code";
  if (props.agent.backendType === "kimi") return "Kimi Code";
  if (props.agent.backendType === "cursor") return "Cursor";
  if (props.agent.backendType === "mimo") return "MiMo Code";
  return "ACP";
});

function resolveCommandParts(agent: Agent): { command: string; args: string[] } {
  const legacy = agent.meta.external as { command?: string; args?: string[] } | undefined;
  const command =
    agent.externalConfig?.command ??
    (typeof agent.meta.command === "string" ? agent.meta.command : legacy?.command) ??
    "";
  const args =
    agent.externalConfig?.args ??
    (Array.isArray(agent.meta.args) ? agent.meta.args : legacy?.args) ??
    [];
  return {
    command,
    args: args.filter((value): value is string => typeof value === "string"),
  };
}

const commandParts = computed(() => resolveCommandParts(props.agent));
const commandLine = computed(
  () => [commandParts.value.command, ...commandParts.value.args].filter(Boolean).join(" ") || "-",
);

const availabilityLabel = computed(() => {
  if (props.agent.available === false) {
    return props.agent.unavailableReason || "本机未找到可执行文件";
  }
  if (props.agent.detectedVersion) return props.agent.detectedVersion;
  return "";
});

const previewArgs = computed(() =>
  draft.args
    .split(/\r?\n/)
    .map((arg) => arg.trim())
    .filter(Boolean),
);
const previewLine = computed(
  () => [draft.command.trim(), ...previewArgs.value].filter(Boolean).join(" ") || "-",
);
const canSave = computed(() => Boolean(draft.command.trim()));

function openEditor() {
  const parts = resolveCommandParts(props.agent);
  draft.command = parts.command;
  draft.args = parts.args.join("\n");
  editorOpen.value = true;
}

function closeEditor() {
  if (!saving.value) editorOpen.value = false;
}

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    await agentStore.updateAgent(props.agent.id, {
      externalConfig: {
        ...(props.agent.externalConfig ?? { command: draft.command.trim() }),
        command: draft.command.trim(),
        args: previewArgs.value,
      },
    });
    showUiMessage("启动命令已更新", "success");
    emit("saved");
    editorOpen.value = false;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "保存失败", "error");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.external-agent-section {
  background: var(--app-settings-card);
  border-color: var(--app-border-subtle);
}

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

.external-agent-command {
  display: block;
  padding: 6px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-hover) 70%, var(--app-settings-card));
  color: var(--app-text-primary);
}

.external-agent-wrench {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 6px;
  color: var(--app-text-secondary);
  flex-shrink: 0;
}

.external-agent-wrench:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.external-command-overlay {
  background: rgb(0 0 0 / 42%);
}

.external-command-dialog {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.external-command-dialog header,
.external-command-dialog footer {
  border-color: var(--app-border);
}

.external-command-close {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 6px;
  color: var(--app-text-secondary);
}

.external-command-close:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.external-command-label {
  color: var(--app-text-secondary);
}

.external-command-hint {
  color: var(--app-text-secondary);
}

.external-command-hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--app-text-primary);
}
</style>
