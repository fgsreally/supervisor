<template>
  <div class="thinking-block">
    <button type="button" class="thinking-block__toggle" @click="expanded = !expanded">
      <Brain class="thinking-block__icon" />
      <span class="thinking-block__preview">{{ preview }}</span>
      <ChevronDown class="thinking-block__chevron" :class="{ 'thinking-block__chevron--open': expanded }" />
    </button>
    <div v-if="expanded" class="thinking-block__body">
      <p class="thinking-block__text">{{ content + (streaming ? '▍' : '') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Brain, ChevronDown } from 'lucide-vue-next'

const props = defineProps<{
  content: string
  streaming?: boolean
}>()

const expanded = ref(false)

const preview = computed(() => {
  const oneLine = props.content.replace(/\s+/g, ' ').trim()
  if (!oneLine) return props.streaming ? '思考中…' : '…'
  return oneLine.length > 56 ? `${oneLine.slice(0, 53)}…` : oneLine
})
</script>

<style scoped>
.thinking-block {
  align-self: flex-start;
  max-width: 100%;
  border-radius: 6px;
  border: 1px solid var(--app-border);
  border-left: 3px solid #a78bfa;
  background: color-mix(in srgb, #a78bfa 6%, var(--app-bubble-assistant));
  overflow: hidden;
}

.thinking-block__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  text-align: left;
  cursor: pointer;
  color: var(--app-text-secondary);
}

.thinking-block__toggle:hover {
  background: var(--app-hover);
}

.thinking-block__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
  color: #a78bfa;
}

.thinking-block__preview {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-style: italic;
  color: var(--app-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thinking-block__chevron {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
  color: var(--app-text-muted);
  transition: transform 0.15s ease;
}

.thinking-block__chevron--open {
  transform: rotate(180deg);
}

.thinking-block__body {
  padding: 0 0.75rem 0.65rem;
  border-top: 1px solid var(--app-border-subtle);
}

.thinking-block__text {
  margin: 0.5rem 0 0;
  font-size: 13px;
  line-height: 1.5;
  font-style: italic;
  color: var(--app-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
