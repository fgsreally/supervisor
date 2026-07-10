<template>
  <button
    v-for="(opt, index) in question.options"
    :key="opt.value"
    type="button"
    class="ask-option"
    :class="{
      'ask-option--selected': selectedValue === opt.value,
      'ask-option--last': index === question.options.length - 1,
    }"
    :disabled="disabled"
    role="radio"
    :aria-checked="selectedValue === opt.value"
    @click="emit('select', opt)"
  >
    <span class="ask-option__body">
      <span class="ask-option__label">{{ opt.label }}</span>
      <span v-if="opt.description" class="ask-option__desc">{{ opt.description }}</span>
    </span>
    <span class="ask-option__radio" aria-hidden="true">
      <span v-if="selectedValue === opt.value" class="ask-option__radio-dot" />
    </span>
  </button>
</template>

<script setup lang="ts">
import type { AskOption } from '@/utils/ask-tool'

defineProps<{
  question: { options: AskOption[] }
  selectedValue?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [option: AskOption] }>()
</script>

<style scoped>
.ask-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 9px 12px;
  border: none;
  border-bottom: 1px solid var(--ask-option-divider, rgba(0, 0, 0, 0.06));
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;
}

.ask-option--last {
  border-bottom: none;
}

.ask-option:hover:not(:disabled) {
  background: var(--ask-option-hover, rgba(0, 0, 0, 0.03));
}

.ask-option--selected {
  background: var(--ask-option-selected-bg, rgba(7, 193, 96, 0.08));
}

.ask-option:active:not(:disabled) {
  background: var(--ask-option-active, rgba(0, 0, 0, 0.05));
}

.ask-option:disabled {
  cursor: default;
  opacity: 0.85;
}

.ask-option__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ask-option__label {
  font-size: 12px;
  line-height: 1.35;
  color: var(--app-text-primary);
}

.ask-option__desc {
  font-size: 11px;
  line-height: 1.35;
  color: var(--app-text-muted);
}

.ask-option__radio {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--ask-radio-border, #c8c8c8);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.12s, background-color 0.12s;
}

.ask-option--selected .ask-option__radio {
  border-color: var(--app-accent, #07c160);
  background: var(--app-accent, #07c160);
}

.ask-option__radio-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
}
</style>
