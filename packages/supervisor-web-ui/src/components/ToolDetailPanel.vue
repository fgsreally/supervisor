<template>
  <aside class="tool-detail-panel">
    <header>
      <strong>{{ title }}</strong>
      <button type="button" title="关闭" @click="$emit('close')"><X /></button>
    </header>
    <ToolTerminal v-if="terminal" :lines="terminalLines" :prompt="terminalPrompt" />
    <div v-else class="tool-detail-panel__body custom-scrollbar">
      <section v-for="(section, index) in sections" :key="index">
        <label>{{ section.label }}</label>
        <MarkdownContent v-if="section.markdown" :content="section.content" />
        <pre v-else>{{ section.content }}</pre>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getSessionEvalState, type EvalRuntimeState } from "@/api";
import MarkdownContent from "./MarkdownContent.vue";
import ToolTerminal from "./ToolTerminal.vue";
import type { ToolDetailSection } from "./ToolDetailModal.vue";

const props = defineProps<{
  title: string;
  sections: ToolDetailSection[];
  terminal?: "bash" | "eval";
  sessionId?: string;
}>();
defineEmits<{ close: [] }>();
const evalState = ref<EvalRuntimeState>();
const terminalLines = computed(() => {
  if (props.terminal === "eval" && evalState.value?.history.length) {
    return evalState.value.history.flatMap((entry) => [
      `\x1b[36m[${entry.language}]\x1b[0m ${entry.code}`,
      entry.output,
    ]);
  }
  return props.sections.flatMap((section) => [
    `\x1b[90m# ${section.label}\x1b[0m`,
    section.content,
  ]);
});
const terminalPrompt = computed(() =>
  props.terminal === "bash" ? "$ output complete" : ">>> kernel ready",
);
let poll: ReturnType<typeof setInterval> | undefined;
async function refreshEvalState() {
  if (props.terminal === "eval" && props.sessionId)
    evalState.value = await getSessionEvalState(props.sessionId).catch(() => undefined);
}
onMounted(() => {
  void refreshEvalState();
  if (props.terminal === "eval") poll = setInterval(refreshEvalState, 1000);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});
</script>

<style scoped>
.tool-detail-panel {
  width: min(48%, 44rem);
  min-width: 22rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--app-border-subtle);
  background: var(--app-popup-bg);
}
header {
  height: 3.5rem;
  flex: none;
  padding: 0 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--app-border-subtle);
  color: var(--app-text-primary);
}
header button {
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 0.35rem;
  color: var(--app-text-muted);
}
header button:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
header svg {
  width: 1.1rem;
  height: 1.1rem;
}
.tool-detail-panel__body {
  overflow: auto;
  padding: 1rem;
  display: grid;
  gap: 1rem;
}
section label {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.7rem;
  color: var(--app-text-muted);
}
pre {
  white-space: pre-wrap;
  word-break: break-word;
  padding: 0.75rem;
  border-radius: 0.4rem;
  background: var(--app-code-bg);
  color: var(--app-code-text);
  font-size: 0.75rem;
}
@media (max-width: 767px) {
  .tool-detail-panel {
    position: absolute;
    inset: 0;
    z-index: 60;
    width: 100%;
    min-width: 0;
  }
}
</style>
