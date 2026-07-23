<template>
  <div class="flex-1 flex flex-col min-w-0 overflow-hidden settings-page">
    <div class="h-16 flex items-center px-6 border-b settings-header">
      <button v-if="showBack" type="button" class="settings-back" @click="emit('back')">
        <ChevronLeft class="h-5 w-5" />
      </button>
      <h1 class="text-[17px] font-medium">设置</h1>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div class="settings-content space-y-5">
        <section class="settings-card">
          <h2>浏览器</h2>
          <label class="settings-field">
            <span>启动模式</span>
            <select v-model="form.browserMode">
              <option value="headless">无头模式（默认）</option>
              <option value="headed">有头模式</option>
            </select>
          </label>
        </section>

        <section class="settings-card">
          <h2>语音识别</h2>
          <label class="settings-field">
            <span>当前服务</span>
            <select v-model="form.speechRecognitionMode">
              <option value="browser">浏览器识别</option>
              <option value="qwen">Qwen3 ASR 实时识别</option>
              <option value="doubao">豆包流式语音识别 2.0</option>
            </select>
          </label>
          <div class="service-list">
            <div v-for="service in speechServices" :key="service.id" class="service-row">
              <div class="service-copy">
                <strong>{{ service.name }}</strong>
                <span>{{ service.description }}</span>
              </div>
              <span class="configuration-state" :title="service.configured ? '已配置' : undefined">
                <Check v-if="service.configured" class="h-5 w-5" aria-label="已配置" />
              </span>
              <button class="configure-button" type="button" @click="openService(service.id)">
                <Settings2 class="h-4 w-4" />配置
              </button>
            </div>
          </div>
        </section>

        <section class="settings-card">
          <h2>Web Search 与 Fetch</h2>
          <label class="settings-field">
            <span>搜索服务</span>
            <select v-model="form.webSearchProvider">
              <option value="duckduckgo">DuckDuckGo HTML（免费）</option>
              <option value="tavily">Tavily Search</option>
              <option value="brave">Brave Search</option>
              <option value="serper">Serper Google Search</option>
              <option value="firecrawl">Firecrawl Search</option>
            </select>
          </label>
          <label class="settings-field">
            <span>网页读取服务</span>
            <select v-model="form.webFetchProvider">
              <option value="native">原生 Fetch（默认）</option>
              <option value="native-then-tavily">原生失败后使用 Tavily</option>
              <option value="native-then-firecrawl">原生失败后使用 Firecrawl</option>
              <option value="tavily">仅 Tavily Extract</option>
              <option value="firecrawl">仅 Firecrawl Scrape</option>
            </select>
          </label>
          <div class="service-list">
            <div v-for="service in webServices" :key="service.id" class="service-row">
              <div class="service-copy">
                <strong>{{ service.name }}</strong>
                <span>{{ service.description }}</span>
              </div>
              <span class="configuration-state" :title="service.configured ? '已配置' : undefined">
                <Check v-if="service.configured" class="h-5 w-5" aria-label="已配置" />
              </span>
              <button class="configure-button" type="button" @click="openService(service.id)">
                <Settings2 class="h-4 w-4" />配置
              </button>
            </div>
          </div>
        </section>

        <div class="flex items-center gap-3">
          <button class="save-button" type="button" :disabled="saving" @click="saveMain">
            {{ saving ? "保存中..." : "保存" }}
          </button>
          <span v-if="message" class="text-sm" :class="failed ? 'text-red-500' : 'text-green-600'">
            {{ message }}
          </span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="activeService" class="service-overlay" @click.self="closeService">
        <section
          class="service-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="activeMeta.name"
        >
          <header>
            <div>
              <h2>{{ activeMeta.name }}</h2>
              <p>{{ activeMeta.description }}</p>
            </div>
            <button type="button" class="icon-button" title="关闭" @click="closeService">
              <X class="h-5 w-5" />
            </button>
          </header>
          <div class="dialog-body">
            <template v-if="activeService === 'browser'">
              <label>
                <span>语言提示（可选）</span>
                <select v-model="form.speechRecognitionLanguage">
                  <option value="">跟随浏览器</option>
                  <option value="zh-CN">中文（普通话）</option>
                  <option value="zh-HK">中文（粤语）</option>
                  <option value="en-US">English</option>
                  <option value="ja-JP">日本語</option>
                  <option value="ko-KR">한국어</option>
                </select>
              </label>
              <p class="dialog-note">仅作为浏览器识别提示，不影响云端服务。</p>
            </template>
            <template v-else>
              <label>
                <span>API Key</span>
                <input
                  v-model.trim="draftApiKey"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="activeMeta.configured ? '已配置，留空则保持不变' : '输入 API Key'"
                />
              </label>
              <label v-if="isWebService">
                <span>环境变量名（可选）</span>
                <input v-model.trim="draftEnvName" placeholder="也可以从环境变量读取" />
              </label>
              <label v-if="activeService === 'doubao'">
                <span>资源 ID</span>
                <input v-model.trim="form.doubaoSpeechResourceId" />
              </label>
              <p class="dialog-note">密钥加密保存在本机，不会返回到浏览器。</p>
            </template>
            <p
              v-if="dialogMessage"
              class="dialog-message"
              :class="dialogFailed ? 'failed' : 'passed'"
            >
              {{ dialogMessage }}
            </p>
          </div>
          <footer>
            <a
              v-if="activeMeta.consoleUrl"
              class="console-link"
              :href="activeMeta.consoleUrl"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink class="h-4 w-4" />创建 API Key
            </a>
            <button
              v-if="activeService !== 'browser'"
              class="secondary-button"
              type="button"
              :disabled="testingKey === activeService"
              @click="testActiveKey"
            >
              {{ testingKey === activeService ? "测试中..." : "测试" }}
            </button>
            <button
              v-if="activeService !== 'browser' && activeMeta.configured"
              class="danger-button"
              type="button"
              @click="clearActiveKey"
            >
              清除密钥
            </button>
            <button class="primary-button" type="button" :disabled="saving" @click="saveService">
              {{ saving ? "保存中..." : "保存" }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { Check, ChevronLeft, ExternalLink, Settings2, X } from "lucide-vue-next";
import { computed, onMounted, reactive, ref } from "vue";
import {
  getSupervisorSettings,
  testSettingsApiKey,
  updateSupervisorSettings,
  type SupervisorSettings,
} from "../api/api";

type ServiceId = "browser" | "qwen" | "doubao" | "tavily" | "brave" | "serper" | "firecrawl";
type RemoteServiceId = Exclude<ServiceId, "browser">;

defineProps<{ showBack?: boolean }>();
const emit = defineEmits<{ back: [] }>();

const form = reactive({
  browserMode: "headless" as "headless" | "headed",
  webSearchProvider: "duckduckgo" as NonNullable<SupervisorSettings["webSearchProvider"]>,
  webFetchProvider: "native" as NonNullable<SupervisorSettings["webFetchProvider"]>,
  speechRecognitionMode: "browser" as NonNullable<SupervisorSettings["speechRecognitionMode"]>,
  speechRecognitionLanguage: "",
  doubaoSpeechResourceId: "volc.seedasr.sauc.duration",
});
const envNames = reactive<Record<"tavily" | "brave" | "serper" | "firecrawl", string>>({
  tavily: "TAVILY_API_KEY",
  brave: "BRAVE_API_KEY",
  serper: "SERPER_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
});
const configured = reactive<Record<RemoteServiceId, boolean>>({
  qwen: false,
  doubao: false,
  tavily: false,
  brave: false,
  serper: false,
  firecrawl: false,
});
const serviceMeta: Record<ServiceId, { name: string; description: string; consoleUrl?: string }> = {
  browser: { name: "浏览器识别", description: "使用浏览器提供的语音识别能力" },
  qwen: {
    name: "Qwen3 ASR",
    description: "阿里云百炼实时语音识别",
    consoleUrl: "https://bailian.console.aliyun.com/?apiKey=1#/api-key",
  },
  doubao: {
    name: "豆包流式语音识别 2.0",
    description: "火山引擎流式语音识别",
    consoleUrl: "https://console.volcengine.com/speech/app",
  },
  tavily: {
    name: "Tavily",
    description: "搜索与网页提取",
    consoleUrl: "https://app.tavily.com/home",
  },
  brave: {
    name: "Brave Search",
    description: "Brave 搜索 API",
    consoleUrl: "https://api-dashboard.search.brave.com/app/keys",
  },
  serper: {
    name: "Serper",
    description: "Google 搜索 API",
    consoleUrl: "https://serper.dev/api-key",
  },
  firecrawl: {
    name: "Firecrawl",
    description: "搜索与网页抓取",
    consoleUrl: "https://www.firecrawl.dev/app/api-keys",
  },
};

const speechServices = computed(() => (["browser", "qwen", "doubao"] as const).map(serviceView));
const webServices = computed(() =>
  (["tavily", "brave", "serper", "firecrawl"] as const).map(serviceView),
);
const activeService = ref<ServiceId | null>(null);
const draftApiKey = ref("");
const draftEnvName = ref("");
const clearRequested = ref(false);
const testingKey = ref("");
const saving = ref(false);
const message = ref("");
const failed = ref(false);
const dialogMessage = ref("");
const dialogFailed = ref(false);

const activeMeta = computed(() => {
  const id = activeService.value ?? "browser";
  return { ...serviceMeta[id], configured: id === "browser" ? true : configured[id] };
});
const isWebService = computed(() =>
  activeService.value
    ? ["tavily", "brave", "serper", "firecrawl"].includes(activeService.value)
    : false,
);

function serviceView(id: ServiceId) {
  return { id, ...serviceMeta[id], configured: id === "browser" ? false : configured[id] };
}

function apply(settings: SupervisorSettings) {
  form.browserMode = settings.browserMode ?? "headless";
  form.webSearchProvider = settings.webSearchProvider ?? "duckduckgo";
  form.webFetchProvider = settings.webFetchProvider ?? "native";
  form.speechRecognitionMode = settings.speechRecognitionMode ?? "browser";
  form.speechRecognitionLanguage = settings.speechRecognitionLanguage ?? "";
  form.doubaoSpeechResourceId = settings.doubaoSpeechResourceId ?? "volc.seedasr.sauc.duration";
  envNames.tavily = settings.tavilyApiKeyEnv ?? "TAVILY_API_KEY";
  envNames.brave = settings.braveApiKeyEnv ?? "BRAVE_API_KEY";
  envNames.serper = settings.serperApiKeyEnv ?? "SERPER_API_KEY";
  envNames.firecrawl = settings.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY";
  configured.qwen = settings.speechApiKeyConfigured ?? false;
  configured.doubao = settings.doubaoSpeechApiKeyConfigured ?? false;
  configured.tavily = settings.tavilyApiKeyConfigured ?? false;
  configured.brave = settings.braveApiKeyConfigured ?? false;
  configured.serper = settings.serperApiKeyConfigured ?? false;
  configured.firecrawl = settings.firecrawlApiKeyConfigured ?? false;
}

function openService(id: ServiceId) {
  activeService.value = id;
  draftApiKey.value = "";
  draftEnvName.value = id in envNames ? envNames[id as keyof typeof envNames] : "";
  clearRequested.value = false;
  dialogMessage.value = "";
}

function closeService() {
  activeService.value = null;
}

function clearActiveKey() {
  if (!activeService.value || activeService.value === "browser") return;
  draftApiKey.value = "";
  clearRequested.value = true;
  dialogMessage.value = "保存后将清除密钥";
  dialogFailed.value = false;
}

async function testActiveKey() {
  if (!activeService.value || activeService.value === "browser") return;
  testingKey.value = activeService.value;
  dialogMessage.value = "";
  try {
    await testSettingsApiKey(activeService.value, draftApiKey.value || undefined);
    dialogFailed.value = false;
    dialogMessage.value = "API Key 测试通过";
  } catch (error) {
    dialogFailed.value = true;
    dialogMessage.value = error instanceof Error ? error.message : "API Key 测试失败";
  } finally {
    testingKey.value = "";
  }
}

function mainPatch(): Partial<SupervisorSettings> {
  return {
    browserMode: form.browserMode,
    webSearchProvider: form.webSearchProvider,
    webFetchProvider: form.webFetchProvider,
    speechRecognitionMode: form.speechRecognitionMode,
    speechRecognitionLanguage: form.speechRecognitionLanguage,
    doubaoSpeechResourceId: form.doubaoSpeechResourceId,
    tavilyApiKeyEnv: envNames.tavily,
    braveApiKeyEnv: envNames.brave,
    serperApiKeyEnv: envNames.serper,
    firecrawlApiKeyEnv: envNames.firecrawl,
  };
}

async function saveService() {
  if (!activeService.value) return;
  saving.value = true;
  dialogMessage.value = "";
  try {
    const patch = mainPatch();
    const id = activeService.value;
    if (id !== "browser") {
      const keyFields: Record<RemoteServiceId, keyof SupervisorSettings> = {
        qwen: "speechApiKey",
        doubao: "doubaoSpeechApiKey",
        tavily: "tavilyApiKey",
        brave: "braveApiKey",
        serper: "serperApiKey",
        firecrawl: "firecrawlApiKey",
      };
      if (draftApiKey.value || clearRequested.value) {
        Object.assign(patch, { [keyFields[id]]: clearRequested.value ? "" : draftApiKey.value });
      }
      if (id in envNames) {
        envNames[id as keyof typeof envNames] = draftEnvName.value;
        Object.assign(patch, { [`${id}ApiKeyEnv`]: draftEnvName.value });
      }
    }
    apply(await updateSupervisorSettings(patch));
    closeService();
    failed.value = false;
    message.value = "已保存";
  } catch (error) {
    dialogFailed.value = true;
    dialogMessage.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function saveMain() {
  saving.value = true;
  message.value = "";
  try {
    apply(await updateSupervisorSettings(mainPatch()));
    failed.value = false;
    message.value = "已保存";
  } catch (error) {
    failed.value = true;
    message.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    apply(await getSupervisorSettings());
  } catch (error) {
    failed.value = true;
    message.value = error instanceof Error ? error.message : "读取设置失败";
  }
});
</script>

<style scoped>
.settings-page,
.settings-header {
  background: var(--app-settings-bg);
}
.settings-header {
  border-color: var(--app-border);
  color: var(--app-text-primary);
}
.settings-content {
  width: min(920px, 100%);
}
.settings-card {
  overflow: hidden;
  padding: 0 22px 16px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  background: var(--app-settings-card);
}
.settings-card h2 {
  margin: 0 -22px;
  padding: 16px 22px 13px;
  border-bottom: 1px solid var(--app-border-subtle);
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.settings-field {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 58px;
  border-bottom: 1px solid var(--app-border-subtle);
  font-size: 14px;
  color: var(--app-text-primary);
}
select,
input {
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 7px;
  outline: none;
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}
select:focus,
input:focus {
  border-color: #07c160;
  box-shadow: 0 0 0 3px rgb(7 193 96 / 12%);
}
.service-list {
  padding-top: 6px;
}
.service-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  min-height: 64px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.service-row:last-child {
  border-bottom: 0;
}
.service-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.service-copy strong {
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text-primary);
}
.service-copy span {
  font-size: 12px;
  color: var(--app-text-muted);
}
.configuration-state {
  display: inline-grid;
  width: 24px;
  place-items: center;
  color: #07a65a;
}
.configure-button {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
.configure-button:hover {
  color: #07a65a;
}
.save-button,
.primary-button {
  padding: 8px 20px;
  border-radius: 6px;
  color: white;
  background: #07c160;
}
.save-button:disabled,
.primary-button:disabled {
  opacity: 0.55;
}
.settings-back,
.icon-button {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 6px;
  color: var(--app-text-secondary);
}
.settings-back {
  margin-left: -8px;
  margin-right: 8px;
}
.settings-back:hover,
.icon-button:hover {
  background: var(--app-hover);
}
.service-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(0 0 0 / 42%);
}
.service-dialog {
  display: flex;
  width: min(500px, 100%);
  max-height: 90vh;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-settings-card);
  box-shadow: 0 18px 48px rgb(0 0 0 / 20%);
}
.service-dialog header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 17px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.service-dialog header > div {
  min-width: 0;
  flex: 1;
}
.service-dialog h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.service-dialog header p {
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.dialog-body {
  overflow-y: auto;
  padding: 18px 20px;
}
.dialog-body label {
  display: block;
  margin-bottom: 16px;
}
.dialog-body label span {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--app-text-secondary);
}
.dialog-note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-text-muted);
}
.dialog-message {
  margin-top: 12px;
  font-size: 13px;
}
.dialog-message.passed {
  color: #07a65a;
}
.dialog-message.failed {
  color: var(--app-danger, #dc2626);
}
.service-dialog footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 13px 20px;
  border-top: 1px solid var(--app-border-subtle);
}
.console-link {
  display: flex;
  margin-right: auto;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--app-accent);
}
.secondary-button,
.danger-button {
  height: 34px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 13px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
}
.danger-button {
  color: var(--app-danger, #dc2626);
}
@media (max-width: 640px) {
  .settings-field {
    grid-template-columns: 1fr;
    gap: 6px;
    padding: 10px 0;
  }
  .service-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 8px 0;
  }
  .configured-state,
  .local-state,
  .unconfigured-state {
    grid-column: 1;
  }
  .configure-button {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
  .service-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .service-dialog {
    width: 100%;
    max-height: 86vh;
    border-radius: 8px 8px 0 0;
  }
  .service-dialog footer {
    flex-wrap: wrap;
  }
  .console-link {
    width: 100%;
    margin-bottom: 4px;
  }
}
</style>
