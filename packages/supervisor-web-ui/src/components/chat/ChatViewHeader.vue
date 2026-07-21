<template>
  <div
    class="relative z-50 h-16 md:h-[68px] border-b flex items-center px-3 md:px-6 shrink-0"
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
    <h1
      class="chat-header-title font-medium text-[18px] min-w-0 max-w-[40%] truncate"
      style="color: var(--app-text-primary)"
    >
      {{ title }}
    </h1>
    <WorkflowStageTag v-if="workflow" class="ml-3" :workflow="workflow" />
    <button
      v-if="agentName"
      type="button"
      class="chat-header-agent ml-3 text-[13px] hover:underline shrink-0"
      style="color: var(--app-text-link)"
      @click="agentId && emit('view-agent', agentId)"
    >
      {{ agentName }}
    </button>
    <div class="chat-header-status ml-4 text-xs" :class="statusBadgeClass">
      {{ statusLabel }}
    </div>
    <div class="ml-auto flex items-center gap-1">
      <slot name="actions" />
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
import type { WorkflowState } from "@/utils/workflow";
import WorkflowStageTag from "../WorkflowStageTag.vue";

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
  workflow?: WorkflowState | null;
}>();

const emit = defineEmits<{
  back: [];
  "view-agent": [agentId: string];
  "open-menu": [];
  "close-search": [];
}>();

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
      return "status-blue";
    case "running":
      return "status-yellow animate-pulse";
    case "waiting_user":
      return "status-orange";
    case "idle":
    case "finish":
      return "status-green";
    case "error":
      return "status-red";
    case "stopped":
      return "status-gray";
    default:
      return "status-gray";
  }
});
</script>

<style scoped>
.chat-header-btn {
  color: var(--app-nav-icon);
}

.chat-header-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-secondary);
}

.chat-header-status::before {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8a8a8a;
  content: "";
}

.status-green::before {
  background: #07c160;
}
.status-blue::before {
  background: #10aeff;
}
.status-yellow::before {
  background: #ffc300;
}
.status-orange::before {
  background: #fa9d3b;
}
.status-red::before {
  background: #fa5151;
}

.chat-header-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

@media (max-width: 767px) {
  .chat-header-title {
    max-width: none;
    flex: 1;
    font-size: 17px;
  }

  .chat-header-agent {
    display: none;
  }

  .chat-header-status {
    margin-left: 6px;
    padding-inline: 6px;
    font-size: 10px;
  }
}
</style>
