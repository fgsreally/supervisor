<template>
  <div v-if="agent" class="flex flex-col min-h-0 flex-1">
    <div class="flex items-center justify-between gap-3 mb-2 shrink-0">
      <span class="system-prompt-label text-[12px]">SYSTEM.md</span>
      <InlineEditActions
        :editing="editing"
        @edit="startEdit"
        @cancel="cancelEdit"
        @done="finishEdit"
      />
    </div>

    <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
      <CodeMirrorView
        v-if="editing"
        :content="systemMd"
        language="markdown"
        editable
        fill
        @update:content="onSystemMdChange"
      />
      <div v-else class="system-prompt-view flex-1 min-h-0 overflow-y-auto custom-scrollbar text-[15px] leading-relaxed">
        <MarkdownContent :content="systemMd || '（空）'" prose />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CodeMirrorView from './CodeMirrorView.vue'
import InlineEditActions from './InlineEditActions.vue'
import MarkdownContent from './MarkdownContent.vue'
import { useAgentStore } from '@/store'
import { getDefaultWorkspaceCwd } from '@/config/workspace'

const props = defineProps<{
  agentId: string
}>()

const agentStore = useAgentStore()
const systemMd = ref('')
const editing = ref(false)
const snapshot = ref<string | null>(null)

const agent = computed(() => agentStore.getAgentById(props.agentId))

watch(
  () => props.agentId,
  async (id) => {
    editing.value = false
    snapshot.value = null
    await agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd())
    systemMd.value =
      agentStore.agentResources[id]?.systemMd ??
      (await agentStore.fetchAgentSystemMd(id).catch(() => ''))
  },
  { immediate: true },
)

function startEdit() {
  snapshot.value = systemMd.value
  editing.value = true
}

function cancelEdit() {
  if (snapshot.value !== null) systemMd.value = snapshot.value
  editing.value = false
  snapshot.value = null
}

async function finishEdit() {
  await agentStore.updateAgentSystemMd(props.agentId, systemMd.value)
  editing.value = false
  snapshot.value = null
}

function onSystemMdChange(content: string) {
  systemMd.value = content
}
</script>

<style scoped>
.system-prompt-label {
  color: var(--app-text-secondary);
}

.system-prompt-view {
  color: var(--app-text-primary);
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
