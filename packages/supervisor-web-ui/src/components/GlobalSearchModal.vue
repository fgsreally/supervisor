<template>
  <Teleport to="body">
    <div v-if="open" class="global-search-overlay" @click.self="emit('close')">
      <div class="global-search-dialog" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="global-search-header">
          <Search class="w-5 h-5 shrink-0" style="color: var(--app-text-muted)" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="搜索所有聊天消息..."
            class="global-search-input"
            @keydown.enter="doSearch"
          />
          <button
            v-if="query"
            type="button"
            class="global-search-clear"
            @click="query = ''"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Filters -->
        <div class="global-search-filters">
          <select v-model="roleFilter" class="global-search-select">
            <option value="">所有角色</option>
            <option value="user">用户</option>
            <option value="assistant">助手</option>
          </select>
          <button
            type="button"
            class="global-search-go-btn"
            :disabled="!query.trim()"
            @click="doSearch"
          >
            搜索
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="global-search-loading">
          <Loader2 class="w-5 h-5 animate-spin" />
          <span>搜索中...</span>
        </div>

        <!-- Results -->
        <div v-else-if="results.length" class="global-search-results custom-scrollbar">
          <div
            v-for="(hit, i) in results"
            :key="hit.messageId ?? i"
            class="global-search-result-item"
            :class="{ 'global-search-result-item--old': hit.isOld }"
            @click="goToSession(hit.sessionId)"
          >
            <div class="global-search-result-header">
              <span class="global-search-session-name">
                {{ sessionName(hit.sessionId) }}
              </span>
              <span class="global-search-role-badge" :class="roleBadgeClass(hit.messageRole)">
                {{ roleLabel(hit.messageRole) }}
              </span>
              <span v-if="hit.isOld" class="global-search-old-badge">已归档</span>
            </div>
            <div class="global-search-snippet">{{ hit.snippet }}</div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="searched" class="global-search-empty">
          <Search class="w-8 h-8 mb-2" style="color: var(--app-text-muted)" />
          <span>未找到匹配的消息</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { Loader2, Search, X } from 'lucide-vue-next'
import { searchMessages, type MessageSearchHit } from '@/api'
import { useSessionStore } from '@/store'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  navigate: [sessionId: string]
}>()

const query = ref('')
const roleFilter = ref('')
const results = ref<MessageSearchHit[]>([])
const loading = ref(false)
const searched = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const sessionStore = useSessionStore()

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = ''
      results.value = []
      searched.value = false
      loading.value = false
      void nextTick(() => inputRef.value?.focus())
    }
  },
)

function roleLabel(role: string | null): string {
  if (role === 'user') return '用户'
  if (role === 'assistant') return '助手'
  return role ?? '未知'
}

function roleBadgeClass(role: string | null): string {
  if (role === 'user') return 'global-search-badge--user'
  if (role === 'assistant') return 'global-search-badge--assistant'
  return ''
}

function sessionName(sessionId: string): string {
  const s = sessionStore.getSessionById(sessionId)
  if (s?.meta?.name && typeof s.meta.name === 'string') return s.meta.name
  return `Session ${sessionId.substring(0, 8)}`
}

async function doSearch() {
  const q = query.value.trim()
  if (!q) return

  loading.value = true
  searched.value = true

  try {
    results.value = await searchMessages(q, {
      role: roleFilter.value || undefined,
      limit: 50,
    })
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

function goToSession(sessionId: string) {
  emit('navigate', sessionId)
  emit('close')
}
</script>

<style scoped>
.global-search-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 60px 1rem;
  background: rgb(0 0 0 / 0.4);
}

.global-search-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 36rem;
  max-height: 70vh;
  overflow: hidden;
  border-radius: 0.75rem;
  border: 1px solid var(--app-border);
  background: var(--app-popup-bg);
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.15);
}

.global-search-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.global-search-input {
  flex: 1;
  font-size: 15px;
  border: none;
  background: transparent;
  color: var(--app-text-primary);
  outline: none;
}

.global-search-input::placeholder {
  color: var(--app-text-muted);
}

.global-search-clear {
  padding: 4px;
  border-radius: 4px;
  color: var(--app-text-muted);
  transition: color 0.15s;
}

.global-search-clear:hover {
  color: var(--app-text-primary);
}

.global-search-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.global-search-select {
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  background: var(--app-list-search-bg);
  color: var(--app-text-primary);
  outline: none;
  cursor: pointer;
}

.global-search-go-btn {
  font-size: 13px;
  padding: 4px 14px;
  border-radius: 4px;
  border: none;
  background: #07c160;
  color: #fff;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.global-search-go-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.global-search-go-btn:not(:disabled):hover {
  opacity: 0.85;
}

.global-search-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  font-size: 14px;
  color: var(--app-text-muted);
}

.global-search-results {
  flex: 1;
  overflow-y: auto;
}

.global-search-result-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
  cursor: pointer;
  transition: background 0.12s;
}

.global-search-result-item:hover {
  background: var(--app-hover);
}

.global-search-result-item--old {
  opacity: 0.7;
}

.global-search-result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.global-search-session-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-search-role-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 500;
  flex-shrink: 0;
}

.global-search-badge--user {
  background: #dbeafe;
  color: #1d4ed8;
}

.global-search-badge--assistant {
  background: #d1fae5;
  color: #047857;
}

.global-search-old-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #6b7280;
  flex-shrink: 0;
}

.global-search-snippet {
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.global-search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  font-size: 14px;
  color: var(--app-text-muted);
}
</style>
