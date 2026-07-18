<template>
  <div class="agent-form-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden">
    <div
      class="agent-form-header h-14 md:h-16 border-b flex items-center px-3 md:px-6 shrink-0 gap-3"
    >
      <button
        v-if="showBack"
        type="button"
        class="mr-1 p-1.5 rounded-md agent-form-back-btn"
        @click="emit('cancel')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-medium agent-form-title">添加智能代理</div>
      </div>
      <button
        type="button"
        class="agent-form-cancel-btn shrink-0 px-3 py-1.5 rounded-md border text-[13px]"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="button"
        class="shrink-0 px-3 py-1.5 rounded-md bg-[#07c160] text-white text-[13px] hover:bg-[#06ad56] disabled:opacity-50"
        :disabled="!canSave || saving"
        @click="save"
      >
        创建
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
      <section class="agent-form-card rounded-lg p-4 space-y-4 max-w-xl">
        <div class="flex items-center gap-3">
          <AgentAvatar
            :agent-id="draft.id || draft.backendType"
            :agent-name="draft.name || 'Agent'"
            :icon="draft.icon"
            class="w-12 h-12 text-lg"
          />
          <label class="block flex-1 text-[13px]">
            <span class="agent-form-label mb-1 block">头像</span>
            <div class="flex gap-2">
              <input
                v-model="draft.icon"
                type="text"
                placeholder="图片 URL 或 Iconify ID"
                class="agent-form-input flex-1 min-w-0 px-3 py-2 rounded-md"
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
                class="agent-form-upload"
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
          <span class="agent-form-label mb-1 block">运行后端</span>
          <select v-model="draft.backendType" class="agent-form-input w-full px-3 py-2 rounded-md">
            <option value="native">Supervisor</option>
            <option value="codex">Codex</option>
            <option value="claude">Claude Code</option>
            <option value="kimi">Kimi Code</option>
            <option value="acp">ACP 外部进程</option>
          </select>
        </label>
        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">名称</span>
          <input
            v-model="draft.name"
            type="text"
            placeholder="例如 文档助手"
            class="agent-form-input w-full px-3 py-2 rounded-md"
          />
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">ID（可选）</span>
          <input
            v-model="draft.id"
            type="text"
            placeholder="留空则自动生成"
            class="agent-form-input w-full px-3 py-2 rounded-md font-mono"
          />
        </label>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">描述</span>
          <textarea
            v-model="draft.description"
            rows="2"
            class="agent-form-input w-full px-3 py-2 rounded-md resize-y min-h-[4rem]"
          />
        </label>

        <label v-if="draft.backendType === 'native'" class="block text-[13px]">
          <span class="agent-form-label mb-1 block">模型服务</span>
          <select
            v-model="draft.providerId"
            class="agent-form-input w-full px-3 py-2 rounded-md"
            @change="onProviderChange"
          >
            <option v-for="p in providerOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>

        <label v-if="draft.backendType === 'native'" class="block text-[13px]">
          <span class="agent-form-label mb-1 block">模型</span>
          <select
            v-model="draft.modelId"
            class="agent-form-input w-full px-3 py-2 rounded-md font-mono text-[12px]"
          >
            <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.id }}</option>
          </select>
        </label>

        <template v-if="draft.backendType !== 'native'">
          <label class="block text-[13px]">
            <span class="agent-form-label mb-1 block">命令</span>
            <input
              v-model="draft.command"
              type="text"
              :placeholder="commandPlaceholder"
              class="agent-form-input w-full px-3 py-2 rounded-md font-mono"
            />
          </label>
          <label class="block text-[13px]">
            <span class="agent-form-label mb-1 block">命令行参数（每行一个）</span>
            <textarea
              v-model="draft.args"
              rows="5"
              placeholder="--model&#10;sonnet"
              class="agent-form-input w-full px-3 py-2 rounded-md font-mono resize-y"
            />
          </label>
        </template>

        <label class="block text-[13px]">
          <span class="agent-form-label mb-1 block">工具集</span>
          <select v-model="draft.toolsPreset" class="agent-form-input w-full px-3 py-2 rounded-md">
            <option value="coding">coding</option>
            <option value="readonly">readonly</option>
            <option value="none">none</option>
          </select>
        </label>
      </section>

      <p class="mt-4 text-[12px] max-w-xl agent-form-hint leading-relaxed">
        创建后可在 Skills / Extensions / Prompts 页从全局库关联资源。全局资源目录：
        <code class="font-mono">~/.pi/supervisor/global/</code>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronLeft, Upload } from "lucide-vue-next";
import { uploadIcon, type ToolsPreset } from "@/api";
import { useAgentStore, useProviderStore } from "@/store";
import { providerToUI } from "@/utils/provider-ui";
import AgentAvatar from "../components/AgentAvatar.vue";

defineProps<{ showBack?: boolean }>();

const emit = defineEmits<{ cancel: []; saved: [id: string] }>();

const agentStore = useAgentStore();
const providerStore = useProviderStore();
const saving = ref(false);
const uploading = ref(false);
const iconInput = ref<HTMLInputElement | null>(null);

const draft = ref({
  id: "",
  name: "",
  description: "",
  icon: "",
  backendType: "native" as "native" | "codex" | "claude" | "kimi" | "acp",
  providerId: "",
  modelId: "",
  toolsPreset: "coding" as ToolsPreset,
  command: "",
  args: "",
});

const providerOptions = computed(() =>
  providerStore.providers.map((p) => providerToUI(p, providerStore.models[p.id] ?? [])),
);

const modelOptions = computed(() => {
  const p = providerOptions.value.find((x) => x.id === draft.value.providerId);
  return p?.models ?? [];
});

watch(
  providerOptions,
  (list) => {
    if (!draft.value.providerId && list[0]) {
      draft.value.providerId = list[0].id;
      draft.value.modelId = list[0].models[0]?.id || "";
    }
  },
  { immediate: true },
);

const canSave = computed(() => {
  if (!draft.value.name.trim()) return false;
  if (draft.value.backendType !== "native") {
    return draft.value.backendType !== "acp" || !!draft.value.command.trim();
  }
  return !!draft.value.providerId && !!draft.value.modelId;
});

const commandPlaceholder = computed(() => {
  if (draft.value.backendType === "codex") return "例如 codex";
  if (draft.value.backendType === "claude") return "例如 claude";
  if (draft.value.backendType === "kimi") return "例如 kimi";
  return "外部 Agent 命令";
});

function onProviderChange() {
  const p = providerOptions.value.find((x) => x.id === draft.value.providerId);
  if (!p) return;
  if (!p.models.some((m) => m.id === draft.value.modelId)) {
    draft.value.modelId = p.models[0]?.id || "";
  }
}

async function onIconSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    draft.value.icon = (await uploadIcon(file)).path;
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    const agent = await agentStore.createAgent({
      id: draft.value.id.trim() || undefined,
      name: draft.value.name.trim(),
      description: draft.value.description.trim() || undefined,
      icon: draft.value.icon.trim() || null,
      backendType: draft.value.backendType,
      providerId: draft.value.backendType === "native" ? draft.value.providerId : undefined,
      modelId: draft.value.backendType === "native" ? draft.value.modelId : undefined,
      toolsPreset: draft.value.toolsPreset,
      meta:
        draft.value.backendType !== "native" && draft.value.command.trim()
          ? {
              external: {
                command: draft.value.command.trim(),
                args: draft.value.args
                  .split(/\r?\n/)
                  .map((arg) => arg.trim())
                  .filter(Boolean),
                permissionPolicy: "reject_once",
              },
            }
          : undefined,
    });
    emit("saved", agent.id);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.agent-form-view {
  background: var(--app-settings-bg);
}

.agent-form-header {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}

.agent-form-back-btn {
  color: var(--app-text-secondary);
}

.agent-form-back-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.agent-form-title {
  color: var(--app-text-primary);
}

.agent-form-cancel-btn {
  border-color: var(--app-btn-secondary-border);
  color: var(--app-btn-secondary-text);
  background: transparent;
}

.agent-form-cancel-btn:hover {
  background: var(--app-btn-secondary-hover-bg);
  color: var(--app-text-primary);
}

.agent-form-card {
  background: var(--app-settings-card);
}

.agent-form-label {
  color: var(--app-text-secondary);
}

.agent-form-input {
  border: 1px solid var(--app-border);
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}

.agent-form-hint {
  color: var(--app-text-muted);
}

.agent-form-upload {
  flex: none;
  width: 38px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-secondary);
  background: var(--app-settings-bg);
}

.agent-form-upload:hover:not(:disabled) {
  border-color: #07c160;
  color: #07c160;
}
</style>
