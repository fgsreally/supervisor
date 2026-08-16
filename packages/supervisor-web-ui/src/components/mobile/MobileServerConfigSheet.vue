<template>
  <MobileSheet v-model:open="open" :title="editingId ? t('mobile.editServer') : t('mobile.addServer')">
    <div class="mobile-server-config">
      <MobileField
        :label="t('mobile.serverAddress')"
        :hint="t('mobile.serverAddressHint')"
      >
        <MobileInput v-model="serverUrl" placeholder="https://..." autocomplete="url" />
      </MobileField>
      <MobileField :label="t('mobile.displayName')" :hint="t('mobile.displayNameHint')">
        <MobileInput v-model="serverName" :placeholder="t('mobile.homeComputer')" />
      </MobileField>
      <MobileField :label="t('mobile.accessPin')" :hint="t('mobile.accessPinHint')">
        <MobileInput v-model="serverPin" type="password" inputmode="numeric" maxlength="6" />
      </MobileField>
      <MobileField :label="t('mobile.backgroundConnection')" :hint="t('mobile.backgroundConnectionHint')">
        <MobileSwitch v-model="backgroundEnabled" />
      </MobileField>
      <div class="mobile-server-config__actions">
        <MobileButton variant="secondary" @click="open = false">{{ t("common.cancel") }}</MobileButton>
        <MobileButton variant="primary" :loading="testing" @click="save">
          {{ t("mobile.saveAndConnect") }}
        </MobileButton>
      </div>
    </div>
  </MobileSheet>
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
import MobileButton from "./ui/MobileButton.vue";
import MobileField from "./ui/MobileField.vue";
import MobileInput from "./ui/MobileInput.vue";
import MobileSheet from "./ui/MobileSheet.vue";
import MobileSwitch from "./ui/MobileSwitch.vue";
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
