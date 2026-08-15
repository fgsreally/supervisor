<template>
  <Teleport to="body">
    <div
      class="tool-approval-overlay fixed inset-0 z-[120] flex items-center justify-center p-4"
      :class="{ 'tool-approval-overlay--plan': approval.kind === 'plan_review' }"
    >
      <section class="tool-approval-dialog w-full max-w-lg rounded-lg border shadow-xl">
        <header class="px-5 py-4 border-b">
          <h2 class="text-[16px] font-medium">{{ approval.title }}</h2>
        </header>
        <pre
          v-if="approval.kind !== 'plan_review'"
          class="tool-approval-body px-5 py-4 text-[13px] whitespace-pre-wrap break-all"
          >{{ approval.body }}</pre>
        <div v-else class="px-5 py-4">
          <p class="tool-approval-body mb-3 text-[13px]">
            Plan 已完成，打开右侧分屏查看完整内容后决定是否执行。
          </p>
          <button
            type="button"
            class="tool-approval-view-plan rounded-md border px-3 py-2 text-[13px]"
            @click="emit('view-plan')"
          >
            分屏查看 Plan
          </button>
        </div>
        <div v-if="approval.actions.includes('revise')" class="px-5 pb-4">
          <textarea
            v-model="feedback"
            rows="3"
            class="tool-approval-feedback w-full rounded-md border p-3 text-[13px] resize-y"
            placeholder="请输入修改意见"
          />
        </div>
        <footer class="px-5 py-3 border-t flex flex-wrap justify-end gap-2">
          <UiActionButton
            v-if="approval.actions.includes('reject')"
            variant="danger"
            :loading="submitting === 'reject'"
            :disabled="submitting !== null"
            @click="resolve('reject')"
          >
            拒绝
          </UiActionButton>
          <UiActionButton
            v-if="approval.actions.includes('approve')"
            variant="secondary"
            :loading="submitting === 'approve'"
            :disabled="submitting !== null"
            @click="resolve('approve')"
          >
            允许一次
          </UiActionButton>
          <UiActionButton
            v-if="approval.actions.includes('revise')"
            variant="secondary"
            :loading="submitting === 'revise'"
            :disabled="submitting !== null || !feedback.trim()"
            @click="resolve('revise')"
          >
            要求修改
          </UiActionButton>
          <UiActionButton
            v-if="approval.actions.includes('approve_session')"
            :loading="submitting === 'approve_session'"
            :disabled="submitting !== null"
            @click="resolve('approve_session')"
          >
            本 Session 允许
          </UiActionButton>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from "vue";
import * as api from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import UiActionButton from "@/components/base/UiActionButton.vue";

const props = defineProps<{ sessionId: string; approval: api.ApprovalPendingEvent }>();
const emit = defineEmits<{ resolved: []; "view-plan": [] }>();
const submitting = ref<"approve" | "approve_session" | "reject" | "revise" | null>(null);
const feedback = ref("");

async function resolve(action: "approve" | "approve_session" | "reject" | "revise") {
  if (submitting.value) return;
  submitting.value = action;
  try {
    await api.resolveSessionApproval(
      props.sessionId,
      props.approval.approvalId,
      action === "revise" ? { action, feedback: feedback.value.trim() } : { action },
    );
    emit("resolved");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "审批提交失败", "error");
  } finally {
    submitting.value = null;
  }
}
</script>

<style scoped>
.tool-approval-overlay {
  background: rgb(0 0 0 / 42%);
}
.tool-approval-overlay--plan {
  align-items: flex-end;
  justify-content: flex-start;
  pointer-events: none;
  background: transparent;
}
.tool-approval-overlay--plan .tool-approval-dialog {
  margin: 0 0 84px 18px;
  pointer-events: auto;
  box-shadow: 0 12px 36px rgb(0 0 0 / 28%);
}
.tool-approval-view-plan {
  border-color: var(--app-border);
  color: var(--app-accent);
}
.tool-approval-view-plan:hover {
  background: var(--app-hover);
}
.tool-approval-dialog,
.tool-approval-dialog header,
.tool-approval-dialog footer {
  background: var(--app-settings-card);
  border-color: var(--app-border);
  color: var(--app-text-primary);
}
.tool-approval-body {
  color: var(--app-text-secondary);
}
.tool-approval-feedback {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
  color: var(--app-text-primary);
}
</style>
