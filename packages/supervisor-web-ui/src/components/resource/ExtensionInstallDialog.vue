<template>
  <ResponsiveDialog :open="open" :title="t('resource.installExtension')" width="md" size="auto" @close="emit('close')">
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
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import ExtensionInstallBox from "./ExtensionInstallBox.vue";
import { useI18n } from "@/i18n";

defineProps<{ open: boolean }>();
const { t } = useI18n();
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
