<template>
  <Teleport to="body">
    <Transition name="chat-menu">
      <div v-if="open" class="fixed inset-0 z-50 flex justify-end" @click.self="emit('close')">
        <div class="absolute inset-0 bg-black/20" />
        <aside class="chat-session-menu relative w-full max-w-[300px] h-full flex flex-col" @click.stop>
          <header class="chat-session-menu__header h-14 flex items-center justify-between px-4 border-b shrink-0">
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
                  <span class="text-[11px] text-center truncate w-full chat-session-menu__muted">{{ agentName }}</span>
                </div>
              </div>
            </section>

            <button
              type="button"
              class="chat-session-menu__row w-full flex items-center justify-between px-5 py-3.5 text-[15px] border-b transition-colors"
              @click="emit('search')"
            >
              <span>查找聊天内容</span>
              <ChevronRight class="w-4 h-4 chat-session-menu__chevron" />
            </button>

            <div class="px-5 py-3.5 flex items-center justify-between border-b chat-session-menu__section">
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
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, X } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  agentName: string
  muted: boolean
}>()

const emit = defineEmits<{
  close: []
  search: []
  'update:muted': [value: boolean]
}>()

const agentInitial = computed(() => props.agentName.charAt(0).toUpperCase() || 'A')
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
  transition: background-color 0.15s, color 0.15s;
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
