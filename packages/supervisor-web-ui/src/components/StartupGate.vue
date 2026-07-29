<template>
  <div class="startup-gate">
    <div v-if="state === 'checking'" class="startup-checking">
      <Loader2 v-if="!startupError" />
      <span>{{ startupError || "正在启动 Supervisor…" }}</span>
      <button v-if="startupError" type="button" @click="continueStartup">重试</button>
    </div>

    <section v-else-if="state === 'login'" class="startup-login">
      <div class="startup-brand">Pi</div>
      <h1>登录 Supervisor</h1>
      <p>请输入启动服务时设置的访问密码</p>
      <form @submit.prevent="login">
        <label>
          <LockKeyhole />
          <input
            ref="passwordInput"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="访问密码"
          />
        </label>
        <span v-if="error" class="startup-error">{{ error }}</span>
        <button type="submit" :disabled="!password || submitting">
          <Loader2 v-if="submitting" />
          <span>进入系统</span>
        </button>
      </form>
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
import { nextTick, onMounted, ref } from "vue";
import { Loader2, LockKeyhole } from "lucide-vue-next";
import { getAuthStatus, listProviderModels, listProviders, saveWebPassword } from "@/api";
import ProviderFormView from "@/views/ProviderFormView.vue";

const emit = defineEmits<{ ready: [] }>();
const state = ref<"checking" | "login" | "setup">("checking");
const password = ref("");
const error = ref("");
const submitting = ref(false);
const passwordInput = ref<HTMLInputElement | null>(null);
const startupError = ref("");

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
    state.value = "login";
    await nextTick();
    passwordInput.value?.focus();
    return;
  }
  if (!(await hasUsableModel())) {
    state.value = "setup";
    return;
  }
  emit("ready");
}

async function login() {
  if (!password.value || submitting.value) return;
  submitting.value = true;
  error.value = "";
  saveWebPassword(password.value);
  try {
    const auth = await getAuthStatus();
    if (!auth.authenticated) {
      error.value = "密码不正确";
      return;
    }
    await continueStartup();
  } catch {
    error.value = "无法连接 Supervisor，请稍后重试";
  } finally {
    submitting.value = false;
  }
}

async function finishSetup() {
  if (await hasUsableModel()) emit("ready");
}

onMounted(() => {
  void continueStartup().catch(() => {
    // A connection/configuration failure is not evidence that password auth is
    // enabled. Keep the neutral startup screen instead of asking for a mystery password.
    state.value = "checking";
    startupError.value = "无法连接 Supervisor，请确认服务已启动";
  });
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
form button svg {
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
.startup-login {
  width: min(390px, 100%);
  padding: 34px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 16px;
  background: var(--app-settings-card);
  box-shadow: 0 18px 60px rgb(0 0 0 / 12%);
}
.startup-login h1 {
  margin-top: 22px;
  font-size: 22px;
  font-weight: 650;
}
.startup-login > p,
.startup-setup header p {
  margin-top: 7px;
  color: var(--app-text-secondary);
  font-size: 13px;
}
.startup-login form {
  margin-top: 26px;
}
.startup-login label {
  display: flex;
  height: 44px;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  background: var(--app-input-bg, var(--app-hover));
}
.startup-login label:focus-within {
  border-color: #07c160;
  box-shadow: 0 0 0 3px rgb(7 193 96 / 10%);
}
.startup-login label svg {
  width: 17px;
  color: var(--app-text-muted);
}
.startup-login input {
  min-width: 0;
  flex: 1;
  outline: 0;
  background: transparent;
  font-size: 14px;
}
.startup-login form > button {
  display: flex;
  width: 100%;
  height: 43px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 16px;
  border-radius: 9px;
  background: #07c160;
  color: white;
  font-size: 14px;
  font-weight: 550;
}
.startup-login form > button:disabled {
  opacity: 0.55;
}
.startup-error {
  display: block;
  margin-top: 8px;
  color: #fa5151;
  font-size: 12px;
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
</style>
