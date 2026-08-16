<template>
  <div class="chat-view-header relative z-50 h-12 md:h-[68px] border-b flex items-center px-2.5 md:px-6 shrink-0" style="background: var(--app-chat-header-bg); border-color: var(--app-header-divider, var(--app-border-subtle));">
    <button v-if="showBack" type="button" class="mr-2 p-1.5 rounded-md md:hidden chat-header-btn" :aria-label="t('common.back')" @click="emit('back')"><ChevronLeft class="w-5 h-5" /></button>
    <h1 class="chat-header-title font-medium text-[18px] min-w-0 max-w-[40%] truncate" style="color: var(--app-text-primary)">{{ title }}</h1>
    <WorkflowStageTag v-if="stage" class="ml-3" :stage="stage" />
    <button v-if="agentName" type="button" class="chat-header-agent ml-3 text-[13px] hover:underline shrink-0" style="color: var(--app-text-link)" @click="agentId && emit('view-agent', agentId)">{{ agentName }}</button>
    <div class="chat-header-status ml-4 text-xs" :class="statusBadgeClass">{{ statusLabel }}</div>
    <div v-if="!externalAgent" class="chat-header-cost" :title="t('chat.header.cost')">{{ usage ? formatCost(usage.cost.total) : "$0.00" }}</div>
    <div class="ml-auto flex items-center gap-1"><slot name="actions" /><button type="button" class="p-1.5 rounded-md transition-colors chat-header-btn" :title="t('chat.header.menu')" @click="emit('open-menu')"><MoreHorizontal class="w-[18px] h-[18px] stroke-[1.75]" /></button></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, MoreHorizontal } from "lucide-vue-next";
import WorkflowStageTag from "@/components/task/WorkflowStageTag.vue";
import type { SessionUsage } from "@/api";
import { useI18n } from "@/i18n";
export type ChatHeaderStatus = "initializing" | "running" | "blocked" | "active" | "idle" | "error" | "stopped" | "finish";
const props = defineProps<{ title: string; titleReadonly?: boolean; agentName?: string | null; agentId?: string; externalAgent?: boolean; statusKey: ChatHeaderStatus | string; showBack?: boolean; stage?: string | null; usage?: SessionUsage | null }>();
const emit = defineEmits<{ back: []; "view-agent": [agentId: string]; "open-menu": [] }>();
const { t } = useI18n();
function formatCost(value: number) { return value > 0 && value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`; }
const KNOWN_STATUS = ["initializing", "running", "blocked", "active", "idle", "finish", "error", "stopped"] as const;
const statusLabel = computed(() => { const key = `chat.status.${props.statusKey}`; return (KNOWN_STATUS as readonly string[]).includes(props.statusKey) ? t(key) : props.statusKey; });
const statusBadgeClass = computed(() => { switch (props.statusKey) { case "initializing": return "status-blue animate-pulse"; case "running": return "status-yellow animate-pulse"; case "blocked": return "status-orange"; case "active": case "finish": return "status-green"; case "error": return "status-red"; case "idle": case "stopped": return "status-gray"; default: return "status-gray"; } });
</script>

<style scoped>
.chat-header-btn { color: var(--app-nav-icon); cursor: pointer; } .chat-header-status { display: inline-flex; align-items: center; gap: 6px; color: var(--app-text-secondary); }
.chat-header-cost { margin-left: 9px; padding: 3px 7px; border: 1px solid var(--app-border-subtle); border-radius: 999px; color: var(--app-text-secondary); background: var(--app-hover); font-size: 10px; font-variant-numeric: tabular-nums; }
.chat-header-status::before { width: 7px; height: 7px; border-radius: 50%; background: #8a8a8a; content: ""; } .status-green::before { background: #07c160; } .status-blue::before { background: #10aeff; } .status-yellow::before { background: #ffc300; } .status-orange::before { background: #fa9d3b; } .status-red::before { background: #fa5151; }
.chat-header-btn:hover { background: var(--app-hover); color: var(--app-text-primary); }
@media (max-width: 767px) { .chat-view-header { min-height: 48px; } .chat-header-title { max-width: none; flex: 1; font-size: 16px; } .chat-header-agent { display: none; } .chat-header-status { margin-left: 6px; padding-inline: 6px; font-size: 10px; } }
</style>
