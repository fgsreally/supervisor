<template>
  <div
    class="h-full w-full flex flex-col shrink-0 min-w-0"
    :style="{ ...panelStyle, background: 'var(--app-list-bg)' }"
  >
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <h1 class="text-[16px] font-medium flex-1" style="color: var(--app-text-primary)">聊天</h1>
    </div>

    <div class="px-3 py-2 shrink-0 border-b" style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)">
      <div class="relative">
        <Search class="w-4 h-4 absolute left-2.5 top-2" style="color: var(--app-text-muted)" />
        <input
          v-model="query"
          type="text"
          placeholder="搜索"
          class="list-search-input w-full rounded-md pl-8 pr-2 py-1.5 text-[13px] focus:outline-none transition-colors"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <template v-if="rootsToShow.length">
        <template v-for="group in workspaceGroups" :key="group.workspace.id">
          <div class="list-section-header sticky top-0 z-10">
            <button
              type="button"
              class="section-action-btn"
              :title="isWorkspaceCollapsed(group.workspace.id) ? '展开' : '折叠'"
              @click="toggleWorkspaceCollapse(group.workspace.id)"
            >
              <ChevronRight
                class="w-4 h-4 transition-transform"
                :class="{ 'rotate-90': !isWorkspaceCollapsed(group.workspace.id) }"
              />
            </button>
            <span class="list-section-title flex-1 truncate">{{ group.workspace.name }}</span>
            <button
              type="button"
              class="section-action-btn"
              title="添加 Agent"
              @click="openAgentPicker(group.workspace.id)"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>

          <template v-if="!isWorkspaceCollapsed(group.workspace.id)">
            <div v-for="root in group.sessions" :key="root.id">
              <SessionListItem
                :session="root"
                :active="activeId === root.id"
                mode="chat"
                :depth="0"
                @select="$emit('select', $event)"
                @context-menu="openContextMenu(root.id, $event)"
              />
              <SessionListSubtree
                v-if="childrenOf(root.id).length"
                :parent-id="root.id"
                :depth="1"
                :active-id="activeId"
                :sessions="filtered"
                :ancestor-open-depths="[]"
                @select="$emit('select', $event)"
                @context-menu="openContextMenu($event.sessionId, $event)"
              />
            </div>
          </template>
        </template>
      </template>

      <div v-else class="py-12 text-center text-sm" style="color: var(--app-text-muted)">无匹配会话</div>
    </div>

    <SessionAgentPicker
      :open="agentPickerWorkspaceId != null"
      @close="closeAgentPicker"
      @select="onAgentPicked"
    />

    <SessionListContextMenu
      :open="contextMenu != null"
      :x="contextMenu?.x ?? 0"
      :y="contextMenu?.y ?? 0"
      @close="closeContextMenu"
      @delete="confirmDeleteSession"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, Plus, Search } from 'lucide-vue-next'
import type { MockSession } from '../mock/app-data'
import { getAgentById, groupSessionsByWorkspace, mockStore, addSession, deleteSession } from '../mock/store'
import SessionListItem from './SessionListItem.vue'
import SessionListSubtree from './SessionListSubtree.vue'
import SessionAgentPicker from './SessionAgentPicker.vue'
import SessionListContextMenu from './SessionListContextMenu.vue'

const props = defineProps<{
  activeId: string
  width?: number
}>()

const panelStyle = computed(() => {
  if (props.width == null) return undefined
  return { width: `${props.width}px` }
})

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
}>()

const query = ref('')
const collapsedWorkspaceIds = ref<Set<string>>(new Set())
const agentPickerWorkspaceId = ref<string | null>(null)
const contextMenu = ref<{ sessionId: string; x: number; y: number } | null>(null)

function filterSessions(list: MockSession[]): MockSession[] {
  const q = query.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (s) =>
      s.meta.name.toLowerCase().includes(q) ||
      s.lastMessagePreview.toLowerCase().includes(q) ||
      s.meta.description?.toLowerCase().includes(q),
  )
}

const filtered = computed(() => filterSessions(mockStore.sessions))

const rootsToShow = computed(() =>
  filtered.value
    .filter((s) => !s.parentId)
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()),
)

const workspaceGroups = computed(() => {
  const groups = groupSessionsByWorkspace(rootsToShow.value)
  return groups.map((g) => ({
    ...g,
    sessions: g.sessions.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()),
  }))
})

function childrenOf(parentId: string): MockSession[] {
  return filtered.value
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
}

function isWorkspaceCollapsed(workspaceId: string): boolean {
  return collapsedWorkspaceIds.value.has(workspaceId)
}

function toggleWorkspaceCollapse(workspaceId: string) {
  const next = new Set(collapsedWorkspaceIds.value)
  if (next.has(workspaceId)) next.delete(workspaceId)
  else next.add(workspaceId)
  collapsedWorkspaceIds.value = next
}

function openAgentPicker(workspaceId: string) {
  agentPickerWorkspaceId.value = workspaceId
}

function closeAgentPicker() {
  agentPickerWorkspaceId.value = null
}

function openContextMenu(sessionId: string, pos: { x: number; y: number }) {
  const menuWidth = 120
  const menuHeight = 40
  const x = Math.min(pos.x, window.innerWidth - menuWidth - 8)
  const y = Math.min(pos.y, window.innerHeight - menuHeight - 8)
  contextMenu.value = { sessionId, x: Math.max(8, x), y: Math.max(8, y) }
}

function closeContextMenu() {
  contextMenu.value = null
}

function confirmDeleteSession() {
  const target = contextMenu.value
  closeContextMenu()
  if (!target) return
  if (!window.confirm('确定删除该会话？子会话也会一并删除。')) return
  deleteSession(target.sessionId)
  emit('delete', target.sessionId)
}

function onAgentPicked(agentId: string) {
  const workspaceId = agentPickerWorkspaceId.value
  closeAgentPicker()
  if (!workspaceId) return

  const agent = getAgentById(agentId)
  const id = `session-${workspaceId}-${agentId}-${Date.now()}`
  addSession({
    id,
    workspaceId,
    agentId,
    status: 'idle',
    lastActiveAt: new Date().toISOString(),
    meta: {
      name: agent?.name ?? agentId,
      description: '',
    },
    lastMessagePreview: '',
  })

  const next = new Set(collapsedWorkspaceIds.value)
  next.delete(workspaceId)
  collapsedWorkspaceIds.value = next

  emit('select', id)
}
</script>

<style scoped>
.list-search-input {
  background: var(--app-list-search-bg);
  color: var(--app-text-primary);
}

.list-search-input:focus {
  background: var(--app-list-search-focus-bg);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-accent) 50%, transparent);
}

.list-section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 6px 8px;
  background: color-mix(in srgb, var(--app-list-section-bg) 95%, transparent);
}

.list-section-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-secondary);
}

.section-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  color: var(--app-text-muted);
  transition: color 0.15s, background-color 0.15s;
}

.section-action-btn:hover {
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
</style>
