<template>
  <ResponsiveDialog
    :open="open"
    title="粘贴文本"
    :description="`${chars} 字`"
    width="xl"
    size="tall"
    body-class="pasted-text-dialog__body"
    @close="emit('close')"
  >
    <div class="pasted-text-dialog">
      <div v-if="loading" class="pasted-text-dialog__loading">正在读取……</div>
      <pre v-else class="pasted-text-dialog__content">{{ text }}</pre>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";

defineProps<{
  open: boolean;
  text: string;
  chars: number;
  loading?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<style>
.pasted-text-dialog__body {
  min-height: 0;
}

.pasted-text-dialog {
  min-height: 0;
  height: 100%;
}

.pasted-text-dialog__content {
  max-height: min(70vh, 46rem);
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--app-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--app-font-body);
  line-height: 1.55;
}

.pasted-text-dialog__loading {
  color: var(--app-text-secondary);
  font-size: var(--app-font-body);
}
</style>
