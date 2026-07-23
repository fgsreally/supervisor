<template>
  <Teleport to="body">
    <Transition name="external-import">
      <div
        v-if="open"
        class="fixed inset-0 z-[210] flex items-center justify-center p-4"
        @mousedown.self="emit('close')"
      >
        <div class="absolute inset-0 bg-black/40" />
        <div
          class="external-import-modal relative flex max-h-[min(76vh,620px)] w-full max-w-[620px] flex-col overflow-hidden rounded-lg border shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="external-import-title"
          @mousedown.stop
        >
          <header
            class="external-import-modal__header flex shrink-0 items-center gap-3 border-b px-4 py-3"
          >
            <div class="min-w-0 flex-1">
              <h2 id="external-import-title" class="text-[15px] font-medium">从外部引入</h2>
              <p class="mt-0.5 text-[12px] external-import-modal__muted">
                选择最近活跃的 Codex 或 Claude Code 对话
              </p>
            </div>
            <button
              type="button"
              class="external-import-modal__icon"
              :disabled="loading"
              @click="load"
            >
              <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
            </button>
            <button type="button" class="external-import-modal__icon" @click="emit('close')">
              <X class="h-5 w-5" />
            </button>
          </header>

          <div v-if="loading && !sessions.length" class="external-import-modal__state">
            正在读取外部对话…
          </div>
          <div v-else-if="error" class="external-import-modal__state external-import-modal__error">
            {{ error }}
          </div>
          <div v-else-if="!sessions.length" class="external-import-modal__state">
            没有找到可引入的对话
          </div>
          <ul v-else class="custom-scrollbar flex-1 overflow-y-auto py-1">
            <li
              v-for="session in sessions"
              :key="`${session.backend}:${session.externalSessionId}`"
            >
              <button
                type="button"
                class="external-import-modal__item flex w-full items-start gap-3 px-4 py-3 text-left"
                :disabled="importing"
                @click="emit('select', session)"
              >
                <span class="external-import-modal__badge">{{
                  session.backend === "codex" ? "Codex" : "CC"
                }}</span>
                <span class="min-w-0 flex-1">
                  <strong class="block truncate text-[13px] font-medium">{{
                    session.title
                  }}</strong>
                  <small class="external-import-modal__muted mt-1 block truncate">{{
                    session.cwd
                  }}</small>
                  <small class="external-import-modal__muted mt-1 block">
                    {{ formatDate(session.lastActiveAt) }}
                  </small>
                </span>
              </button>
            </li>
          </ul>
          <div v-if="importing" class="external-import-modal__busy">
            正在提交原目录修改并创建 worktree…
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { RefreshCw, X } from "lucide-vue-next";
import { listExternalSessions, type ExternalSessionCandidate } from "@/api";

const props = defineProps<{ open: boolean; importing?: boolean }>();
const emit = defineEmits<{
  close: [];
  select: [session: ExternalSessionCandidate];
}>();
const sessions = ref<ExternalSessionCandidate[]>([]);
const loading = ref(false);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    sessions.value = await listExternalSessions();
  } catch (value) {
    error.value = value instanceof Error ? value.message : "读取外部对话失败";
  } finally {
    loading.value = false;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
);
</script>

<style scoped>
.external-import-modal {
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
}
.external-import-modal__header {
  border-color: var(--app-border-subtle);
}
.external-import-modal__muted {
  color: var(--app-text-muted);
}
.external-import-modal__icon {
  padding: 4px;
  border-radius: 6px;
  color: var(--app-text-muted);
}
.external-import-modal__icon:hover {
  color: var(--app-text-primary);
  background: var(--app-hover);
}
.external-import-modal__item:hover {
  background: var(--app-popup-hover);
}
.external-import-modal__badge {
  min-width: 48px;
  border-radius: 6px;
  padding: 5px 7px;
  text-align: center;
  font-size: 11px;
  background: var(--app-hover);
}
.external-import-modal__state,
.external-import-modal__busy {
  padding: 36px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text-muted);
}
.external-import-modal__busy {
  padding: 10px 16px;
  border-top: 1px solid var(--app-border-subtle);
}
.external-import-modal__error {
  color: var(--app-danger, #dc2626);
}
.external-import-enter-active,
.external-import-leave-active {
  transition: opacity 0.2s ease;
}
.external-import-enter-from,
.external-import-leave-to {
  opacity: 0;
}
</style>
