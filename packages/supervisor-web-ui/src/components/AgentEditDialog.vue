<template>
  <Teleport to="body">
    <div
      v-if="open && agent"
      class="agent-edit-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      @click.self="close"
    >
      <section
        class="agent-edit-dialog w-full max-w-xl max-h-[90vh] overflow-hidden rounded-lg shadow-xl border flex flex-col"
      >
        <header class="h-14 px-5 border-b flex items-center shrink-0">
          <h2 class="text-[16px] font-medium flex-1">编辑智能代理</h2>
          <button type="button" class="agent-edit-close" title="关闭" @click="close">
            <X class="w-5 h-5" />
          </button>
        </header>

        <div class="p-5 overflow-y-auto custom-scrollbar space-y-4">
          <div class="flex items-center gap-3 pb-1">
            <AgentAvatar
              :agent-id="agent.id"
              :agent-name="draft.name || agent.name"
              :icon="draft.icon"
              class="w-12 h-12 text-lg"
            />
            <label class="block flex-1 text-[13px]">
              <span class="agent-edit-label mb-1 block">头像</span>
              <div class="flex gap-2">
                <input
                  v-model="draft.icon"
                  type="text"
                  placeholder="图片 URL 或 Iconify ID"
                  class="agent-edit-input"
                />
                <input
                  ref="iconInput"
                  type="file"
                  accept="image/*,.svg"
                  class="hidden"
                  @change="onIconSelected"
                />
                <button
                  type="button"
                  class="agent-edit-upload"
                  :disabled="uploading"
                  title="上传头像"
                  @click="iconInput?.click()"
                >
                  <Upload class="w-4 h-4" />
                </button>
              </div>
            </label>
          </div>

          <label class="block text-[13px]">
            <span class="agent-edit-label mb-1 block">名称</span>
            <input v-model="draft.name" type="text" class="agent-edit-input" />
          </label>

          <label class="block text-[13px]">
            <span class="agent-edit-label mb-1 block">描述</span>
            <textarea v-model="draft.description" rows="3" class="agent-edit-input resize-y" />
          </label>

          <template v-if="agent.backendType === 'native'">
            <label class="block text-[13px]">
              <span class="agent-edit-label mb-1 block">模型服务</span>
              <select
                v-model="draft.providerId"
                class="agent-edit-input"
                @change="onProviderChange"
              >
                <option value="">稍后配置</option>
                <option v-for="provider in providers" :key="provider.id" :value="provider.id">
                  {{ provider.name }}
                </option>
              </select>
            </label>
            <label class="block text-[13px]">
              <span class="agent-edit-label mb-1 block">模型</span>
              <select v-model="draft.modelId" class="agent-edit-input font-mono">
                <option value="">稍后配置</option>
                <option v-for="model in models" :key="model.id" :value="model.id">
                  {{ model.name }}
                </option>
              </select>
            </label>
            <label class="block text-[13px]">
              <span class="agent-edit-label mb-1 block">工具集</span>
              <select v-model="draft.toolsPreset" class="agent-edit-input">
                <option value="coding">coding</option>
                <option value="readonly">readonly</option>
                <option value="none">none</option>
              </select>
            </label>
          </template>

          <template v-else>
            <label class="block text-[13px]">
              <span class="agent-edit-label mb-1 block">启动命令</span>
              <input v-model="draft.command" type="text" class="agent-edit-input font-mono" />
            </label>
            <label class="block text-[13px]">
              <span class="agent-edit-label mb-1 block">命令行参数（每行一个）</span>
              <textarea
                v-model="draft.args"
                rows="5"
                class="agent-edit-input font-mono resize-y"
                placeholder="--model&#10;sonnet&#10;--allowedTools&#10;Bash(git diff:*) Edit"
              />
            </label>
          </template>
        </div>

        <footer class="px-5 py-3 border-t flex justify-end gap-2 shrink-0">
          <button type="button" class="wechat-btn wechat-btn--secondary" @click="close">
            取消
          </button>
          <button
            type="button"
            class="wechat-btn wechat-btn--primary"
            :disabled="!canSave || saving"
            @click="save"
          >
            保存
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Upload, X } from "lucide-vue-next";
import { uploadIcon, type ToolsPreset } from "@/api";
import { useAgentStore, useProviderStore } from "@/store";
import { providerToUI } from "@/utils/provider-ui";
import AgentAvatar from "./AgentAvatar.vue";

const props = defineProps<{ open: boolean; agentId: string }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const agentStore = useAgentStore();
const providerStore = useProviderStore();
const saving = ref(false);
const uploading = ref(false);
const iconInput = ref<HTMLInputElement | null>(null);
const draft = reactive({
  name: "",
  description: "",
  icon: "",
  providerId: "",
  modelId: "",
  toolsPreset: "coding" as ToolsPreset,
  command: "",
  args: "",
});

const agent = computed(() => agentStore.getAgentById(props.agentId));
const providers = computed(() =>
  providerStore.providers.map((provider) =>
    providerToUI(provider, providerStore.models[provider.id] ?? []),
  ),
);
const models = computed(
  () => providers.value.find((provider) => provider.id === draft.providerId)?.models ?? [],
);
const canSave = computed(() =>
  Boolean(draft.name.trim() && (agent.value?.backendType === "native" || draft.command.trim())),
);

watch(
  () => [props.open, agent.value] as const,
  ([open, value]) => {
    if (!open || !value) return;
    const external = value.meta.external as { command?: string; args?: string[] } | undefined;
    const command = typeof value.meta.command === "string" ? value.meta.command : external?.command;
    const args = Array.isArray(value.meta.args) ? value.meta.args : external?.args;
    Object.assign(draft, {
      name: value.name,
      description: value.description ?? "",
      icon: value.icon ?? "",
      providerId: value.providerId ?? "",
      modelId: value.modelId ?? "",
      toolsPreset: value.toolsPreset ?? "coding",
      command: command ?? "",
      args: (args ?? []).join("\n"),
    });
  },
  { immediate: true },
);

function onProviderChange() {
  if (!draft.providerId) {
    draft.modelId = "";
    return;
  }
  if (!models.value.some((model) => model.id === draft.modelId)) {
    draft.modelId = models.value[0]?.id ?? "";
  }
}

function close() {
  if (!saving.value) emit("close");
}

async function onIconSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    draft.icon = (await uploadIcon(file)).path;
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

async function save() {
  const value = agent.value;
  if (!value || !canSave.value || saving.value) return;
  saving.value = true;
  try {
    await agentStore.updateAgent(value.id, {
      name: draft.name.trim(),
      description: draft.description.trim(),
      icon: draft.icon.trim() || null,
      providerId: value.backendType === "native" ? draft.providerId || null : null,
      modelId: value.backendType === "native" ? draft.modelId || null : undefined,
      toolsPreset: value.backendType === "native" ? draft.toolsPreset : undefined,
      meta:
        value.backendType === "native"
          ? undefined
          : {
              command: draft.command.trim(),
              args: draft.args
                .split(/\r?\n/)
                .map((arg) => arg.trim())
                .filter(Boolean),
            },
    });
    emit("saved");
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.agent-edit-overlay {
  background: rgb(0 0 0 / 42%);
}

.agent-edit-dialog {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.agent-edit-dialog header,
.agent-edit-dialog footer {
  background: var(--app-settings-card);
  border-color: var(--app-border);
}

.agent-edit-close {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-text-secondary);
}

.agent-edit-close:hover {
  background: var(--app-hover);
}

.agent-edit-label {
  color: var(--app-text-secondary);
}

.agent-edit-input {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  outline: none;
}

.agent-edit-input:focus {
  border-color: #07c160;
  box-shadow: 0 0 0 2px rgb(7 193 96 / 12%);
}

.agent-edit-upload {
  flex: none;
  width: 38px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-secondary);
  background: var(--app-settings-card);
}

.agent-edit-upload:hover:not(:disabled) {
  border-color: #07c160;
  color: #07c160;
}

.wechat-btn {
  min-width: 72px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
}

.wechat-btn--secondary {
  border: 1px solid var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.wechat-btn--secondary:hover {
  background: var(--app-hover);
}

.wechat-btn--primary {
  border: 1px solid #07c160;
  background: #07c160;
  color: #ffffff;
}

.wechat-btn--primary:hover {
  background: #06ad56;
  border-color: #06ad56;
}

.wechat-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
