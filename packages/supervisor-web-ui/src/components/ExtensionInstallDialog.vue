<template>
  <ResponsiveDialog
    :open="open"
    title="安装扩展"
    width="md"
    size="auto"
    @close="emit('close')"
  >
    <div class="extension-dialog__body">
      <ExtensionInstallBox
        class="extension-dialog__box"
        @installed="onInstalled"
        @uninstalled="onUninstalled"
      />
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from "@/components/ui/ResponsiveDialog.vue";
import ExtensionInstallBox from "./ExtensionInstallBox.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  installed: [id: string];
  uninstalled: [id: string];
}>();

function onInstalled(id: string) {
  emit("installed", id);
  emit("close");
}

function onUninstalled(id: string) {
  emit("uninstalled", id);
}
</script>

<style scoped>
.extension-dialog__body {
  padding: 16px 20px 20px;
}

.extension-dialog__box {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
</style>
