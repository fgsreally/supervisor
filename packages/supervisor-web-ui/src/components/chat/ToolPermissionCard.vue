<template>
  <section class="tool-permission-card">
    <header class="tool-permission-card__header">
      <ShieldAlert class="w-5 h-5 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="tool-permission-card__title">{{ approval.title }}</div>
        <pre v-if="approval.body" class="tool-permission-card__body">{{ approval.body }}</pre>
        <div class="tool-permission-card__source">权限审批</div>
      </div>
    </header>

    <div class="tool-permission-card__actions">
      <button
        v-if="approval.actions.includes('reject')"
        type="button"
        class="tool-permission-card__deny"
        :disabled="submitting !== null"
        @click="resolve('reject')"
      >
        拒绝
      </button>
      <button
        v-if="approval.actions.includes('approve_session')"
        type="button"
        class="tool-permission-card__secondary"
        :disabled="submitting !== null"
        @click="resolve('approve_session')"
      >
        本次会话允许
      </button>
      <button
        v-if="approval.actions.includes('approve')"
        type="button"
        class="tool-permission-card__primary"
        :disabled="submitting !== null"
        @click="resolve('approve')"
      >
        仅本次允许
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ShieldAlert } from "lucide-vue-next";
import * as api from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";

const props = defineProps<{
  sessionId: string;
  approval: api.ApprovalPendingEvent;
}>();
const emit = defineEmits<{ resolved: [] }>();
const submitting = ref<"approve" | "approve_session" | "reject" | null>(null);

async function resolve(action: "approve" | "approve_session" | "reject") {
  if (submitting.value) return;
  submitting.value = action;
  try {
    await api.resolveSessionApproval(props.sessionId, props.approval.approvalId, { action });
    emit("resolved");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "审批提交失败", "error");
  } finally {
    submitting.value = null;
  }
}
</script>

<style scoped>
.tool-permission-card {
  max-width: 720px;
  margin: 8px 12px 4px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}

.tool-permission-card__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tool-permission-card__title {
  font-size: 14px;
  font-weight: 600;
}

.tool-permission-card__body {
  margin: 6px 0 0;
  overflow: hidden;
  color: var(--app-text-primary);
  font:
    12px/1.5 ui-monospace,
    SFMono-Regular,
    Menlo,
    Consolas,
    monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-permission-card__source {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 11px;
}

.tool-permission-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.tool-permission-card__deny,
.tool-permission-card__secondary,
.tool-permission-card__primary {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.tool-permission-card__deny:disabled,
.tool-permission-card__secondary:disabled,
.tool-permission-card__primary:disabled {
  opacity: 0.55;
  cursor: wait;
}

.tool-permission-card__deny {
  border: 1px solid color-mix(in srgb, #fa5151 45%, var(--app-border));
  color: #fa5151;
  background: transparent;
}

.tool-permission-card__secondary {
  border: 1px solid var(--app-border);
  color: var(--app-text-primary);
  background: transparent;
}

.tool-permission-card__primary {
  border: 0;
  color: #fff;
  background: #07c160;
}

@media (min-width: 768px) {
  .tool-permission-card {
    margin-inline: max(12px, calc((100% - var(--chat-conversation-max-width, 880px)) / 2));
  }
}
</style>
