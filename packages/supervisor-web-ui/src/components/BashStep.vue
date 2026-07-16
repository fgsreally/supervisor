<template>
  <div class="bash-step" :class="statusClass">
    <div
      class="bash-step__inner"
      :class="{ 'bash-step__inner--clickable': clickable }"
      :role="clickable ? 'button' : undefined"
      :tabindex="clickable ? 0 : undefined"
      @click="clickable && $emit('open')"
      @keydown.enter="clickable && $emit('open')"
    >
      <Terminal class="bash-step__icon" />
      <span class="bash-step__label">{{ displayText }}</span>
      <Loader2 v-if="pending" class="bash-step__status animate-spin" />
      <Eye v-else-if="clickable" class="bash-step__status" title="查看输出" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Terminal, Eye, Loader2 } from "lucide-vue-next";

const props = defineProps<{
  command: string;
  intent?: string;
  resultContent?: Array<{ type: string; text: string }>;
  pending?: boolean;
  isError?: boolean;
}>();

defineEmits<{ open: [] }>();

const hasResult = computed(() => !!props.resultContent?.length);
const clickable = computed(() => hasResult.value && !props.pending);

const statusClass = computed(() => {
  if (props.pending || !hasResult.value) return "bash-step--pending";
  if (props.isError) return "bash-step--error";
  return "bash-step--done";
});

const displayText = computed(() => props.intent?.trim() || props.command);
</script>

<style scoped>
.bash-step {
  display: inline-block;
  align-self: flex-start;
  max-width: 100%;
  width: fit-content;
  border-radius: 6px;
  border: 1px solid #374151;
  overflow: hidden;
  font-size: 12px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.bash-step--pending {
  border-color: #eab308;
}

.bash-step--done {
  border-color: #22c55e;
}

.bash-step--error {
  border-color: #ef4444;
}

.bash-step__inner {
  display: inline-flex;
  width: auto;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  text-align: left;
  background: #2d2d2d;
  color: #f3f4f6;
  transition: background-color 0.15s;
}

.bash-step__inner--clickable {
  cursor: pointer;
}

.bash-step__inner--clickable:hover {
  background: #383838;
}

.bash-step__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.bash-step--pending .bash-step__icon,
.bash-step--pending .bash-step__status {
  color: #eab308;
}

.bash-step--done .bash-step__icon,
.bash-step--done .bash-step__status {
  color: #4ade80;
}

.bash-step--error .bash-step__icon,
.bash-step--error .bash-step__status {
  color: #f87171;
}

.bash-step__label {
  min-width: 0;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.375;
  color: #e5e7eb;
  white-space: normal;
  word-break: break-word;
}

.bash-step__status {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}
</style>
