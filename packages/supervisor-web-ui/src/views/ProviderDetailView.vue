<template>
  <div
    class="provider-detail-view flex flex-col flex-1 min-w-0 basis-0 h-full w-full overflow-hidden"
  >
    <div
      class="provider-detail-header h-14 md:h-16 border-b flex items-center px-3 md:px-6 shrink-0 gap-3"
    >
      <button
        v-if="showBack"
        type="button"
        class="mr-1 p-1.5 rounded-md provider-detail-back-btn"
        @click="emit('back')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <ProviderAvatar
        :provider-id="provider.id"
        :provider-name="provider.name"
        :icon="provider.icon"
        class="w-10 h-10"
      />
      <div class="flex-1 min-w-0">
        <div class="text-[16px] font-medium truncate provider-detail-title">
          {{ provider.name }}
        </div>
        <div class="text-[12px] truncate font-mono mt-0.5 provider-detail-subtitle">
          {{ provider.models.length }} 个模型
        </div>
      </div>
      <label class="provider-detail-enable">
        <input
          type="checkbox"
          class="sr-only"
          :checked="provider.isEnabled"
          @change="emit('toggle-enabled', ($event.target as HTMLInputElement).checked)"
        />
        <span class="provider-detail-toggle" aria-hidden="true"><span /></span>
        <span>{{ provider.isEnabled ? "已启用" : "已禁用" }}</span>
      </label>
      <button
        type="button"
        class="provider-detail-btn shrink-0 px-3 py-1.5 rounded-md border text-[13px]"
        @click="emit('edit')"
      >
        编辑
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div class="provider-detail-content max-w-5xl">
        <section class="provider-detail-section">
          <div class="text-[14px] font-medium provider-detail-title mb-5">配置</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
            <div>
              <div class="provider-detail-subtitle mb-1">API Type</div>
              <div class="provider-detail-title font-mono">{{ apiTypeLabel }}</div>
            </div>
            <div>
              <div class="provider-detail-subtitle mb-1">Base URL</div>
              <div class="provider-detail-title font-mono break-all">
                {{ provider.baseUrl || "（默认）" }}
              </div>
            </div>
          </div>
        </section>

        <section class="provider-detail-section">
          <div class="pb-4 border-b provider-detail-divider flex items-center gap-3">
            <div class="text-[14px] font-medium provider-detail-title flex-1">
              模型
              <span class="ml-2 text-[12px] font-normal provider-detail-subtitle">
                {{ provider.models.length }}
              </span>
            </div>
            <button type="button" class="provider-detail-add-btn" @click="emit('add-model')">
              <Plus class="w-4 h-4" />
              <span>添加模型</span>
            </button>
          </div>
          <ul v-if="provider.models.length" class="divide-y provider-detail-divider">
            <li v-for="model in provider.models" :key="model.id">
              <div class="provider-detail-model-row w-full px-2 py-3 flex items-center gap-3">
                <Cpu class="w-5 h-5 provider-detail-subtitle shrink-0" />
                <button
                  type="button"
                  class="flex-1 min-w-0 text-left"
                  @click="emit('select-model', model.id)"
                >
                  <div class="text-[14px] font-medium provider-detail-title truncate">
                    {{ model.name || model.id }}
                  </div>
                  <div class="text-[12px] provider-detail-subtitle font-mono truncate mt-0.5">
                    {{ model.id }}
                  </div>
                </button>
                <div class="text-[12px] provider-detail-subtitle font-mono shrink-0">
                  {{ formatTokenCount(model.contextWindow) }} context
                </div>
                <button
                  type="button"
                  class="provider-detail-row-action"
                  title="编辑模型"
                  @click="emit('edit-model', model.id)"
                >
                  <Pencil class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  class="provider-detail-row-action provider-detail-row-action--danger"
                  title="删除模型"
                  @click="removeModel(model.id)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </li>
          </ul>
          <div v-else class="provider-detail-empty-models">
            <Cpu class="w-8 h-8" />
            <div class="provider-detail-title text-[14px]">暂无模型</div>
            <div class="text-[12px]">添加模型后才能绑定到智能代理</div>
          </div>
        </section>

        <section class="provider-detail-section">
          <div
            class="pb-4 border-b provider-detail-divider text-[14px] font-medium provider-detail-title"
          >
            使用此模型供应商的智能代理
            <span class="ml-2 text-[12px] font-normal provider-detail-subtitle">{{
              linkedAgents.length
            }}</span>
          </div>
          <ul v-if="linkedAgents.length" class="divide-y provider-detail-divider">
            <li v-for="agent in linkedAgents" :key="agent.id">
              <button
                type="button"
                class="w-full px-2 py-3 flex items-center gap-3 text-left provider-detail-row transition-colors"
                @click="emit('view-agent', agent.id)"
              >
                <div
                  class="w-10 h-10 rounded-md flex items-center justify-center text-white font-semibold shrink-0 shadow-sm"
                  :class="agentAvatarClass(agent.id)"
                >
                  {{ agent.name.substring(0, 1).toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[14px] font-medium provider-detail-title truncate">
                    {{ agent.name }}
                  </div>
                  <div class="text-[12px] provider-detail-subtitle truncate mt-0.5">
                    {{ agent.description }}
                  </div>
                </div>
                <ChevronRight class="w-4 h-4 provider-detail-subtitle shrink-0" />
              </button>
            </li>
          </ul>
          <div v-else class="py-8 text-[13px] provider-detail-subtitle text-center">
            暂无 Agent 绑定
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, ChevronRight, Cpu, Pencil, Plus, Trash2 } from "lucide-vue-next";
import ProviderAvatar from "../components/ProviderAvatar.vue";
import type { UIProvider } from "@/types/ui";
import { PROVIDER_API_TYPES } from "@/constants/providers";
import { useAgentStore } from "@/store";
import { agentAvatarClass } from "../utils/avatar-class";
import { formatTokenCount } from "../utils/format-tokens";

const props = defineProps<{
  provider: UIProvider;
  showBack?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  edit: [];
  "add-model": [];
  "select-model": [modelId: string];
  "edit-model": [modelId: string];
  "delete-model": [modelId: string];
  "toggle-enabled": [enabled: boolean];
  "view-agent": [agentId: string];
}>();

const agentStore = useAgentStore();

const linkedAgents = computed(() =>
  agentStore.agents.filter((a) => a.providerId === props.provider.id),
);

const apiTypeLabel = computed(
  () =>
    PROVIDER_API_TYPES.find((t) => t.value === props.provider.apiType)?.label ??
    props.provider.apiType,
);

function removeModel(modelId: string) {
  if (!confirm(`删除模型 ${modelId}？`)) return;
  emit("delete-model", modelId);
}
</script>

<style scoped>
.provider-detail-view {
  background: var(--app-settings-bg);
}

.provider-detail-header {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
}

.provider-detail-back-btn {
  color: var(--app-text-secondary);
}

.provider-detail-back-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-detail-title {
  color: var(--app-text-primary);
}

.provider-detail-subtitle {
  color: var(--app-text-secondary);
}

.provider-detail-btn {
  border-color: var(--app-border);
  background: var(--app-settings-card);
  color: var(--app-text-secondary);
}

.provider-detail-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-detail-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--app-text-secondary);
}

.provider-detail-add-btn:hover,
.provider-detail-row-action:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.provider-detail-enable {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--app-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.provider-detail-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex: none;
  border-radius: 10px;
  background: var(--app-border);
  transition: background 150ms ease;
}

.provider-detail-toggle > span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 22%);
  transition: transform 150ms ease;
}

.provider-detail-enable input:checked + .provider-detail-toggle {
  background: var(--app-accent);
}

.provider-detail-enable input:checked + .provider-detail-toggle > span {
  transform: translateX(16px);
}

.provider-detail-model-row {
  padding-inline: 18px;
  transition: background 120ms ease;
}

.provider-detail-model-row:hover {
  background: var(--app-hover);
}

.provider-detail-row-action {
  padding: 6px;
  border-radius: 5px;
  color: var(--app-text-secondary);
}

.provider-detail-row-action--danger:hover {
  color: #dc2626;
}

.provider-detail-empty-models {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--app-text-secondary);
  text-align: center;
}

.provider-detail-content {
  padding: 8px 24px 48px;
}

.provider-detail-section {
  padding: 24px 0;
  border-bottom: 1px solid var(--app-border-subtle);
}

.provider-detail-divider {
  border-color: var(--app-border-subtle);
}

.provider-detail-divider > :not(:last-child) {
  border-color: var(--app-border-subtle);
}

.provider-detail-row:hover {
  background: var(--app-hover);
}

@media (max-width: 767px) {
  .provider-detail-content {
    padding-inline: 16px;
  }
}
</style>
