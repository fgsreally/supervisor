<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[150]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="project-git-menu fixed w-[240px] rounded-lg border shadow-lg p-1.5"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
      >
        <div v-if="loading" class="project-git-menu__hint">读取分支…</div>
        <div v-else-if="error" class="project-git-menu__hint project-git-menu__hint--error">
          {{ error }}
        </div>
        <template v-else>
          <div class="project-git-menu__current">
            <GitBranch class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{{ currentBranch || "—" }}</span>
          </div>
          <div v-if="branches?.length" class="project-git-menu__branches">
            <button
              v-for="branch in branches ?? []"
              :key="branch"
              type="button"
              class="project-git-menu__branch"
              :class="{ 'project-git-menu__branch--active': branch === currentBranch }"
              :disabled="busy || branch === currentBranch"
              @click="emit('checkout', branch)"
            >
              <Check v-if="branch === currentBranch" class="h-3.5 w-3.5 shrink-0" />
              <span v-else class="w-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ branch }}</span>
            </button>
          </div>
          <div v-else class="project-git-menu__hint">暂无本地分支</div>
        </template>
        <hr class="project-git-menu__divider" />
        <button
          type="button"
          class="project-git-menu__item"
          :disabled="busy || loading"
          @click="emit('pull')"
        >
          <ArrowDownToLine class="h-3.5 w-3.5 shrink-0" />
          Git Pull
        </button>
        <button
          type="button"
          class="project-git-menu__item"
          :disabled="busy || loading"
          @click="emit('push')"
        >
          <ArrowUpFromLine class="h-3.5 w-3.5 shrink-0" />
          Git Push
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ArrowDownToLine, ArrowUpFromLine, Check, GitBranch } from "lucide-vue-next";

defineProps<{
  open: boolean;
  x: number;
  y: number;
  busy?: boolean;
  loading?: boolean;
  error?: string | null;
  currentBranch?: string | null;
  branches?: string[];
}>();

const emit = defineEmits<{
  close: [];
  pull: [];
  push: [];
  checkout: [branch: string];
}>();
</script>

<style scoped>
.project-git-menu {
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
  color: var(--app-text-primary);
}

.project-git-menu__current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.project-git-menu__branches {
  max-height: 180px;
  overflow-y: auto;
  margin-bottom: 2px;
}

.project-git-menu__branch {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  text-align: left;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--app-text-primary);
  transition: background-color 0.15s;
}

.project-git-menu__branch:hover:not(:disabled) {
  background: var(--app-popup-hover);
}

.project-git-menu__branch--active {
  color: #07c160;
}

.project-git-menu__branch:disabled {
  opacity: 0.85;
  cursor: default;
}

.project-git-menu__hint {
  padding: 10px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.project-git-menu__hint--error {
  color: #ef4444;
}

.project-git-menu__divider {
  margin: 4px 0;
  border: none;
  border-top: 1px solid var(--app-border);
}

.project-git-menu__item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--app-text-primary);
  transition: background-color 0.15s;
}

.project-git-menu__item:hover:not(:disabled) {
  background: var(--app-popup-hover);
}

.project-git-menu__item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
