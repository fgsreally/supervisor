<template>
  <div class="tool-activity-bar" :class="statusClass">
    <div
      class="tool-activity-bar__inner"
      :class="{ 'tool-activity-bar__inner--clickable': clickable }"
      :role="clickable ? 'button' : undefined"
      :tabindex="clickable ? 0 : undefined"
      @click="clickable && $emit('open')"
      @keydown.enter="clickable && $emit('open')"
    >
      <component :is="icon" class="tool-activity-bar__icon" />
      <span class="tool-activity-bar__label">{{ summary }}</span>
      <span v-if="isSkillLoad" class="tool-activity-bar__badge">Skill</span>
      <span v-if="isMcpTool" class="tool-activity-bar__badge tool-activity-bar__badge--mcp"
        >MCP</span
      >
      <button
        v-if="showNavigate"
        type="button"
        class="tool-activity-bar__nav"
        @click.stop="$emit('navigate')"
      >
        <ArrowRightCircle class="w-3 h-3" />
        查看子代理
      </button>
      <Loader2 v-if="pending" class="tool-activity-bar__status animate-spin" />
      <Eye v-else-if="clickable" class="tool-activity-bar__status" title="查看详情" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Terminal,
  FileText,
  PencilLine,
  FilePlus,
  Users,
  Wrench,
  Eye,
  Loader2,
  ArrowRightCircle,
  MessageCircleQuestion,
  BookOpen,
  Clock3,
  Plug,
} from "lucide-vue-next";
import { isSkillReadPath, toolCallSummary, toolResultSummary } from "../utils/tool-display";
import { isAskToolName } from "../utils/ask-tool";

const props = defineProps<{
  toolName: string;
  callArgs?: Record<string, unknown>;
  resultContent?: Array<{ type: string; text: string }>;
  showNavigate?: boolean;
  pending?: boolean;
  isError?: boolean;
}>();

defineEmits<{ open: []; navigate: [] }>();

const hasResult = computed(() => !!props.resultContent?.length);
const clickable = computed(
  () => hasResult.value && !props.pending && !isAskToolName(props.toolName),
);

const statusClass = computed(() => {
  if (props.pending || !hasResult.value) return "tool-activity-bar--pending";
  if (props.isError) return "tool-activity-bar--error";
  return "tool-activity-bar--done";
});

const summary = computed(() => {
  const call = toolCallSummary(props.toolName, props.callArgs);
  if (!hasResult.value) return call;
  if (props.isError) return `${call} · 失败`;
  return `${call} · ${toolResultSummary(props.toolName, props.resultContent)}`;
});

const isSkillLoad = computed(() => {
  if (props.toolName === "skill") return true;
  if (props.toolName !== "read") return false;
  const path = typeof props.callArgs?.path === "string" ? props.callArgs.path : "";
  return isSkillReadPath(path);
});
const isMcpTool = computed(() => /^mcp[_:.-]/i.test(props.toolName));

const icon = computed(() => {
  if (isAskToolName(props.toolName)) return MessageCircleQuestion;
  if (isMcpTool.value) return Plug;
  switch (props.toolName) {
    case "read":
      return FileText;
    case "write":
      return FilePlus;
    case "edit":
      return PencilLine;
    case "bash":
      return Terminal;
    case "spawn_agent":
      return Users;
    case "skill":
      return BookOpen;
    case "TimerCreate":
    case "TimerList":
    case "TimerDelete":
      return Clock3;
    default:
      return Wrench;
  }
});
</script>

<style scoped>
.tool-activity-bar {
  display: inline-block;
  align-self: flex-start;
  max-width: 100%;
  width: fit-content;
  border-radius: 5px;
  overflow: hidden;
  border: 0;
  background: var(--app-hover);
}

.tool-activity-bar--pending {
  background: color-mix(in srgb, #eab308 8%, var(--app-bubble-assistant));
}

.tool-activity-bar--done {
  background: var(--app-hover);
}

.tool-activity-bar--error {
  background: color-mix(in srgb, #ef4444 8%, var(--app-bubble-assistant));
}

.tool-activity-bar__inner {
  display: inline-flex;
  width: auto;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.45rem;
  text-align: left;
  transition:
    background-color 0.15s,
    color 0.15s,
    transform 0.1s;
}

.tool-activity-bar__inner--clickable {
  cursor: pointer;
}

.tool-activity-bar__inner--clickable:hover {
  background: color-mix(in srgb, #07c160 8%, var(--app-hover));
}

.tool-activity-bar__inner--clickable:focus-visible {
  box-shadow: 0 0 0 2px rgb(7 193 96 / 22%);
  outline: none;
}

.tool-activity-bar__inner--clickable:active {
  transform: scale(0.985);
}

.tool-activity-bar__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

.tool-activity-bar--pending .tool-activity-bar__icon,
.tool-activity-bar--pending .tool-activity-bar__status {
  color: #eab308;
}

.tool-activity-bar--done .tool-activity-bar__icon,
.tool-activity-bar--done .tool-activity-bar__status {
  color: #22c55e;
}

.tool-activity-bar--error .tool-activity-bar__icon,
.tool-activity-bar--error .tool-activity-bar__status {
  color: #ef4444;
}

.tool-activity-bar__label {
  min-width: 0;
  max-width: min(100%, 18rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 400;
  color: var(--app-text-secondary);
}

.tool-activity-bar__badge {
  flex-shrink: 0;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--app-accent, #07c160);
  background: color-mix(in srgb, var(--app-accent, #07c160) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-accent, #07c160) 35%, transparent);
}

.tool-activity-bar__badge--mcp {
  color: #7561d4;
  border-color: color-mix(in srgb, #7561d4 35%, transparent);
  background: color-mix(in srgb, #7561d4 14%, transparent);
}

.tool-activity-bar__status {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

.tool-activity-bar__nav {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: #2563eb;
  background: color-mix(in srgb, #60a5fa 12%, transparent);
  border: none;
  cursor: pointer;
}

.tool-activity-bar__nav:hover {
  background: color-mix(in srgb, #60a5fa 22%, transparent);
}
</style>
