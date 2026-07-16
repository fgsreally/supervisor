<template>
  <div
    class="h-14 md:h-[60px] border-b flex items-center px-3 md:px-6 shrink-0 z-10"
    style="background: var(--app-chat-header-bg); border-color: var(--app-border)"
  >
    <button
      v-if="showBack"
      type="button"
      class="mr-2 p-1.5 rounded-md md:hidden chat-header-btn"
      @click="emit('back')"
    >
      <ChevronLeft class="w-5 h-5" />
    </button>
    <input
      :value="title"
      type="text"
      class="font-medium text-[18px] bg-transparent border-b border-transparent focus:border-[#07c160] focus:outline-none min-w-0 max-w-[40%] truncate"
      style="color: var(--app-text-primary)"
      :readonly="titleReadonly"
      @input="onTitleInput"
      @change="emit('save-title')"
    />
    <button
      v-if="agentName"
      type="button"
      class="ml-2 text-[12px] hover:underline shrink-0"
      style="color: var(--app-text-link)"
      @click="agentId && emit('view-agent', agentId)"
    >
      {{ agentName }}
    </button>
    <div class="ml-3 px-2 py-0.5 rounded text-xs font-medium" :class="statusBadgeClass">
      {{ statusLabel }}
    </div>
    <div class="ml-auto flex items-center gap-1">
      <button
        v-if="searchOpen"
        type="button"
        class="p-1.5 rounded-md transition-colors chat-header-btn"
        title="关闭搜索"
        @click="emit('close-search')"
      >
        <X class="w-[18px] h-[18px]" />
      </button>
      <button
        type="button"
        class="p-1.5 rounded-md transition-colors chat-header-btn"
        title="聊天信息"
        @click="emit('open-menu')"
      >
        <MoreHorizontal class="w-[18px] h-[18px] stroke-[1.75]" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, MoreHorizontal, X } from "lucide-vue-next";

/** UI-facing session phase (overrides backend idle while streaming / waiting on ask). */
export type ChatHeaderStatus =
  | "starting"
  | "running"
  | "waiting_user"
  | "idle"
  | "error"
  | "stopped"
  | "finish";

const props = defineProps<{
  title: string;
  titleReadonly?: boolean;
  agentName?: string | null;
  agentId?: string;
  statusKey: ChatHeaderStatus | string;
  showBack?: boolean;
  searchOpen?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  "view-agent": [agentId: string];
  "open-menu": [];
  "close-search": [];
  "save-title": [];
  "update:title": [value: string];
}>();

function onTitleInput(event: Event) {
  emit("update:title", (event.target as HTMLInputElement).value);
}

const statusLabel = computed(() => {
  switch (props.statusKey) {
    case "starting":
      return "启动中";
    case "running":
      return "生成中";
    case "waiting_user":
      return "等待你操作";
    case "idle":
      return "空闲";
    case "finish":
      return "已完成";
    case "error":
      return "错误";
    case "stopped":
      return "已停止";
    default:
      return props.statusKey;
  }
});

const statusBadgeClass = computed(() => {
  switch (props.statusKey) {
    case "starting":
      return "bg-blue-100 text-blue-800";
    case "running":
      return "bg-yellow-100 text-yellow-800 animate-pulse";
    case "waiting_user":
      return "bg-orange-100 text-orange-800";
    case "idle":
    case "finish":
      return "bg-green-100 text-green-800";
    case "error":
      return "bg-red-100 text-red-800";
    case "stopped":
      return "bg-gray-200 text-gray-800";
    default:
      return "bg-gray-200 text-gray-800";
  }
});
</script>

<style scoped>
.chat-header-btn {
  color: var(--app-nav-icon);
}

.chat-header-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
</style>
