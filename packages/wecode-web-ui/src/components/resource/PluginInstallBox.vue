<template>
  <div class="plugin-install-box mt-2 pt-2 border-t border-[var(--app-border-subtle)]">
    <div class="text-[10px] font-medium mb-1.5 plugin-install-box__label">{{ t("resource.pluginInstallManage") }}</div>
    <input
      v-model="source"
      type="text"
      class="plugin-install-box__input w-full px-2 py-1 text-[12px] rounded border bg-transparent"
      placeholder="npm:pkg | git+url | /local/path"
      :disabled="installing"
      @keyup.enter="install"
    />
    <button
      type="button"
      class="plugin-install-box__btn mt-1.5 w-full px-2 py-1 rounded text-[12px] border"
      :disabled="installing || !source.trim()"
      @click="install"
    >
      {{ installing ? t("resource.installing") : t("resource.installToGlobal") }}
    </button>

    <div v-if="installError" class="plugin-install-box__error mt-1.5 text-[11px]">
      {{ installError }}
    </div>

    <ul
      v-if="installed.length"
      class="mt-2 flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar"
    >
      <li
        v-for="item in installed"
        :key="item.id"
        class="flex items-center gap-1 px-2 py-1 rounded text-[11px] plugin-install-box__item"
      >
        <span class="flex-1 truncate" :title="item.id">{{ item.name ?? item.id }}</span>
        <button
          type="button"
          class="text-[10px] px-1.5 py-0.5 rounded border"
          :disabled="uninstallingId === item.id"
          @click="uninstall(item.id)"
        >
          {{ uninstallingId === item.id ? t("common.loading") : t("resource.uninstall") }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  installPlugin,
  listPlugins,
  uninstallPlugin,
  type PluginInstallResult,
  type PluginResourceInfo,
} from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";

const emit = defineEmits<{
  installed: [id: string];
  uninstalled: [id: string];
}>();
const { t } = useI18n();

const source = ref("");
const installing = ref(false);
const installError = ref<string | null>(null);
const uninstallingId = ref<string | null>(null);
const installed = ref<PluginResourceInfo[]>([]);

onMounted(refresh);

async function refresh() {
  try {
    installed.value = await listPlugins();
  } catch (err) {
    installError.value = err instanceof Error ? err.message : String(err);
  }
}

async function install() {
  const s = source.value.trim();
  if (!s) return;
  installing.value = true;
  installError.value = null;
  try {
    const result: PluginInstallResult = await installPlugin(s);
    source.value = "";
    await refresh();
    showUiMessage(t("resource.pluginInstalled", { id: result.id }), "success");
    emit("installed", result.id);
  } catch (err) {
    installError.value = err instanceof Error ? err.message : String(err);
  } finally {
    installing.value = false;
  }
}

async function uninstall(id: string) {
  uninstallingId.value = id;
  try {
    await uninstallPlugin(id);
    await refresh();
    showUiMessage(t("resource.pluginUninstalled", { id }), "success");
    emit("uninstalled", id);
  } catch (err) {
    installError.value = err instanceof Error ? err.message : String(err);
  } finally {
    uninstallingId.value = null;
  }
}
</script>

<style scoped>
.plugin-install-box__label {
  color: var(--app-text-muted);
}

.plugin-install-box__input,
.plugin-install-box__btn {
  background: var(--app-input-bg, var(--app-bg));
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.plugin-install-box__btn {
  background: var(--app-accent);
  color: var(--app-button-text, #fff);
  border-color: var(--app-accent);
}

.plugin-install-box__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.plugin-install-box__error {
  color: var(--app-error, #d33);
}

.plugin-install-box__item {
  background: color-mix(in srgb, var(--app-accent) 5%, transparent);
  border: 1px solid var(--app-border-subtle);
}
</style>
