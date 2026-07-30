<template>
  <div class="startup-gate">
    <div v-if="state === 'checking'" class="startup-checking">
      <Loader2 v-if="!startupError" />
      <span>{{ startupError || "正在启动 Supervisor…" }}</span>
      <button v-if="startupError" type="button" @click="continueStartup">重试</button>
    </div>

    <section v-else-if="state === 'login'" class="startup-pin" :class="{ 'startup-pin--shake': shake }">
      <div class="startup-brand">Pi</div>
      <h1>输入访问密码</h1>
      <p>请输入启动服务时显示的 4 位数字密码</p>

      <div class="pin-dots" aria-label="已输入位数">
        <span
          v-for="i in PIN_LENGTH"
          :key="i"
          class="pin-dot"
          :class="{ 'pin-dot--filled': password.length >= i }"
        />
      </div>

      <p v-if="error" class="startup-error">{{ error }}</p>
      <p v-else-if="submitting" class="startup-hint">
        <Loader2 />
        正在验证…
      </p>
      <p v-else class="startup-hint">&nbsp;</p>

      <div class="pin-pad" role="group" aria-label="数字键盘">
        <button
          v-for="digit in digits"
          :key="digit"
          type="button"
          class="pin-key"
          :disabled="submitting || password.length >= PIN_LENGTH"
          @click="pressDigit(digit)"
        >
          <span class="pin-key__glow" aria-hidden="true" />
          <span class="pin-key__label">{{ digit }}</span>
        </button>
        <span class="pin-key pin-key--spacer" aria-hidden="true" />
        <button
          type="button"
          class="pin-key"
          :disabled="submitting || password.length >= PIN_LENGTH"
          @click="pressDigit('0')"
        >
          <span class="pin-key__glow" aria-hidden="true" />
          <span class="pin-key__label">0</span>
        </button>
        <button
          type="button"
          class="pin-key pin-key--action"
          :disabled="submitting || password.length === 0"
          aria-label="删除"
          @click="backspace"
        >
          <span class="pin-key__glow" aria-hidden="true" />
          <Delete class="pin-key__icon" />
        </button>
      </div>
    </section>

    <section v-else class="startup-setup">
      <header>
        <div class="startup-brand">Pi</div>
        <div>
          <h1>配置你的第一个模型</h1>
          <p>完成供应商和模型配置后即可开始使用</p>
        </div>
      </header>
      <div class="startup-provider-form">
        <ProviderFormView :provider-id="null" required-setup @saved="finishSetup" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Delete, Loader2 } from "lucide-vue-next";
import { getAuthStatus, listProviderModels, listProviders, saveWebPassword } from "@/api";
import ProviderFormView from "@/views/ProviderFormView.vue";

const PIN_LENGTH = 4;
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const emit = defineEmits<{ ready: [] }>();
const state = ref<"checking" | "login" | "setup">("checking");
const password = ref("");
const error = ref("");
const submitting = ref(false);
const shake = ref(false);
const startupError = ref("");
let shakeTimer: ReturnType<typeof setTimeout> | undefined;

async function hasUsableModel(): Promise<boolean> {
  const providers = (await listProviders()).filter((provider) => provider.isEnabled);
  const models = await Promise.all(providers.map((provider) => listProviderModels(provider.id)));
  return models.some((items) => items.length > 0);
}

async function continueStartup() {
  startupError.value = "";
  state.value = "checking";
  const auth = await getAuthStatus();
  if (auth.required && !auth.authenticated) {
    password.value = "";
    error.value = "";
    state.value = "login";
    return;
  }
  if (!(await hasUsableModel())) {
    state.value = "setup";
    return;
  }
  emit("ready");
}

function triggerShake(message: string) {
  error.value = message;
  password.value = "";
  shake.value = true;
  if (shakeTimer) clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => {
    shake.value = false;
  }, 420);
}

async function login() {
  if (password.value.length !== PIN_LENGTH || submitting.value) return;
  submitting.value = true;
  error.value = "";
  saveWebPassword(password.value);
  try {
    const auth = await getAuthStatus();
    if (!auth.authenticated) {
      triggerShake("密码不正确");
      return;
    }
    await continueStartup();
  } catch {
    triggerShake("无法连接 Supervisor，请稍后重试");
  } finally {
    submitting.value = false;
  }
}

function pressDigit(digit: string) {
  if (submitting.value || password.value.length >= PIN_LENGTH) return;
  error.value = "";
  password.value += digit;
  if (password.value.length === PIN_LENGTH) void login();
}

function backspace() {
  if (submitting.value || password.value.length === 0) return;
  error.value = "";
  password.value = password.value.slice(0, -1);
}

function onKeydown(event: KeyboardEvent) {
  if (state.value !== "login" || submitting.value) return;
  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    pressDigit(event.key);
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    backspace();
  }
}

async function finishSetup() {
  if (await hasUsableModel()) emit("ready");
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  void continueStartup().catch(() => {
    // A connection/configuration failure is not evidence that password auth is
    // enabled. Keep the neutral startup screen instead of asking for a mystery password.
    state.value = "checking";
    startupError.value = "无法连接 Supervisor，请确认服务已启动";
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  if (shakeTimer) clearTimeout(shakeTimer);
});
</script>

<style scoped>
.startup-gate {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: auto;
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}

.startup-checking {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.startup-checking button {
  margin-left: 4px;
  padding: 5px 10px;
  border-radius: 6px;
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.startup-checking svg,
.startup-hint svg {
  width: 17px;
  height: 17px;
  animation: startup-spin 1s linear infinite;
}

.startup-brand {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 12px;
  background: #07c160;
  color: white;
  font-size: 20px;
  font-weight: 700;
  box-shadow: 0 8px 24px rgb(7 193 96 / 18%);
}

.startup-pin {
  display: flex;
  width: min(360px, 100%);
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.startup-pin h1 {
  margin-top: 22px;
  font-size: 22px;
  font-weight: 650;
}

.startup-pin > p {
  margin-top: 7px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.pin-dots {
  display: flex;
  gap: 18px;
  margin-top: 36px;
  min-height: 14px;
}

.pin-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--app-text-primary) 28%, transparent);
  background: transparent;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;
}

.pin-dot--filled {
  background: var(--app-text-primary);
  border-color: var(--app-text-primary);
  transform: scale(1.08);
}

.startup-pin--shake .pin-dots {
  animation: pin-shake 0.42s ease;
}

.startup-error {
  margin-top: 14px;
  min-height: 18px;
  color: #fa5151;
  font-size: 12px;
}

.startup-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 14px;
  min-height: 18px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.pin-pad {
  display: grid;
  grid-template-columns: repeat(3, 72px);
  gap: 18px 28px;
  justify-content: center;
  margin-top: 28px;
  padding-bottom: 8px;
}

.pin-key {
  position: relative;
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 50%;
  background: rgb(255 255 255 / 14%);
  color: var(--app-text-primary);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 28%),
    0 1px 2px rgb(0 0 0 / 6%);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  isolation: isolate;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.12s ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

html[data-theme="light"] .pin-key {
  border-color: rgb(0 0 0 / 8%);
  background: rgb(255 255 255 / 55%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 80%),
    0 1px 3px rgb(0 0 0 / 8%);
}

.pin-key__glow {
  position: absolute;
  inset: -20%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 42%,
    rgb(255 255 255 / 78%) 0%,
    rgb(255 255 255 / 28%) 42%,
    transparent 72%
  );
  opacity: 0;
  transform: scale(0.72);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
  pointer-events: none;
  z-index: 0;
}

.pin-key__label,
.pin-key__icon {
  position: relative;
  z-index: 1;
}

.pin-key__label {
  font-size: 28px;
  font-weight: 450;
  letter-spacing: 0.02em;
  line-height: 1;
}

.pin-key__icon {
  width: 22px;
  height: 22px;
  color: var(--app-text-secondary);
}

.pin-key:active:not(:disabled),
.pin-key:focus-visible:not(:disabled) {
  background: rgb(255 255 255 / 78%);
  border-color: rgb(255 255 255 / 70%);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 35%),
    0 0 28px 10px rgb(255 255 255 / 28%),
    inset 0 0 18px rgb(255 255 255 / 55%);
  transform: scale(0.97);
  outline: none;
}

.pin-key:active:not(:disabled) .pin-key__glow,
.pin-key:focus-visible:not(:disabled) .pin-key__glow {
  opacity: 1;
  transform: scale(1);
}

html[data-theme="light"] .pin-key:active:not(:disabled),
html[data-theme="light"] .pin-key:focus-visible:not(:disabled) {
  background: rgb(255 255 255 / 92%);
  border-color: rgb(255 255 255 / 95%);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 80%),
    0 0 26px 8px rgb(255 255 255 / 70%),
    inset 0 0 16px rgb(255 255 255 / 90%);
}

.pin-key:disabled {
  opacity: 0.45;
}

.pin-key--spacer {
  visibility: hidden;
  pointer-events: none;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.pin-key--action .pin-key__icon {
  color: var(--app-text-primary);
}

.startup-setup {
  display: flex;
  width: min(920px, calc(100vw - 48px));
  height: min(760px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 16px;
  background: var(--app-settings-card);
  box-shadow: 0 20px 70px rgb(0 0 0 / 14%);
}

.startup-setup > header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 26px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.startup-setup h1 {
  font-size: 18px;
  font-weight: 650;
}

.startup-setup header p {
  margin-top: 7px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.startup-provider-form {
  min-height: 0;
  flex: 1;
}

.startup-provider-form :deep(.provider-form-view),
.startup-provider-form :deep(.provider-form-header),
.startup-provider-form :deep(.provider-form-actions) {
  background: var(--app-settings-card);
}

@keyframes startup-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pin-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-10px);
  }
  40% {
    transform: translateX(10px);
  }
  60% {
    transform: translateX(-7px);
  }
  80% {
    transform: translateX(7px);
  }
}

@media (max-width: 767px) {
  .startup-gate {
    padding: 16px;
    align-items: end;
  }

  .startup-pin {
    width: 100%;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }

  .pin-pad {
    grid-template-columns: repeat(3, 76px);
    gap: 16px 22px;
  }

  .pin-key {
    width: 76px;
    height: 76px;
  }
}
</style>
