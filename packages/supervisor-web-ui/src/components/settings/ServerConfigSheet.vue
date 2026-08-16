<template>
  <SheetDrawer
    :open="open"
    :ariaLabel="editingId ? t('mobile.editServer') : t('mobile.addServer')"
    :title="editingId ? t('mobile.editServer') : t('mobile.addServer')"
    size="auto"
    :resizable="false"
    show-footer
    @close="open = false"
  >
    <div class="mobile-server-config">
      <label class="m-field">
        <span class="m-field__label">{{ t("mobile.serverAddress") }}</span>
        <input
          v-model="serverUrl"
          class="m-input"
          placeholder="https://..."
          autocomplete="url"
        />
        <span class="m-field__help">{{ t("mobile.serverAddressHint") }}</span>
      </label>
      <label class="m-field">
        <span class="m-field__label">{{ t("mobile.displayName") }}</span>
        <input
          v-model="serverName"
          class="m-input"
          :placeholder="t('mobile.homeComputer')"
        />
        <span class="m-field__help">{{ t("mobile.displayNameHint") }}</span>
      </label>
      <label class="m-field">
        <span class="m-field__label">{{ t("mobile.accessPin") }}</span>
        <input
          v-model="serverPin"
          class="m-input"
          type="password"
          inputmode="numeric"
          maxlength="6"
        />
        <span class="m-field__help">{{ t("mobile.accessPinHint") }}</span>
      </label>
      <label class="m-field">
        <span class="m-field__label">{{ t("mobile.backgroundConnection") }}</span>
        <button
          type="button"
          class="m-switch"
          :class="{ 'm-switch--checked': backgroundEnabled }"
          role="switch"
          :aria-checked="backgroundEnabled"
          @click="backgroundEnabled = !backgroundEnabled"
        >
          <span class="m-switch__track"><span class="m-switch__thumb" /></span>
        </button>
        <span class="m-field__help">{{ t("mobile.backgroundConnectionHint") }}</span>
      </label>
      <div class="mobile-server-config__actions">
        <UiActionButton variant="secondary" @click="open = false">{{
          t("common.cancel")
        }}</UiActionButton>
        <UiActionButton variant="primary" :loading="testing" @click="save">
          {{ t("mobile.saveAndConnect") }}
        </UiActionButton>
      </div>
    </div>
  </SheetDrawer>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import * as api from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import {
  displayNameForUrl,
  getActiveSupervisorInstance,
  isBackgroundConnectionEnabled,
  listSupervisorInstances,
  setBackgroundConnectionEnabled,
  upsertSupervisorInstance,
} from "@/utils/mobile-server-config";
import { startBackgroundConnection, stopBackgroundConnection } from "@/composables/use-live-status";
import SheetDrawer from "@/components/base/SheetDrawer.vue";
import UiActionButton from "@/components/base/UiActionButton.vue";
import { useI18n } from "@/i18n";

const open = defineModel<boolean>("open", { default: false });
const { t } = useI18n();

const props = defineProps<{
  initialUrl?: string;
  initialPin?: string;
  editingId?: string;
}>();

const emit = defineEmits<{ saved: [] }>();

const serverUrl = ref("");
const serverName = ref("");
const serverPin = ref("");
const backgroundEnabled = ref(isBackgroundConnectionEnabled());
const testing = ref(false);

watch(open, (visible) => {
  if (!visible) return;
  if (props.editingId) {
    const editing = listSupervisorInstances().find((item) => item.id === props.editingId) ?? null;
    serverUrl.value = props.initialUrl || editing?.url || "";
    serverPin.value = props.initialPin || editing?.pin || "";
    serverName.value = editing?.name || displayNameForUrl(serverUrl.value);
  } else if (props.initialUrl) {
    serverUrl.value = props.initialUrl;
    serverPin.value = props.initialPin || "";
    serverName.value = displayNameForUrl(props.initialUrl);
  } else {
    const active = getActiveSupervisorInstance();
    serverUrl.value = active?.url ?? "";
    serverPin.value = active?.pin ?? "";
    serverName.value = active?.name || (active ? displayNameForUrl(active.url) : "");
  }
  backgroundEnabled.value = isBackgroundConnectionEnabled();
});

async function save() {
  const url = serverUrl.value.trim().replace(/\/+$/, "");
  const pin = serverPin.value.trim();
  const name = serverName.value.trim() || displayNameForUrl(url);
  if (!url) {
    showUiMessage(t("mobile.serverAddressRequired"), "error");
    return;
  }
  if (!pin) {
    showUiMessage(t("mobile.accessPinRequired"), "error");
    return;
  }
  testing.value = true;
  try {
    upsertSupervisorInstance({
      id: props.editingId,
      name,
      url,
      pin,
      activate: true,
    });
    setBackgroundConnectionEnabled(backgroundEnabled.value);
    await api.healthCheck();
    if (backgroundEnabled.value) {
      await startBackgroundConnection("Supervisor", t("mobile.connected"));
    } else {
      await stopBackgroundConnection();
    }
    showUiMessage(t("mobile.serverSaved"), "success");
    open.value = false;
    emit("saved");
    window.location.reload();
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("mobile.serverConnectFailed"), "error");
  } finally {
    testing.value = false;
  }
}
</script>

<style scoped>
.mobile-server-config {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: 0 var(--app-space-4) var(--app-space-6);
}

.mobile-server-config__actions {
  display: flex;
  gap: var(--app-space-3);
  padding-top: var(--app-space-2);
}

.mobile-server-config__actions :deep(button) {
  flex: 1;
}
</style>
