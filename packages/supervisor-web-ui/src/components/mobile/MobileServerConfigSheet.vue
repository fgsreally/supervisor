<template>
  <MobileSheet v-model:open="open" title="服务器连接">
    <div class="mobile-server-config space-y-4 px-4 pb-6">
      <MobileField
        label="服务器地址"
        hint="例如 https://xxx.trycloudflare.com 或 http://192.168.1.10:3030"
      >
        <MobileInput v-model="serverUrl" placeholder="https://..." autocomplete="url" />
      </MobileField>
      <MobileField label="访问 PIN" hint="与 Supervisor 启动时显示的 6 位 PIN 一致">
        <MobileInput v-model="serverPin" type="password" inputmode="numeric" maxlength="6" />
      </MobileField>
      <MobileField label="后台保持连接" hint="Android 显示常驻通知，尽量维持 SSE/WebSocket">
        <MobileSwitch v-model="backgroundEnabled" />
      </MobileField>
      <div class="flex gap-3 pt-2">
        <MobileButton variant="secondary" class="flex-1" @click="open = false">取消</MobileButton>
        <MobileButton variant="primary" class="flex-1" :loading="testing" @click="save">
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
  getMobileServerPin,
  getMobileServerUrl,
  isBackgroundConnectionEnabled,
  setBackgroundConnectionEnabled,
  setMobileServerPin,
  setMobileServerUrl,
} from "@/utils/mobile-server-config";
import { startBackgroundConnection, stopBackgroundConnection } from "@/composables/use-live-status";
import MobileButton from "./ui/MobileButton.vue";
import MobileField from "./ui/MobileField.vue";
import MobileInput from "./ui/MobileInput.vue";
import MobileSheet from "./ui/MobileSheet.vue";
import MobileSwitch from "./ui/MobileSwitch.vue";

const open = defineModel<boolean>("open", { default: false });

const serverUrl = ref(getMobileServerUrl() ?? "");
const serverPin = ref(getMobileServerPin() ?? "");
const backgroundEnabled = ref(isBackgroundConnectionEnabled());
const testing = ref(false);

watch(open, (visible) => {
  if (!visible) return;
  serverUrl.value = getMobileServerUrl() ?? "";
  serverPin.value = getMobileServerPin() ?? "";
  backgroundEnabled.value = isBackgroundConnectionEnabled();
});

async function save() {
  const url = serverUrl.value.trim().replace(/\/+$/, "");
  const pin = serverPin.value.trim();
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
    setMobileServerUrl(url);
    setMobileServerPin(pin);
    setBackgroundConnectionEnabled(backgroundEnabled.value);
    await api.healthCheck();
    if (backgroundEnabled.value) {
      await startBackgroundConnection("Supervisor", "已连接");
    } else {
      await stopBackgroundConnection();
    }
    showUiMessage("服务器连接已保存", "success");
    open.value = false;
    window.location.reload();
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "无法连接服务器", "error");
  } finally {
    testing.value = false;
  }
}
</script>
