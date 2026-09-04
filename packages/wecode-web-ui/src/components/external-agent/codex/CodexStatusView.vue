<template>
  <div class="codex-status">
    <div class="status-hero">
      <span class="status-dot" :class="`is-${statusType}`" />
      <div>
        <strong>{{ statusType }}</strong>
        <span>{{ thread.preview || "Codex session" }}</span>
      </div>
    </div>
    <dl class="status-grid">
      <div v-for="item in fields" :key="String(item.label)">
        <dt>{{ item.label }}</dt>
        <dd :title="item.value">{{ item.value }}</dd>
      </div>
    </dl>
    <details>
      <summary>原始详情</summary>
      <HighlightedCodeBlock :code="JSON.stringify(data, null, 2)" lang="json" />
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import HighlightedCodeBlock from "@/components/base/HighlightedCodeBlock.vue";

const props = defineProps<{ data: Record<string, unknown> }>();
const thread = computed(() => (props.data.thread as Record<string, unknown> | undefined) ?? {});
const statusType = computed(() => String((thread.value.status as Record<string, unknown> | undefined)?.type ?? "unknown"));
const fields = computed(() => [
  ["模型提供方", thread.value.modelProvider],
  ["工作目录", thread.value.cwd],
  ["历史模式", thread.value.historyMode],
  ["CLI 版本", thread.value.cliVersion],
  ["来源", thread.value.source],
  ["会话 ID", thread.value.sessionId],
  ["可接受输入", thread.value.canAcceptDirectInput === true ? "是" : "否"],
].filter(([, value]) => value !== undefined && value !== null).map(([label, value]) => ({ label, value: String(value) })));
</script>

<style scoped>
.status-hero { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 10px; background: var(--app-hover); }
.status-hero div { display: grid; gap: 3px; }
.status-hero span:last-child { color: var(--app-text-muted); font-size: var(--app-font-caption); }
.status-dot { width: 10px; height: 10px; border-radius: 50%; background: #64748b; box-shadow: 0 0 0 5px rgb(100 116 139 / 16%); }
.status-dot.is-idle { background: #22c55e; box-shadow: 0 0 0 5px rgb(34 197 94 / 16%); }
.status-dot.is-running { background: #f59e0b; box-shadow: 0 0 0 5px rgb(245 158 11 / 16%); }
.status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 14px 0; overflow: hidden; border-radius: 8px; background: var(--app-chat-input-island-border); }
.status-grid div { min-width: 0; padding: 10px 12px; background: var(--app-chat-bg); }
dt { color: var(--app-text-muted); font-size: var(--app-font-caption); }
dd { margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--app-font-body); }
summary { cursor: pointer; color: var(--app-text-muted); font-size: var(--app-font-control); }
details .highlighted-code { max-height: 34vh; overflow: auto; margin-top: 8px; }
@media (max-width: 560px) { .status-grid { grid-template-columns: 1fr; } }
</style>
