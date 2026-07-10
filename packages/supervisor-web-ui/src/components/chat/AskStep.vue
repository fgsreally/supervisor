<template>
  <div class="ask-step" :class="{ 'ask-step--pending': showPending }">
    <template v-if="showPending && questions.length">
      <div v-for="q in questions" :key="q.id" class="ask-step__block">
        <p class="ask-step__prompt">{{ q.prompt }}</p>
        <p class="ask-step__meta">单选</p>
        <div class="ask-step__list" role="radiogroup" :aria-label="q.prompt">
          <AskStepOption
            :question="q"
            :selected-value="selections[q.id]"
            :disabled="submitting"
            @select="(opt) => onSelect(q.id, opt)"
          />
        </div>
      </div>
      <button
        type="button"
        class="ask-step__confirm"
        :disabled="!canConfirm || submitting"
        @click="submitAnswers"
      >
        {{ submitting ? '提交中…' : '确认' }}
      </button>
    </template>

    <ToolActivityBar
      v-else-if="showDoneBar"
      tool-name="ask"
      :call-args="callArgs"
      :result-content="resultContent"
      :pending="false"
      :is-error="isError"
    />

    <p v-else-if="isError" class="ask-step__muted">提问失败</p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AskStepOption from './AskStepOption.vue'
import ToolActivityBar from '../ToolActivityBar.vue'
import {
  parseAskQuestions,
  type AskOption,
} from '@/utils/ask-tool'
import * as api from '@/api'

const props = defineProps<{
  sessionId: string
  toolCallId: string
  callArgs?: Record<string, unknown>
  resultContent?: Array<{ type: string; text: string }>
  pending?: boolean
  isError?: boolean
}>()

const emit = defineEmits<{ answered: [] }>()

const submitting = ref(false)
const selections = reactive<Record<string, string>>({})
const selectionLabels = reactive<Record<string, string>>({})

const questions = computed(() => parseAskQuestions(props.callArgs))

const showPending = computed(
  () =>
    !!props.pending ||
    (questions.value.length > 0 && !props.resultContent?.length && !props.isError),
)

const showDoneBar = computed(
  () => !showPending.value && !!props.resultContent?.length && !props.isError,
)

const allAnswered = computed(() =>
  questions.value.length > 0 && questions.value.every((q) => !!selections[q.id]),
)

const canConfirm = computed(() => {
  if (questions.value.length === 1) {
    return !!selections[questions.value[0]!.id]
  }
  return allAnswered.value
})

async function submitAnswers() {
  if (submitting.value || !showPending.value || !canConfirm.value) return
  submitting.value = true
  try {
    const answers = questions.value.map((q) => ({
      id: q.id,
      value: selections[q.id],
      label: selectionLabels[q.id] ?? selections[q.id],
    }))
    await api.submitAskAnswer(props.sessionId, props.toolCallId, answers)
    emit('answered')
  } catch (err) {
    console.error('ask answer failed:', err)
  } finally {
    submitting.value = false
  }
}

function onSelect(questionId: string, option: AskOption) {
  if (submitting.value || !showPending.value) return
  selections[questionId] = option.value
  selectionLabels[questionId] = option.label
}
</script>

<style scoped>
.ask-step {
  width: 100%;
  min-width: min(100%, 240px);
}

.ask-step--pending {
  max-width: 100%;
}

.ask-step__block + .ask-step__block {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--app-border-subtle, rgba(0, 0, 0, 0.06));
}

.ask-step__prompt {
  margin: 0 0 2px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--app-text-primary);
}

.ask-step__meta {
  margin: 0 0 6px;
  font-size: 10px;
  line-height: 1.3;
  color: var(--app-text-muted);
}

.ask-step__list {
  --ask-option-divider: rgba(0, 0, 0, 0.06);
  --ask-option-hover: rgba(0, 0, 0, 0.03);
  --ask-option-selected-bg: rgba(7, 193, 96, 0.08);
  --ask-option-active: rgba(0, 0, 0, 0.05);
  --ask-radio-border: #c8c8c8;
  border-radius: 6px;
  overflow: hidden;
  background: var(--ask-list-bg, #fff);
  border: 1px solid var(--ask-list-border, rgba(0, 0, 0, 0.06));
}

.ask-step__confirm {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 7px 12px;
  border: none;
  border-radius: 6px;
  background: var(--app-accent, #07c160);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
  cursor: pointer;
  transition: opacity 0.15s, filter 0.15s;
}

.ask-step__confirm:hover:not(:disabled) {
  filter: brightness(0.96);
}

.ask-step__confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ask-step__muted {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-muted);
  font-style: italic;
}
</style>

<style>
[data-theme='dark'] .ask-step__list {
  --ask-list-bg: var(--app-settings-card, #2a2a2a);
  --ask-list-border: var(--app-border, #383838);
  --ask-option-divider: var(--app-border, #383838);
  --ask-option-hover: rgba(255, 255, 255, 0.04);
  --ask-option-selected-bg: rgba(7, 193, 96, 0.12);
  --ask-option-active: rgba(255, 255, 255, 0.06);
  --ask-radio-border: #666;
}
</style>
