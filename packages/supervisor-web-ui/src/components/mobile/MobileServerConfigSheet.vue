<template>
  <MobileSheet v-model:open="open" :title="editingId ? '编辑服务器' : '添加服务器'">
    <div class="mobile-server-config">
      <MobileField
        label="服务器地址"
        hint="例如 https://xxx.trycloudflare.com 或 http://192.168.1.10:3030"
      >
        <MobileInput v-model="serverUrl" placeholder="https://..." autocomplete="url" />
      </MobileField>
      <MobileField label="显示名称" hint="可选，默认使用主机名">
        <MobileInput v-model="serverName" placeholder="家里的电脑" />
      </MobileField>
      <MobileField label="访问 PIN" hint="与 Supervisor 启动时显示的 6 位 PIN 一致">
        <MobileInput v-model="serverPin" type="password" inputmode="numeric" maxlength="6" />
      </MobileField>
      <MobileField label="后台保持连接" hint="Android 显示常驻通知，尽量维持 SSE/WebSocket">
        <MobileSwitch v-model="backgroundEnabled" />
      </MobileField>
      <div class="mobile-server-config__actions">
        <MobileButton variant="secondary" @click="open = false">取消</MobileButton>
        <MobileButton variant="primary" :loading="testing" @click="save">
          保存并连接
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

const open = defineModel<boolean>("open", { default: false });

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
    showUiMessage("请填写服务器地址", "error");
    return;
  }
  if (!pin) {
    showUiMessage("请填写访问 PIN", "error");
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
      await startBackgroundConnection("Supervisor", "已连接");
    } else {
      await stopBackgroundConnection();
    }
    showUiMessage("服务器连接已保存", "success");
    open.value = false;
    emit("saved");
    window.location.reload();
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "无法连接服务器", "error");
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
