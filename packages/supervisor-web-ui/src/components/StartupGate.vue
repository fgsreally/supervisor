<template>
  <div class="startup-gate">
    <UiEmptyState
      v-if="state === 'checking' && startupError"
      tone="error"
      title="无法连接 Supervisor"
      description="服务暂时不可用，请确认服务已启动后重试。"
      action-label="重新连接"
      @action="continueStartup"
    >
      <template #icon><ServerOff /></template>
      <template #action-icon><RefreshCw /></template>
    </UiEmptyState>
    <div v-else-if="state === 'checking'" class="startup-checking">
      <Loader2 />
      <span>正在启动 Supervisor…</span>
    </div>

    <section v-else-if="state === 'login'" class="startup-pin">
      <div class="startup-pin__content" :class="{ 'startup-pin--shake': shake }">
        <LockKeyhole class="startup-pin__lock" aria-hidden="true" />
        <h1>输入密码</h1>

        <div class="pin-dots" aria-label="已输入位数">
          <span
            v-for="i in PIN_LENGTH"
            :key="i"
            class="pin-dot"
            :class="{ 'pin-dot--filled': password.length >= i }"
          />
        </div>

        <div class="startup-feedback" aria-live="polite">
          <p v-if="error" class="startup-error">{{ error }}</p>
          <Loader2 v-else-if="submitting" class="startup-spinner" aria-label="正在验证" />
        </div>

        <div class="pin-pad" role="group" aria-label="数字键盘">
          <button
            v-for="digit in digits"
            :key="digit"
            type="button"
            class="pin-key"
            :class="keyClasses(digit)"
            :style="keyLightStyle(digit)"
            :disabled="submitting || password.length >= PIN_LENGTH"
            @pointerenter="startHover(digit, $event)"
            @pointerleave="stopHover(digit, $event)"
            @pointerdown="startPress(digit)"
            @pointerup="stopPress($event)"
            @pointercancel="cancelPointerInteraction"
            @click="pressDigit(digit)"
          >
            <span class="pin-key__glow" aria-hidden="true" />
            <span class="pin-key__label">{{ digit }}</span>
          </button>
        </div>
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Loader2, LockKeyhole, RefreshCw, ServerOff } from "lucide-vue-next";
import { getAuthStatus, listProviderModels, listProviders, saveWebPassword } from "@/api";
import UiEmptyState from "@/components/ui/UiEmptyState.vue";
import ProviderFormView from "@/views/ProviderFormView.vue";

const PIN_LENGTH = 6;
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;
type PinDigit = (typeof digits)[number];

const keyPositions: Record<PinDigit, { x: number; y: number }> = {
  "1": { x: 0, y: 0 },
  "2": { x: 1, y: 0 },
  "3": { x: 2, y: 0 },
  "4": { x: 0, y: 1 },
  "5": { x: 1, y: 1 },
  "6": { x: 2, y: 1 },
  "7": { x: 0, y: 2 },
  "8": { x: 1, y: 2 },
  "9": { x: 2, y: 2 },
  "0": { x: 1, y: 3 },
};

const emit = defineEmits<{ ready: [] }>();
const state = ref<"checking" | "login" | "setup">("checking");
const password = ref("");
const error = ref("");
const submitting = ref(false);
const shake = ref(false);
const hoveredDigit = ref<PinDigit | null>(null);
const pressedDigit = ref<PinDigit | null>(null);
const illuminatedDigit = computed(() => pressedDigit.value ?? hoveredDigit.value);
const startupError = ref("");
let shakeTimer: ReturnType<typeof setTimeout> | undefined;
let pressReleaseTimer: ReturnType<typeof setTimeout> | undefined;

function keyDistance(digit: PinDigit): number | null {
  if (!illuminatedDigit.value) return null;
  const source = keyPositions[illuminatedDigit.value];
  const target = keyPositions[digit];
  return Math.hypot(source.x - target.x, source.y - target.y);
}

function keyClasses(digit: PinDigit) {
  const distance = keyDistance(digit);
  return {
    "pin-key--zero": digit === "0",
    "pin-key--illuminated": distance === 0,
    "pin-key--affected-near": distance === 1,
    "pin-key--affected-far": distance !== null && distance > 1 && distance <= Math.SQRT2,
  };
}

function keyLightStyle(digit: PinDigit) {
  if (!illuminatedDigit.value || digit === illuminatedDigit.value) return undefined;
  const source = keyPositions[illuminatedDigit.value];
  const target = keyPositions[digit];
  const dx = Math.sign(source.x - target.x);
  const dy = Math.sign(source.y - target.y);
  return {
    "--light-x": `${50 + dx * 42}%`,
    "--light-y": `${50 + dy * 42}%`,
  };
}

function startHover(digit: PinDigit, event: PointerEvent) {
  if (event.pointerType === "touch") return;
  if (submitting.value || password.value.length >= PIN_LENGTH) return;
  hoveredDigit.value = digit;
}

function stopHover(digit: PinDigit, event?: PointerEvent) {
  if (event?.pointerType === "touch") return;
  if (hoveredDigit.value === digit) hoveredDigit.value = null;
  if (pressedDigit.value === digit) pressedDigit.value = null;
}

function startPress(digit: PinDigit) {
  if (submitting.value || password.value.length >= PIN_LENGTH) return;
  if (pressReleaseTimer) clearTimeout(pressReleaseTimer);
  pressedDigit.value = digit;
}

function stopPress(event?: PointerEvent) {
  if (pressReleaseTimer) clearTimeout(pressReleaseTimer);
  if (event?.pointerType === "touch") {
    pressReleaseTimer = setTimeout(() => {
      pressedDigit.value = null;
    }, 70);
    return;
  }
  pressedDigit.value = null;
}

function cancelPointerInteraction() {
  if (pressReleaseTimer) clearTimeout(pressReleaseTimer);
  pressedDigit.value = null;
  hoveredDigit.value = null;
}

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

function pressDigit(digit: PinDigit) {
  if (submitting.value || password.value.length >= PIN_LENGTH) return;
  error.value = "";
  password.value += digit;
  if (password.value.length === PIN_LENGTH) void login();
}

function onKeydown(event: KeyboardEvent) {
  if (state.value !== "login" || submitting.value) return;
  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    if (!event.repeat) {
      startPress(event.key as PinDigit);
      pressDigit(event.key as PinDigit);
    }
  }
}

function onKeyup(event: KeyboardEvent) {
  if (/^\d$/.test(event.key)) stopPress();
}

async function finishSetup() {
  if (await hasUsableModel()) emit("ready");
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("keyup", onKeyup);
  void continueStartup().catch(() => {
    // A connection/configuration failure is not evidence that password auth is
    // enabled. Keep the neutral startup screen instead of asking for a mystery password.
    state.value = "checking";
    startupError.value = "无法连接 Supervisor，请确认服务已启动";
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("keyup", onKeyup);
  if (shakeTimer) clearTimeout(shakeTimer);
  if (pressReleaseTimer) clearTimeout(pressReleaseTimer);
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

.startup-checking svg {
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
  position: fixed;
  inset: 0;
  display: flex;
  width: 100%;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  overflow: hidden auto;
  background:
    radial-gradient(circle at 50% 38%, rgb(16 45 35 / 48%), transparent 44%),
    linear-gradient(160deg, #07100d 0%, #020806 56%, #06100c 100%);
  color: #fff;
  text-align: center;
  isolation: isolate;
}

.startup-pin::before,
.startup-pin::after {
  position: absolute;
  width: min(96vw, 620px);
  aspect-ratio: 1;
  border-radius: 50%;
  content: "";
  filter: blur(52px);
  mix-blend-mode: screen;
  opacity: 0.72;
  pointer-events: none;
  will-change: transform;
}

.startup-pin::before {
  top: -8%;
  left: -18%;
  background: radial-gradient(
    circle,
    rgb(7 193 96 / 62%) 0%,
    rgb(18 128 82 / 32%) 42%,
    transparent 70%
  );
  animation: pin-mist-a 13s ease-in-out infinite alternate;
}

.startup-pin::after {
  right: -20%;
  bottom: -8%;
  background: radial-gradient(
    circle,
    rgb(29 181 116 / 52%) 0%,
    rgb(24 160 166 / 25%) 45%,
    transparent 70%
  );
  animation: pin-mist-b 16s ease-in-out infinite alternate;
}

.startup-pin__content {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(390px, 100%);
  min-height: min(100dvh, 844px);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: max(54px, 7dvh) 24px max(32px, env(safe-area-inset-bottom));
  background: transparent;
}

.startup-pin__lock {
  width: 31px;
  height: 31px;
  flex: none;
  stroke-width: 2.5;
  filter: drop-shadow(0 2px 8px rgb(0 0 0 / 18%));
}

.startup-pin h1 {
  margin-top: clamp(72px, 13dvh, 112px);
  font-size: 28px;
  font-weight: 420;
  letter-spacing: 0.08em;
  line-height: 1;
  text-shadow: 0 2px 10px rgb(0 0 0 / 22%);
}

.pin-dots {
  display: flex;
  gap: 18px;
  margin-top: clamp(42px, 6.5dvh, 58px);
  min-height: 11px;
}

.pin-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 0;
  background: rgb(255 255 255 / 20%);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / 8%);
  transition:
    background-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.pin-dot--filled {
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 0 12px rgb(255 255 255 / 35%);
  transform: scale(1.06);
}

.startup-pin--shake {
  animation: pin-shake 0.42s ease;
}

.startup-feedback {
  display: grid;
  height: 42px;
  place-items: center;
  margin-top: 7px;
}

.startup-error {
  color: #ff7878;
  font-size: 13px;
  text-shadow: 0 1px 8px rgb(0 0 0 / 45%);
}

.startup-spinner {
  width: 18px;
  height: 18px;
  color: rgb(255 255 255 / 72%);
  animation: startup-spin 1s linear infinite;
}

.pin-pad {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 72px);
  gap: 18px 24px;
  justify-content: center;
  margin-top: clamp(20px, 3dvh, 28px);
  isolation: isolate;
}

.pin-key {
  position: relative;
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 50%,
    rgb(2 2 4 / 98%) 0%,
    rgb(7 7 10 / 96%) 42%,
    rgb(22 22 27 / 94%) 68%,
    rgb(68 69 76 / 90%) 100%
  );
  color: #fff;
  box-shadow:
    inset 0 0 12px rgb(255 255 255 / 10%),
    inset 0 0 2px rgb(255 255 255 / 18%),
    0 5px 18px rgb(0 0 0 / 26%);
  backdrop-filter: blur(16px) brightness(1.34) saturate(0.72);
  -webkit-backdrop-filter: blur(16px) brightness(1.34) saturate(0.72);
  isolation: isolate;
  transition:
    background-color 0.11s cubic-bezier(0.4, 0, 1, 1),
    border-color 0.11s cubic-bezier(0.4, 0, 1, 1),
    box-shadow 0.11s cubic-bezier(0.4, 0, 1, 1),
    transform 0.08s cubic-bezier(0.4, 0, 1, 1);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.pin-key__glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle at var(--light-x, 50%) var(--light-y, 50%),
    rgb(255 255 255 / 78%) 0%,
    rgb(255 255 255 / 30%) 27%,
    transparent 61%
  );
  filter: blur(5px);
  opacity: 0;
  transition:
    opacity 0.11s cubic-bezier(0.4, 0, 1, 1),
    filter 0.11s cubic-bezier(0.4, 0, 1, 1);
  pointer-events: none;
  z-index: 0;
}

.pin-key__label {
  position: relative;
  z-index: 1;
  font-size: 28px;
  font-weight: 360;
  line-height: 1;
  text-shadow: 0 1px 5px rgb(0 0 0 / 42%);
}

.pin-key--affected-near .pin-key__glow {
  opacity: 0.72;
}

.pin-key--affected-far .pin-key__glow {
  filter: blur(7px);
  opacity: 0.32;
}

.pin-key--affected-near {
  border-color: rgb(255 255 255 / 28%);
  box-shadow:
    inset 0 -7px 14px rgb(255 255 255 / 17%),
    inset 0 8px 14px rgb(0 0 0 / 36%),
    inset 0 1px 1px rgb(255 255 255 / 28%),
    0 0 18px rgb(255 255 255 / 7%);
}

.pin-key--affected-far {
  border-color: rgb(255 255 255 / 22%);
}

.pin-key--illuminated {
  border-color: rgb(255 255 255 / 96%);
  background: radial-gradient(
    circle at 50% 50%,
    rgb(48 48 48) 0%,
    rgb(61 61 61) 27%,
    rgb(112 112 112) 44%,
    rgb(218 218 218) 67%,
    rgb(255 255 255) 88%
  );
  box-shadow:
    0 0 1px 1px rgb(255 255 255 / 42%),
    0 0 26px 6px rgb(255 255 255 / 16%),
    inset 0 0 10px rgb(255 255 255 / 36%);
  transition-duration: 55ms;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

.pin-key--illuminated .pin-key__label {
  text-shadow:
    0 1px 5px rgb(0 0 0 / 48%),
    0 0 8px rgb(255 255 255 / 48%);
}

.pin-key:active:not(:disabled) {
  transform: scale(0.96);
}

.pin-key:focus-visible:not(:disabled) {
  outline: 2px solid rgb(255 255 255 / 62%);
  outline-offset: 3px;
}

.pin-key--illuminated .pin-key__glow {
  opacity: 0;
}

.pin-key:active:not(:disabled) .pin-key__glow {
  opacity: inherit;
}

.pin-key:disabled {
  opacity: 1;
}

.pin-key--zero {
  grid-column: 2;
}

@media (prefers-reduced-motion: reduce) {
  .pin-key,
  .pin-key__glow {
    transition: none;
  }
}

/* Keep the native keyboard focus distinct from the optical click state. */
.pin-key:focus:not(:focus-visible) {
  outline: none;
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

@keyframes pin-mist-a {
  0% {
    transform: translate3d(-4%, -3%, 0) scale(0.92);
  }
  55% {
    transform: translate3d(32%, 20%, 0) scale(1.12);
  }
  100% {
    transform: translate3d(18%, 48%, 0) scale(0.98);
  }
}

@keyframes pin-mist-b {
  0% {
    transform: translate3d(5%, 4%, 0) scale(1.08);
  }
  48% {
    transform: translate3d(-30%, -22%, 0) scale(0.9);
  }
  100% {
    transform: translate3d(-12%, -46%, 0) scale(1.16);
  }
}

@media (max-width: 767px) {
  .startup-gate {
    padding: 16px;
    align-items: end;
  }

  .startup-pin {
    width: 100%;
  }

  .startup-checking {
    position: fixed;
    inset: 0;
    justify-content: center;
  }

  .startup-pin__content {
    min-height: 100dvh;
    padding-top: max(24px, env(safe-area-inset-top));
    padding-bottom: max(20px, env(safe-area-inset-bottom));
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

@media (max-width: 767px) and (max-height: 760px) {
  .startup-pin h1 {
    margin-top: 42px;
  }

  .pin-dots {
    margin-top: 32px;
  }

  .startup-feedback {
    height: 32px;
  }

  .pin-pad {
    grid-template-columns: repeat(3, 68px);
    gap: 12px 20px;
    margin-top: 14px;
  }

  .pin-key {
    width: 68px;
    height: 68px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .startup-pin::before,
  .startup-pin::after {
    animation: none;
  }
}
</style>
