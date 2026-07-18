<template>
  <section class="external-interaction" :class="`external-interaction--${kind}`">
    <header class="external-interaction__header">
      <ShieldAlert v-if="kind === 'approval'" class="w-5 h-5" />
      <MessageCircleQuestion v-else class="w-5 h-5" />
      <div class="min-w-0">
        <div class="external-interaction__title">{{ title }}</div>
        <div class="external-interaction__source">{{ backendLabel }}</div>
      </div>
    </header>

    <div v-if="detail" class="external-interaction__detail">{{ detail }}</div>
    <details v-if="requestJson" class="external-interaction__request">
      <summary>查看请求详情</summary>
      <pre>{{ requestJson }}</pre>
    </details>

    <template v-if="kind === 'question' && pending">
      <div v-for="question in questions" :key="question.id" class="external-interaction__question">
        <div class="external-interaction__prompt">{{ question.question }}</div>
        <button
          v-for="option in question.options ?? []"
          :key="option.label"
          type="button"
          class="external-interaction__option"
          :class="{ 'external-interaction__option--active': answers[question.id] === option.label }"
          @click="answers[question.id] = option.label"
        >
          <span>{{ option.label }}</span>
          <small>{{ option.description }}</small>
        </button>
        <input
          v-if="!question.options?.length || question.isOther"
          v-model="answers[question.id]"
          :type="question.isSecret ? 'password' : 'text'"
          class="external-interaction__input"
          :placeholder="question.isSecret ? '输入敏感信息' : '输入回答'"
        />
      </div>
      <button
        type="button"
        class="external-interaction__primary"
        :disabled="submitting || !canSubmitAnswers"
        @click="submitAnswers"
      >
        提交回答
      </button>
    </template>

    <div v-else-if="kind === 'approval' && pending" class="external-interaction__actions">
      <button
        type="button"
        class="external-interaction__deny"
        :disabled="submitting"
        @click="decide('deny')"
      >
        拒绝
      </button>
      <button
        type="button"
        class="external-interaction__secondary"
        :disabled="submitting"
        @click="decide('approve_session')"
      >
        本次会话允许
      </button>
      <button
        type="button"
        class="external-interaction__primary"
        :disabled="submitting"
        @click="decide('approve')"
      >
        仅本次允许
      </button>
    </div>

    <div v-else class="external-interaction__resolved">{{ resultLabel }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { MessageCircleQuestion, ShieldAlert } from "lucide-vue-next";
import { respondToExternalInteraction, type ExternalInteractionResponse } from "@/api";

interface QuestionOption {
  label: string;
  description?: string;
}
interface Question {
  id: string;
  question: string;
  options?: QuestionOption[] | null;
  isOther?: boolean;
  isSecret?: boolean;
}

const props = defineProps<{
  sessionId: string;
  args?: Record<string, unknown>;
  result?: Array<{ type: string; text: string }>;
  pending?: boolean;
}>();
const emit = defineEmits<{ resolved: [] }>();
const submitting = ref(false);
const answers = reactive<Record<string, string>>({});

const interactionId = computed(() => String(props.args?.interactionId ?? ""));
const kind = computed(() => (props.args?.kind === "question" ? "question" : "approval"));
const title = computed(() => String(props.args?.title ?? "外部 Agent 请求交互"));
const detail = computed(() => String(props.args?.detail ?? ""));
const backendLabel = computed(() => String(props.args?.backend ?? "external").toUpperCase());
const questions = computed(
  () => (Array.isArray(props.args?.questions) ? props.args.questions : []) as Question[],
);
const requestJson = computed(() => {
  const request = props.args?.request;
  if (!request || typeof request !== "object") return "";
  try {
    return JSON.stringify(request, null, 2);
  } catch {
    return String(request);
  }
});
const canSubmitAnswers = computed(() =>
  questions.value.every((question) => Boolean(answers[question.id])),
);
const resultLabel = computed(() => {
  const text = props.result?.find((item) => item.type === "text")?.text ?? "";
  if (text.includes("approve")) return "已允许";
  if (text.includes("answer")) return "已回答";
  return text ? "已处理" : "等待外部 Agent 继续";
});

async function respond(response: ExternalInteractionResponse) {
  if (!interactionId.value || submitting.value) return;
  submitting.value = true;
  try {
    await respondToExternalInteraction(props.sessionId, interactionId.value, response);
    emit("resolved");
  } finally {
    submitting.value = false;
  }
}

function decide(action: "approve" | "approve_session" | "deny") {
  void respond({ action });
}

function submitAnswers() {
  void respond({
    action: "answer",
    answers: Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, [answer]])),
  });
}
</script>

<style scoped>
.external-interaction {
  max-width: 720px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}
.external-interaction__header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.external-interaction__title {
  font-size: 14px;
  font-weight: 600;
}
.external-interaction__source,
.external-interaction__resolved {
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-text-secondary);
}
.external-interaction__detail {
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
  background: var(--app-hover);
  font:
    12px/1.6 ui-monospace,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.external-interaction__request {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 12px;
}
.external-interaction__request summary {
  cursor: pointer;
}
.external-interaction__request pre {
  max-height: 240px;
  margin-top: 8px;
  padding: 10px;
  overflow: auto;
  border-radius: 6px;
  background: var(--app-hover);
  color: var(--app-text-primary);
  font:
    12px/1.5 ui-monospace,
    monospace;
  white-space: pre-wrap;
}
.external-interaction__question {
  margin-top: 14px;
}
.external-interaction__prompt {
  margin-bottom: 8px;
  font-size: 13px;
}
.external-interaction__option {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 10px;
  text-align: left;
  border-top: 1px solid var(--app-border);
}
.external-interaction__option small {
  color: var(--app-text-secondary);
}
.external-interaction__option--active {
  background: rgba(7, 193, 96, 0.1);
  color: #07c160;
}
.external-interaction__input {
  width: 100%;
  margin-top: 8px;
  padding: 9px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-chat-bg);
  color: var(--app-text-primary);
  outline: none;
}
.external-interaction__input:focus {
  border-color: #07c160;
}
.external-interaction__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.external-interaction__actions button,
.external-interaction__primary {
  min-height: 34px;
  padding: 0 13px;
  border-radius: 6px;
  font-size: 13px;
}
.external-interaction__deny,
.external-interaction__secondary {
  border: 1px solid var(--app-border);
}
.external-interaction__primary {
  margin-top: 12px;
  background: #07c160;
  color: white;
}
.external-interaction__actions .external-interaction__primary {
  margin-top: 0;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
