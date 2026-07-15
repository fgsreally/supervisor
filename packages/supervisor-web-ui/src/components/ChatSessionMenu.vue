<template>
  <Teleport to="body">
    <Transition name="chat-menu">
      <div v-if="open" class="fixed inset-0 z-50 flex justify-end" @click.self="emit('close')">
        <div class="absolute inset-0 bg-black/20" />
        <aside
          class="chat-session-menu relative w-full max-w-[300px] h-full flex flex-col"
          @click.stop
        >
          <header
            class="chat-session-menu__header h-14 flex items-center justify-between px-4 border-b shrink-0"
          >
            <span class="text-[15px] font-medium">聊天信息</span>
            <button type="button" class="chat-session-menu__close" @click="emit('close')">
              <X class="w-5 h-5" />
            </button>
          </header>

          <div class="flex-1 overflow-y-auto custom-scrollbar">
            <section class="px-5 py-5 border-b chat-session-menu__section">
              <div class="flex flex-wrap gap-4">
                <div class="flex flex-col items-center gap-1.5 w-14">
                  <div
                    class="w-12 h-12 rounded-md bg-[#576b95] text-white flex items-center justify-center text-lg font-medium"
                  >
                    {{ agentInitial }}
                  </div>
                  <span class="text-[11px] text-center truncate w-full chat-session-menu__muted">{{
                    agentName
                  }}</span>
                </div>
              </div>
              <p v-if="gitBranch" class="mt-4 text-[12px] chat-session-menu__muted break-all">
                分支：<code class="text-[11px]">{{ gitBranch }}</code>
              </p>
              <p v-if="sessionStatus === 'finish'" class="mt-3 text-[13px] text-[#07c160]">
                会话已完成
              </p>
              <p v-else-if="sessionStatus === 'error'" class="mt-3 text-[13px] text-[#fa5151]">
                合并失败，worktree 已保留
              </p>
            </section>

            <button
              type="button"
              class="chat-session-menu__row w-full flex items-center justify-between px-5 py-3.5 text-[15px] border-b transition-colors"
              @click="emit('btw')"
            >
              <span>顺便问一下</span>
              <ChevronRight class="w-4 h-4 chat-session-menu__chevron" />
            </button>

            <section v-if="childSessions.length" class="border-b chat-session-menu__section">
              <div class="px-5 pt-4 pb-2 text-[12px] chat-session-menu__muted">子会话</div>
              <button
                v-for="child in childSessions"
                :key="child.id"
                type="button"
                class="chat-session-menu__row w-full flex items-center justify-between gap-3 px-5 py-3 text-left transition-colors"
                @click="emit('navigate', child.id)"
              >
                <span class="min-w-0">
                  <span class="block truncate text-[14px]">{{ childName(child) }}</span>
                  <span class="block text-[11px] chat-session-menu__muted">
                    {{ child.branchType ? BRANCH_LABELS[child.branchType] : "子会话" }} ·
                    {{ child.status }}
                  </span>
                </span>
                <ChevronRight class="w-4 h-4 shrink-0 chat-session-menu__chevron" />
              </button>
            </section>

            <button
              type="button"
              class="chat-session-menu__row w-full flex items-center justify-between px-5 py-3.5 text-[15px] border-b transition-colors"
              @click="emit('search')"
            >
              <span>查找聊天内容</span>
              <ChevronRight class="w-4 h-4 chat-session-menu__chevron" />
            </button>

            <button
              v-if="canCheckpoint"
              type="button"
              class="chat-session-menu__row w-full flex items-center justify-between px-5 py-3.5 text-[15px] border-b transition-colors"
              @click="emit('checkpoint')"
            >
              <span>创建存档点</span>
              <ChevronRight class="w-4 h-4 chat-session-menu__chevron" />
            </button>

            <button
              v-if="canCheckpoint"
              type="button"
              class="chat-session-menu__row w-full flex items-center justify-between px-5 py-3.5 text-[15px] border-b transition-colors"
              @click="emit('rewind')"
            >
              <span>时光倒流</span>
              <ChevronRight class="w-4 h-4 chat-session-menu__chevron" />
            </button>

            <button
              v-if="canCheckpoint"
              type="button"
              class="chat-session-menu__row w-full flex items-center justify-between px-5 py-3.5 text-[15px] border-b transition-colors"
              @click="emit('commit')"
            >
              <span>提交代码变更</span>
              <ChevronRight class="w-4 h-4 chat-session-menu__chevron" />
            </button>

            <button
              type="button"
              class="chat-session-menu__row w-full flex items-center justify-between px-5 py-3.5 text-[15px] border-b transition-colors"
              @click="emit('log')"
            >
              <span>查看日志</span>
              <ChevronRight class="w-4 h-4 chat-session-menu__chevron" />
            </button>

            <button
              v-if="canComplete"
              type="button"
              class="chat-session-menu__row w-full flex items-center justify-between px-5 py-3.5 text-[15px] border-b transition-colors text-[#576b95]"
              @click="emit('complete')"
            >
              <span>完成会话</span>
              <ChevronRight class="w-4 h-4 chat-session-menu__chevron" />
            </button>

            <div
              class="px-5 py-3.5 flex items-center justify-between border-b chat-session-menu__section"
            >
              <span class="text-[15px]">消息免打扰</span>
              <button
                type="button"
                role="switch"
                :aria-checked="muted"
                class="relative w-11 h-6 rounded-full transition-colors"
                :class="muted ? 'bg-[#07c160]' : 'bg-[#e5e5e5]'"
                @click="emit('update:muted', !muted)"
              >
                <span
                  class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  :class="muted ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>

            <div
              class="px-5 py-3.5 flex items-center justify-between border-b chat-session-menu__section"
            >
              <span class="text-[15px]">显示思考过程</span>
              <button
                type="button"
                role="switch"
                :aria-checked="showThinking"
                class="relative w-11 h-6 rounded-full transition-colors"
                :class="showThinking ? 'bg-[#07c160]' : 'bg-[#e5e5e5]'"
                @click="emit('update:showThinking', !showThinking)"
              >
                <span
                  class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  :class="showThinking ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight, X } from "lucide-vue-next";
import type { Session } from "@/api";
import { BRANCH_LABELS } from "@/utils/session-branch";

const props = defineProps<{
  open: boolean;
  agentName: string;
  muted: boolean;
  showThinking: boolean;
  sessionStatus?: string;
  gitBranch?: string | null;
  canComplete?: boolean;
  canCheckpoint?: boolean;
  childSessions: Array<Pick<Session, "id" | "status" | "branchType" | "meta">>;
}>();

const emit = defineEmits<{
  close: [];
  search: [];
  log: [];
  complete: [];
  checkpoint: [];
  rewind: [];
  commit: [];
  btw: [];
  navigate: [sessionId: string];
  "update:muted": [value: boolean];
  "update:showThinking": [value: boolean];
}>();

const agentInitial = computed(() => props.agentName.charAt(0).toUpperCase() || "A");

function childName(child: { id: string; meta: Record<string, unknown> }): string {
  return typeof child.meta.name === "string" ? child.meta.name : `Session ${child.id}`;
}
</script>

<style scoped>
.chat-session-menu {
  background: var(--app-popup-bg);
  color: var(--app-text-primary);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
}

.chat-session-menu__header {
  border-color: var(--app-border-subtle);
}

.chat-session-menu__close {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-text-muted);
  transition:
    background-color 0.15s,
    color 0.15s;
}

.chat-session-menu__close:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.chat-session-menu__section {
  border-color: var(--app-border-subtle);
}

.chat-session-menu__row {
  border-color: var(--app-border-subtle);
}

.chat-session-menu__row:hover {
  background: var(--app-popup-hover);
}

.chat-session-menu__muted {
  color: var(--app-text-secondary);
}

.chat-session-menu__chevron {
  color: var(--app-text-muted);
}

.chat-menu-enter-active,
.chat-menu-leave-active {
  transition: opacity 0.2s ease;
}
.chat-menu-enter-active aside,
.chat-menu-leave-active aside {
  transition: transform 0.22s ease;
}
.chat-menu-enter-from,
.chat-menu-leave-to {
  opacity: 0;
}
.chat-menu-enter-from aside,
.chat-menu-leave-to aside {
  transform: translateX(100%);
}
</style>
