<template>
  <span
    class="workflow-stage-tag inline-flex items-center rounded-full font-medium shrink-0"
    :class="compact ? 'gap-1 px-1.5 py-0.5 text-[10px]' : 'gap-1.5 px-2 py-1 text-[11px]'"
    :title="`工作流模式 · ${label}`"
  >
    <GitBranch :class="compact ? 'w-3 h-3' : 'w-3.5 h-3.5'" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { GitBranch } from "lucide-vue-next";
import { workflowStageLabel, type WorkflowState } from "@/utils/workflow";

const props = defineProps<{
  workflow: WorkflowState;
  compact?: boolean;
}>();

const label = computed(() => workflowStageLabel(props.workflow.stage));
</script>

<style scoped>
.workflow-stage-tag {
  color: #5b21b6;
  background: #ede9fe;
  border: 1px solid #ddd6fe;
  line-height: 1;
}

:global([data-theme="dark"]) .workflow-stage-tag {
  color: #ddd6fe;
  background: rgb(91 33 182 / 35%);
  border-color: rgb(196 181 253 / 35%);
}
</style>
