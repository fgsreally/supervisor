<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="extension-dialog-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      @click.self="emit('close')"
    >
      <section class="extension-dialog w-full max-w-xl rounded-lg border shadow-xl" role="dialog">
        <header class="h-14 px-5 border-b flex items-center gap-2">
          <h2 class="text-[16px] font-medium flex-1">安装扩展</h2>
          <button type="button" class="extension-dialog-close" title="关闭" @click="emit('close')">
            <X class="w-5 h-5" />
          </button>
        </header>
        <div class="p-5">
          <ExtensionInstallBox
            class="extension-dialog-box"
            @installed="onInstalled"
            @uninstalled="onUninstalled"
          />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
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
.extension-dialog-overlay {
  background: color-mix(in srgb, #000 45%, transparent);
}
.extension-dialog {
  background: var(--app-settings-card, var(--app-bg));
  border-color: var(--app-border);
  color: var(--app-text-primary);
}
.extension-dialog header {
  border-color: var(--app-border);
}
.extension-dialog-close {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-text-secondary);
}
.extension-dialog-close:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
.extension-dialog-box {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
</style>
