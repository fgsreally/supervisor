<template>
  <div v-if="agent" class="system-prompt-panel">
    <div
      v-if="loading"
      class="system-prompt-loading system-prompt-muted"
    >
      <Loader2 class="system-prompt-icon animate-spin" />
      {{ t("agent.loadingPrompt") }}
    </div>
    <template v-else>
      <div class="system-prompt-toolbar">
        <span class="system-prompt-label">SYSTEM.md</span>
        <InlineEditActions
          :editing="editing"
          @edit="startEdit"
          @cancel="cancelEdit"
          @done="finishEdit"
        />
      </div>

      <div class="system-prompt-content">
        <CodeMirrorView
          v-if="editing"
          :content="systemMd"
          language="markdown"
          editable
          fill
          @update:content="onSystemMdChange"
        />
        <div
          v-else
          class="system-prompt-view custom-scrollbar"
        >
          <MarkdownContent :content="systemMd || t('agent.emptyPrompt')" prose />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2 } from "lucide-vue-next";
import CodeMirrorView from "@/components/base/CodeMirrorView.vue";
import InlineEditActions from "@/components/base/InlineEditActions.vue";
import MarkdownContent from "@/components/base/MarkdownContent.vue";
import { useAgentStore } from "@/store";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import { useI18n } from "@/i18n";

const props = defineProps<{
  agentId: string;
}>();

const agentStore = useAgentStore();
const { t } = useI18n();
const systemMd = ref("");
const editing = ref(false);
const snapshot = ref<string | null>(null);
const loading = ref(false);

const agent = computed(() => agentStore.getAgentById(props.agentId));

watch(
  () => props.agentId,
  async (id) => {
    editing.value = false;
    snapshot.value = null;
    loading.value = true;
    try {
      await agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd());
      systemMd.value =
        agentStore.agentResources[id]?.systemMd ??
        (await agentStore.fetchAgentSystemMd(id).catch(() => ""));
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function startEdit() {
  snapshot.value = systemMd.value;
  editing.value = true;
}

function cancelEdit() {
  if (snapshot.value !== null) systemMd.value = snapshot.value;
  editing.value = false;
  snapshot.value = null;
}

async function finishEdit() {
  await agentStore.updateAgentSystemMd(props.agentId, systemMd.value);
  editing.value = false;
  snapshot.value = null;
}

function onSystemMdChange(content: string) {
  systemMd.value = content;
}
</script>

<style scoped>
.system-prompt-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.system-prompt-loading {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  font-size: var(--app-font-control);
}

.system-prompt-icon {
  width: 1rem;
  height: 1rem;
}

.system-prompt-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  margin-bottom: var(--app-space-2);
}

.system-prompt-content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.system-prompt-label {
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  color: var(--app-text-secondary);
}

.system-prompt-muted {
  color: var(--app-text-secondary);
}

.system-prompt-view {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  color: var(--app-text-primary);
  font-size: var(--app-font-body-strong);
  line-height: 1.625;
}

.system-prompt-view :deep(.prose),
.system-prompt-view :deep(p),
.system-prompt-view :deep(li),
.system-prompt-view :deep(h1),
.system-prompt-view :deep(h2),
.system-prompt-view :deep(h3) {
  color: var(--app-text-primary);
}
</style>
