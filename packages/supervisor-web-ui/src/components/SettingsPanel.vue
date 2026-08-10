<template>
  <div
    class="flex-1 flex flex-col min-w-0 overflow-hidden settings-page"
    :class="`settings-page--${mode}`"
  >
    <div class="settings-header m-mobile-header">
      <button v-if="showBack" type="button" class="settings-back" @click="emit('back')">
        <ChevronLeft class="h-5 w-5" />
      </button>
      <span v-else aria-hidden="true" />
      <h1 class="m-mobile-header__title">{{ pageTitle }}</h1>
      <span aria-hidden="true" />
    </div>

    <div class="settings-scroll flex-1 overflow-y-auto custom-scrollbar">
      <div class="settings-content">
        <section v-if="showServices" class="settings-card">
          <h2 class="settings-card-title-row">
            <span class="settings-watson-title"><WatsonIcon />华生</span>
            <small>负责项目解析、摘要等系统内部任务</small>
          </h2>
          <label class="settings-field">
            <span>助手模型</span>
            <ModelTreeSelect
              v-model="featureModelKeys.assistant"
              :groups="modelGroups"
              :disabled="saving"
              placeholder="未配置"
              @change="saveMain"
            />
          </label>
          <div v-if="showDiagnostics" class="service-list">
            <div class="service-row">
              <div class="service-copy">
                <strong>运行日志</strong>
                <span>项目解析、摘要等内部任务的执行记录</span>
              </div>
              <button class="configure-button" type="button" @click="loadLog('watson')">
                <ScrollText class="h-4 w-4" />查看
              </button>
            </div>
          </div>
        </section>

        <section v-if="showDiagnostics" class="settings-card">
          <h2>{{ mode === "diagnostics" ? "运行日志" : "系统" }}</h2>
          <div class="service-list">
            <div v-if="mode === 'diagnostics'" class="service-row">
              <div class="service-copy">
                <strong>华生运行日志</strong>
                <span>项目解析、摘要等内部任务的执行记录</span>
              </div>
              <button class="configure-button" type="button" @click="loadLog('watson')">
                <ScrollText class="h-4 w-4" />查看
              </button>
            </div>
            <div class="service-row">
              <div class="service-copy">
                <strong>{{ mode === "diagnostics" ? "系统运行日志" : "运行与诊断" }}</strong>
                <span>Supervisor 服务状态和诊断记录</span>
              </div>
              <button class="configure-button" type="button" @click="loadLog('system')">
                <ScrollText class="h-4 w-4" />查看
              </button>
            </div>
          </div>
        </section>

        <section v-if="showDiagnostics" class="settings-card">
          <h2>界面</h2>
          <div class="service-list">
            <div class="service-row service-row--switch">
              <div class="service-copy">
                <strong>高级动画</strong>
                <span>列表移除与恢复时使用粒子消散 / 聚合效果</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="高级动画"
                :aria-checked="viewPreferences.advancedAnimations"
                class="settings-switch"
                :class="
                  viewPreferences.advancedAnimations
                    ? 'settings-switch--on'
                    : 'settings-switch--off'
                "
                @click="toggleAdvancedAnimations"
              >
                <span class="settings-switch__thumb" />
              </button>
            </div>
            <div class="service-row service-row--font-scale">
              <div class="service-copy">
                <strong>字号</strong>
                <span>调整界面文字大小</span>
              </div>
              <div class="font-scale-segment" role="group" aria-label="字号">
                <button
                  v-for="option in fontScaleOptions"
                  :key="option.value"
                  type="button"
                  :class="{ active: fontScale === option.value }"
                  @click="setFontScale(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="showServices" class="settings-card">
          <h2>浏览器</h2>
          <label class="settings-field">
            <span>启动模式</span>
            <select v-model="form.browserMode">
              <option value="headless">无头模式（默认）</option>
              <option value="headed">有头模式</option>
            </select>
          </label>
        </section>

        <section v-if="showServices" class="settings-card">
          <h2>语音识别</h2>
          <label class="settings-field">
            <span>当前服务</span>
            <select v-model="form.speechRecognitionMode">
              <option value="local">本地模型识别</option>
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

        <section v-if="showServices" class="settings-card">
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

        <div v-if="showServices" class="settings-save-bar">
          <span v-if="message" class="text-sm" :class="failed ? 'text-red-500' : 'text-green-600'">
            {{ message }}
          </span>
          <button class="save-button" type="button" :disabled="saving" @click="saveMain">
            {{ saving ? "保存中..." : "保存" }}
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="activeLog" class="service-overlay" @click.self="activeLog = null">
        <section class="service-dialog settings-log-dialog" role="dialog" aria-modal="true">
          <header>
            <div>
              <h2 class="settings-log-title">
                <WatsonIcon v-if="activeLog === 'watson'" />
                {{ activeLog === "watson" ? "华生运行日志" : "系统运行与诊断" }}
              </h2>
              <p>{{ activeLogFiles.join(" · ") || "实时读取最近的日志记录" }}</p>
            </div>
            <button type="button" class="icon-button" title="关闭" @click="activeLog = null">
              <X class="h-5 w-5" />
            </button>
          </header>
          <pre class="settings-log">{{ activeLogText }}</pre>
        </section>
      </div>
    </Teleport>

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
              <p v-if="activeService !== 'local' && activeMeta.description">
                {{ activeMeta.description }}
              </p>
            </div>
            <button type="button" class="icon-button" title="关闭" @click="closeService">
              <X class="h-5 w-5" />
            </button>
          </header>
          <div class="dialog-body" :class="{ 'dialog-body--list': activeService === 'local' }">
            <template v-if="activeService === 'local'">
              <ul class="local-model-list">
                <li v-for="model in localSpeechModels" :key="model.id">
                  <button
                    type="button"
                    class="local-model-item"
                    :class="{
                      'local-model-item--selected':
                        model.installed && draftLocalSpeechModelId === model.id,
                      'local-model-item--busy': model.installing,
                    }"
                    :disabled="model.installing"
                    @click="onLocalModelRowClick(model)"
                  >
                    <span class="local-model-item__copy">
                      <span class="local-model-item__title-row">
                        <strong class="local-model-item__title">{{ model.name }}</strong>
                        <span class="local-model-item__meta">
                          <span class="local-model-item__size">{{ model.sizeLabel }}</span>
                          <span v-if="model.installing" class="local-model-item__progress"
                            >{{ model.progress }}%</span
                          >
                          <span
                            v-else-if="model.error"
                            class="local-model-item__error"
                            :title="model.error"
                            >失败</span
                          >
                        </span>
                      </span>
                      <small class="local-model-item__desc">{{ model.description }}</small>
                    </span>
                    <UiListStatus
                      :status="localModelStatus(model)"
                      :title="localModelStatusTitle(model)"
                    />
                  </button>
                </li>
              </ul>
            </template>
            <template v-else-if="activeService === 'doubao'">
              <label>
                <span>服务版本</span>
                <select v-model="draftDoubaoSpeechPreset">
                  <option value="2.0-duration">2.0 小时版（推荐）</option>
                  <option value="2.0-concurrent">2.0 并发版</option>
                  <option value="1.0-duration">1.0 小时版</option>
                  <option value="1.0-concurrent">1.0 并发版</option>
                </select>
              </label>
              <label>
                <span>APP ID（旧版控制台）</span>
                <input
                  v-model.trim="draftDoubaoAppId"
                  autocomplete="off"
                  :placeholder="
                    activeMeta.configured ? '已配置，留空则保持不变' : '旧版控制台填写 APP ID'
                  "
                />
              </label>
              <label>
                <span>Access Token / API Key</span>
                <input
                  v-model.trim="draftDoubaoAccessToken"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="
                    activeMeta.configured
                      ? '已配置，留空则保持不变'
                      : '旧版填 Access Token；新版控制台可只填 API Key'
                  "
                />
              </label>
              <p class="dialog-note">
                旧版控制台需同时填写 APP ID 与 Access Token；新版控制台只需填写 API Key（填在上方
                Access Token
                字段即可）。「服务版本」须与火山控制台已开通的流式识别版本一致，可在控制台服务页查看
                Resource ID（bigasr=1.0，seedasr=2.0）。
              </p>
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
            </template>
            <p
              v-if="dialogMessage"
              class="dialog-message"
              :class="dialogFailed ? 'failed' : 'passed'"
            >
              {{ dialogMessage }}
            </p>
          </div>
          <footer v-if="activeService !== 'local'">
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
              class="secondary-button"
              type="button"
              :disabled="testingKey === activeService"
              @click="testActiveKey"
            >
              {{ testingKey === activeService ? "测试中..." : "测试" }}
            </button>
            <button
              v-if="activeMeta.configured"
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
import { Check, ChevronLeft, ExternalLink, ScrollText, Settings2, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import ModelTreeSelect, { type ModelTreeGroup } from "./ModelTreeSelect.vue";
import UiListStatus, { type UiListStatusKind } from "./UiListStatus.vue";
import WatsonIcon from "./WatsonIcon.vue";
import { resolveProviderIcon } from "@/constants/providers";
import { showUiMessage } from "@/composables/use-ui-message";
import { useAppFontScale, type AppFontScale } from "@/composables/use-app-font-scale";
import { saveViewPreferences, viewPreferences } from "@/utils/view-preferences";
import {
  getSystemLogs,
  getSupervisorSettings,
  getWatsonLogs,
  installLocalSpeechModel,
  listLocalSpeechModels,
  listProviders,
  listProviderModels,
  testSettingsApiKey,
  updateSupervisorSettings,
  type FeatureModelRef,
  type LocalSpeechModelId,
  type LocalSpeechModelStatus,
  type SupervisorSettings,
  type UtilityFeature,
} from "../api/api";

/** 与后端 LOCAL_SPEECH_MODELS 对齐；接口失败时仍展示可选列表 */
const DEFAULT_LOCAL_SPEECH_MODELS: LocalSpeechModelStatus[] = [
  {
    id: "zh-en-bilingual",
    name: "sherpa-onnx 中英双语",
    description: "流式 Zipformer，中英文实时识别",
    sizeLabel: "约 250MB",
    installed: false,
    installing: false,
    progress: 0,
  },
  {
    id: "zh-int8",
    name: "sherpa-onnx 中文 Int8",
    description: "量化中文流式模型，体积更小",
    sizeLabel: "约 160MB",
    installed: false,
    installing: false,
    progress: 0,
  },
];

type ServiceId = "local" | "qwen" | "doubao" | "tavily" | "brave" | "serper" | "firecrawl";
type RemoteServiceId = Exclude<ServiceId, "local">;

const props = withDefaults(
  defineProps<{
    showBack?: boolean;
    /** all=桌面完整页；services/diagnostics=移动端拆分页 */
    mode?: "all" | "services" | "diagnostics";
  }>(),
  { mode: "all" },
);
const emit = defineEmits<{ back: [] }>();

const mode = computed(() => props.mode);
const showServices = computed(() => mode.value === "all" || mode.value === "services");
const showDiagnostics = computed(() => mode.value === "all" || mode.value === "diagnostics");
const pageTitle = computed(() => {
  if (mode.value === "services") return "服务设置";
  if (mode.value === "diagnostics") return "高级与诊断";
  return "设置";
});

const watsonLogText = ref("");
const systemLogText = ref("");
const watsonLogFiles = ref<string[]>([]);
const systemLogFiles = ref<string[]>([]);
const activeLog = ref<"watson" | "system" | null>(null);
const activeLogText = computed(() =>
  activeLog.value === "watson" ? watsonLogText.value : systemLogText.value,
);
const activeLogFiles = computed(() =>
  activeLog.value === "watson" ? watsonLogFiles.value : systemLogFiles.value,
);

async function loadLog(kind: "watson" | "system") {
  const target = kind === "watson" ? watsonLogText : systemLogText;
  const files = kind === "watson" ? watsonLogFiles : systemLogFiles;
  activeLog.value = kind;
  target.value = "加载中…";
  try {
    const result =
      kind === "watson" ? await getWatsonLogs({ limit: 500 }) : await getSystemLogs({ limit: 500 });
    files.value = result.files;
    target.value = result.text || "暂无日志";
  } catch (error) {
    target.value = error instanceof Error ? error.message : "日志加载失败";
  }
}

function toggleAdvancedAnimations() {
  viewPreferences.advancedAnimations = !viewPreferences.advancedAnimations;
  saveViewPreferences();
}

const { fontScale, setFontScale } = useAppFontScale();

const fontScaleOptions: { value: AppFontScale; label: string }[] = [
  { value: "small", label: "小" },
  { value: "standard", label: "标准" },
  { value: "large", label: "大" },
];

const form = reactive({
  browserMode: "headless" as "headless" | "headed",
  webSearchProvider: "duckduckgo" as NonNullable<SupervisorSettings["webSearchProvider"]>,
  webFetchProvider: "native" as NonNullable<SupervisorSettings["webFetchProvider"]>,
  speechRecognitionMode: "local" as "local" | "qwen" | "doubao",
  speechRecognitionLanguage: "",
});
const featureModelKeys = reactive<Record<UtilityFeature, string>>({
  assistant: "",
});
const modelGroups = ref<ModelTreeGroup[]>([]);
const envNames = reactive<Record<"tavily" | "brave" | "serper" | "firecrawl", string>>({
  tavily: "TAVILY_API_KEY",
  brave: "BRAVE_API_KEY",
  serper: "SERPER_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
});
const configured = reactive<Record<ServiceId, boolean>>({
  local: false,
  qwen: false,
  doubao: false,
  tavily: false,
  brave: false,
  serper: false,
  firecrawl: false,
});
const serviceMeta: Record<ServiceId, { name: string; description: string; consoleUrl?: string }> = {
  local: {
    name: "本地模型识别",
    description: "sherpa-onnx",
  },
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

const speechServices = computed(() => (["local", "qwen", "doubao"] as const).map(serviceView));
const webServices = computed(() =>
  (["tavily", "brave", "serper", "firecrawl"] as const).map(serviceView),
);
const activeService = ref<ServiceId | null>(null);
const draftApiKey = ref("");
const draftDoubaoAppId = ref("");
const draftDoubaoAccessToken = ref("");
const draftDoubaoSpeechPreset =
  ref<NonNullable<SupervisorSettings["doubaoSpeechPreset"]>>("2.0-duration");
const draftLocalSpeechModelId = ref<LocalSpeechModelId>("zh-en-bilingual");
const localSpeechModels = ref<LocalSpeechModelStatus[]>(
  DEFAULT_LOCAL_SPEECH_MODELS.map((model) => ({ ...model })),
);
let localModelPollTimer: ReturnType<typeof setInterval> | null = null;

function mergeLocalSpeechModels(remote: LocalSpeechModelStatus[] | undefined): void {
  const byId = new Map((remote ?? []).map((model) => [model.id, model]));
  localSpeechModels.value = DEFAULT_LOCAL_SPEECH_MODELS.map((fallback) => {
    const hit = byId.get(fallback.id);
    return hit ? { ...fallback, ...hit } : { ...fallback };
  });
  syncLocalConfigured();
}

function syncLocalConfigured() {
  configured.local = localSpeechModels.value.some(
    (model) => model.id === draftLocalSpeechModelId.value && model.installed,
  );
}

function localModelStatus(model: LocalSpeechModelStatus): UiListStatusKind {
  if (model.installing) return "loading";
  if (model.error) return "error";
  if (model.installed) return "success";
  return "idle";
}

function localModelStatusTitle(model: LocalSpeechModelStatus): string | undefined {
  if (model.installing) return `安装中 ${model.progress}%`;
  if (model.error) return model.error;
  if (model.installed) return "已安装";
  return "点击安装";
}

async function onLocalModelRowClick(model: LocalSpeechModelStatus) {
  if (model.installing) return;
  if (!model.installed) {
    await installLocalModel(model.id);
    return;
  }
  if (draftLocalSpeechModelId.value === model.id && configured.local) return;
  draftLocalSpeechModelId.value = model.id;
  syncLocalConfigured();
  form.speechRecognitionMode = "local";
  try {
    apply(
      await updateSupervisorSettings({
        speechRecognitionMode: "local",
        localSpeechModelId: model.id,
      }),
    );
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "保存选用模型失败", "error");
  }
}
const draftEnvName = ref("");
const clearRequested = ref(false);
const testingKey = ref("");
const saving = ref(false);
const message = ref("");
const failed = ref(false);
const dialogMessage = ref("");
const dialogFailed = ref(false);

const activeMeta = computed(() => {
  const id = activeService.value ?? "local";
  return { ...serviceMeta[id], configured: configured[id] };
});
const isWebService = computed(() =>
  activeService.value
    ? ["tavily", "brave", "serper", "firecrawl"].includes(activeService.value)
    : false,
);

function serviceView(id: ServiceId) {
  return { id, ...serviceMeta[id], configured: configured[id] };
}

function featureKey(ref: FeatureModelRef): string {
  return `${ref.providerId}::${ref.modelId}`;
}

function parseFeatureKey(key: string): FeatureModelRef | null {
  if (!key) return null;
  const sep = key.indexOf("::");
  if (sep <= 0) return null;
  const providerId = Number.parseInt(key.slice(0, sep), 10);
  const modelId = key.slice(sep + 2);
  if (!Number.isInteger(providerId) || providerId <= 0 || !modelId) return null;
  return { providerId, modelId };
}

function applyFeatureModels(settings: SupervisorSettings) {
  const models = settings.featureModels ?? {};
  const ref = models.assistant;
  featureModelKeys.assistant = ref ? featureKey(ref) : "";
}

function apply(settings: SupervisorSettings) {
  form.browserMode = settings.browserMode ?? "headless";
  form.webSearchProvider = settings.webSearchProvider ?? "duckduckgo";
  form.webFetchProvider = settings.webFetchProvider ?? "native";
  const mode =
    settings.speechRecognitionMode === "browser"
      ? "local"
      : (settings.speechRecognitionMode ?? "local");
  form.speechRecognitionMode = mode === "qwen" || mode === "doubao" ? mode : "local";
  form.speechRecognitionLanguage = settings.speechRecognitionLanguage ?? "";
  envNames.tavily = settings.tavilyApiKeyEnv ?? "TAVILY_API_KEY";
  envNames.brave = settings.braveApiKeyEnv ?? "BRAVE_API_KEY";
  envNames.serper = settings.serperApiKeyEnv ?? "SERPER_API_KEY";
  envNames.firecrawl = settings.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY";
  configured.local = settings.localSpeechConfigured ?? false;
  configured.qwen = settings.speechApiKeyConfigured ?? false;
  configured.doubao = settings.doubaoSpeechConfigured ?? false;
  configured.tavily = settings.tavilyApiKeyConfigured ?? false;
  configured.brave = settings.braveApiKeyConfigured ?? false;
  configured.serper = settings.serperApiKeyConfigured ?? false;
  configured.firecrawl = settings.firecrawlApiKeyConfigured ?? false;
  draftDoubaoSpeechPreset.value = settings.doubaoSpeechPreset ?? "2.0-duration";
  draftLocalSpeechModelId.value = settings.localSpeechModelId ?? "zh-en-bilingual";
  mergeLocalSpeechModels(settings.localSpeechModels);
  // 后端若未返回 models 字段，仍用 settings 里的配置态兜底
  if (settings.localSpeechConfigured && !configured.local) {
    configured.local = true;
  }
  applyFeatureModels(settings);
}

function stopLocalModelPolling() {
  if (localModelPollTimer) {
    clearInterval(localModelPollTimer);
    localModelPollTimer = null;
  }
}

function startLocalModelPolling() {
  stopLocalModelPolling();
  localModelPollTimer = setInterval(() => {
    void refreshLocalSpeechModels();
    if (!localSpeechModels.value.some((model) => model.installing)) {
      stopLocalModelPolling();
      // 安装完成后自动选中该项并打勾
      const justReady = localSpeechModels.value.find(
        (model) => model.id === draftLocalSpeechModelId.value && model.installed,
      );
      if (justReady) syncLocalConfigured();
    }
  }, 1000);
}

async function refreshLocalSpeechModels() {
  try {
    const result = await listLocalSpeechModels();
    mergeLocalSpeechModels(result.models);
  } catch {
    // 接口不可用时保留本地目录列表，避免弹窗空白
    if (!localSpeechModels.value.length) {
      mergeLocalSpeechModels(undefined);
    }
  }
}

async function installLocalModel(id: LocalSpeechModelId) {
  draftLocalSpeechModelId.value = id;
  dialogMessage.value = "";
  dialogFailed.value = false;
  // 立刻进入 loading，避免接口慢时看起来没反应
  localSpeechModels.value = localSpeechModels.value.map((model) =>
    model.id === id
      ? { ...model, installing: true, progress: Math.max(model.progress, 1), error: undefined }
      : model,
  );
  try {
    const result = await installLocalSpeechModel(id);
    mergeLocalSpeechModels(result.models);
    startLocalModelPolling();
    showUiMessage("开始安装本地语音模型", "success");
  } catch (error) {
    localSpeechModels.value = localSpeechModels.value.map((model) =>
      model.id === id
        ? {
            ...model,
            installing: false,
            error: error instanceof Error ? error.message : "安装失败",
          }
        : model,
    );
    dialogFailed.value = true;
    dialogMessage.value = error instanceof Error ? error.message : "安装失败";
    showUiMessage(dialogMessage.value, "error");
  }
}

function openService(id: ServiceId) {
  activeService.value = id;
  draftApiKey.value = "";
  draftDoubaoAppId.value = "";
  draftDoubaoAccessToken.value = "";
  draftEnvName.value = id in envNames ? envNames[id as keyof typeof envNames] : "";
  clearRequested.value = false;
  dialogMessage.value = "";
  dialogFailed.value = false;
  if (id === "local") {
    if (!localSpeechModels.value.length) mergeLocalSpeechModels(undefined);
    void refreshLocalSpeechModels().then(() => {
      if (localSpeechModels.value.some((model) => model.installing)) startLocalModelPolling();
    });
  }
}

function closeService() {
  activeService.value = null;
  stopLocalModelPolling();
}

function clearActiveKey() {
  if (!activeService.value || activeService.value === "local") return;
  draftApiKey.value = "";
  draftDoubaoAppId.value = "";
  draftDoubaoAccessToken.value = "";
  clearRequested.value = true;
  dialogMessage.value = "保存后将清除密钥";
  dialogFailed.value = false;
}

async function testActiveKey() {
  if (!activeService.value || activeService.value === "local") return;
  testingKey.value = activeService.value;
  dialogMessage.value = "";
  try {
    if (activeService.value === "doubao") {
      await testSettingsApiKey("doubao", undefined, {
        appId: draftDoubaoAppId.value || undefined,
        accessToken: draftDoubaoAccessToken.value || undefined,
        preset: draftDoubaoSpeechPreset.value,
      });
    } else {
      await testSettingsApiKey(activeService.value, draftApiKey.value || undefined);
    }
    dialogFailed.value = false;
    dialogMessage.value = "连接测试通过";
  } catch (error) {
    dialogFailed.value = true;
    dialogMessage.value = error instanceof Error ? error.message : "连接测试失败";
  } finally {
    testingKey.value = "";
  }
}

function buildFeatureModels(): NonNullable<SupervisorSettings["featureModels"]> {
  const next: NonNullable<SupervisorSettings["featureModels"]> = {};
  const ref = parseFeatureKey(featureModelKeys.assistant);
  if (ref) next.assistant = ref;
  return next;
}

function mainPatch(): Partial<SupervisorSettings> {
  return {
    browserMode: form.browserMode,
    webSearchProvider: form.webSearchProvider,
    webFetchProvider: form.webFetchProvider,
    speechRecognitionMode: form.speechRecognitionMode,
    speechRecognitionLanguage: form.speechRecognitionLanguage,
    localSpeechModelId: draftLocalSpeechModelId.value,
    tavilyApiKeyEnv: envNames.tavily,
    braveApiKeyEnv: envNames.brave,
    serperApiKeyEnv: envNames.serper,
    firecrawlApiKeyEnv: envNames.firecrawl,
    featureModels: buildFeatureModels(),
  };
}

async function saveService() {
  if (!activeService.value) return;
  saving.value = true;
  dialogMessage.value = "";
  dialogFailed.value = false;
  try {
    const patch = mainPatch();
    const id = activeService.value;
    if (id === "local") {
      const selected = localSpeechModels.value.find(
        (model) => model.id === draftLocalSpeechModelId.value,
      );
      if (!selected?.installed) {
        dialogFailed.value = true;
        dialogMessage.value = "请先安装所选本地模型";
        return;
      }
      patch.speechRecognitionMode = "local";
      patch.localSpeechModelId = draftLocalSpeechModelId.value;
      form.speechRecognitionMode = "local";
    } else if (id === "doubao") {
      const nextAppId = draftDoubaoAppId.value.trim();
      const nextToken = draftDoubaoAccessToken.value.trim();
      if (!clearRequested.value && !configured.doubao && !nextAppId && !nextToken) {
        dialogFailed.value = true;
        dialogMessage.value = "请填写 Access Token 或 API Key（旧版控制台需同时填写 APP ID）";
        return;
      }
      if (!clearRequested.value && !configured.doubao && nextAppId && !nextToken) {
        dialogFailed.value = true;
        dialogMessage.value = "填写 APP ID 时需同时填写 Access Token";
        return;
      }
      if (draftDoubaoAppId.value || clearRequested.value) {
        Object.assign(patch, {
          doubaoSpeechAppId: clearRequested.value ? "" : nextAppId,
        });
      }
      if (draftDoubaoAccessToken.value || clearRequested.value) {
        Object.assign(patch, {
          doubaoSpeechAccessToken: clearRequested.value ? "" : nextToken,
        });
      }
      patch.doubaoSpeechPreset = draftDoubaoSpeechPreset.value;
      patch.speechRecognitionMode = "doubao";
      form.speechRecognitionMode = "doubao";
    } else if (id === "qwen") {
      patch.speechRecognitionMode = "qwen";
      form.speechRecognitionMode = "qwen";
      if (draftApiKey.value || clearRequested.value) {
        Object.assign(patch, { speechApiKey: clearRequested.value ? "" : draftApiKey.value });
      }
    } else {
      const keyFields: Record<
        Exclude<RemoteServiceId, "doubao" | "qwen">,
        keyof SupervisorSettings
      > = {
        tavily: "tavilyApiKey",
        brave: "braveApiKey",
        serper: "serperApiKey",
        firecrawl: "firecrawlApiKey",
      };
      if (draftApiKey.value || clearRequested.value) {
        Object.assign(patch, { [keyFields[id]]: clearRequested.value ? "" : draftApiKey.value });
      }
    }
    if (id in envNames) {
      envNames[id as keyof typeof envNames] = draftEnvName.value;
      Object.assign(patch, { [`${id}ApiKeyEnv`]: draftEnvName.value });
    }
    apply(await updateSupervisorSettings(patch));
    closeService();
    failed.value = false;
    message.value = "已保存";
    showUiMessage("设置已保存", "success");
  } catch (error) {
    dialogFailed.value = true;
    const text = error instanceof Error ? error.message : "保存失败";
    dialogMessage.value = text;
    showUiMessage(text, "error");
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
    showUiMessage("设置已保存", "success");
  } catch (error) {
    failed.value = true;
    const text = error instanceof Error ? error.message : "保存失败";
    message.value = text;
    showUiMessage(text, "error");
  } finally {
    saving.value = false;
  }
}

async function loadModelOptions() {
  const providers = (await listProviders()).filter((provider) => provider.isEnabled);
  const groups: ModelTreeGroup[] = [];
  for (const provider of providers) {
    const models = await listProviderModels(provider.id);
    groups.push({
      id: provider.id,
      name: provider.name,
      icon: resolveProviderIcon(provider.id, provider.name, provider.icon),
      models: models.map((model) => ({
        value: featureKey({ providerId: Number(provider.id), modelId: model.modelId }),
        name: model.name || model.modelId,
      })),
    });
  }
  modelGroups.value = groups;
}

onMounted(async () => {
  try {
    await loadModelOptions();
    apply(await getSupervisorSettings());
  } catch (error) {
    failed.value = true;
    message.value = error instanceof Error ? error.message : "读取设置失败";
  }
});

onBeforeUnmount(() => {
  stopLocalModelPolling();
});
</script>

<style scoped>
.settings-card-title-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 28px;
}

.settings-card-title-row small {
  color: var(--app-text-muted);
  font-size: var(--app-font-caption);
  font-weight: var(--app-font-weight-regular);
  text-align: left;
}
.settings-watson-title,
.settings-log-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.settings-watson-title svg {
  width: 21px;
  height: 21px;
  color: var(--app-accent);
}
.settings-log-title svg {
  width: 19px;
  height: 19px;
  color: var(--app-accent);
}

.settings-log {
  min-height: 0;
  flex: 1;
  overflow: auto;
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
  background: #111827;
  color: #d1fae5;
  font:
    12px/1.5 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  white-space: pre-wrap;
}
.settings-log-dialog {
  width: min(920px, calc(100vw - 32px));
  height: min(720px, calc(100vh - 32px));
}
.settings-page,
.settings-header {
  background: var(--app-settings-bg);
}
.settings-header {
  display: flex;
  align-items: center;
  min-height: 64px;
  padding-inline: 24px;
  border-bottom: 1px solid var(--app-border);
  border-color: var(--app-border);
  color: var(--app-text-primary);
}
.settings-scroll {
  padding: 24px;
}
.settings-content {
  display: grid;
  width: min(920px, 100%);
  margin-inline: auto;
  gap: 20px;
}
.settings-save-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.settings-card {
  overflow: hidden;
  padding: 0 20px 10px;
  border: 0;
  border-radius: 12px;
  background: var(--app-settings-card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}
.settings-card h2 {
  margin: 0 -20px;
  padding: 14px 20px 11px;
  border-bottom: 1px solid var(--app-border-subtle);
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-text-primary);
}
.settings-card__hint {
  margin: 12px 0 0;
  font-size: var(--app-font-caption);
  line-height: 1.5;
  color: var(--app-text-muted);
}
.settings-field {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 50px;
  border-bottom: 1px solid var(--app-border-subtle);
  font-size: var(--app-font-body);
  color: var(--app-text-primary);
}
.settings-field :deep(.model-tree-select) {
  width: min(360px, 100%);
  justify-self: end;
}
.settings-field > span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-field__hint {
  font-size: var(--app-font-micro);
  color: var(--app-text-muted);
}
select,
input {
  width: 100%;
  min-height: 34px;
  padding: 6px 10px;
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
  min-height: 56px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.service-row:last-child {
  border-bottom: 0;
}
.service-row--switch {
  grid-template-columns: minmax(0, 1fr) auto;
}
.service-row--font-scale {
  grid-template-columns: minmax(0, 1fr) auto;
}
.font-scale-segment {
  display: inline-flex;
  flex: none;
  padding: 2px;
  border-radius: 8px;
  background: var(--app-hover);
}
.font-scale-segment button {
  min-width: 44px;
  padding: 5px 10px;
  border-radius: 6px;
  color: var(--app-text-muted);
  font-size: var(--app-font-control);
  font-weight: var(--app-font-weight-medium);
}
.font-scale-segment button.active {
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}
.settings-switch {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.18s ease;
}
.settings-switch--on {
  background: #07c160;
}
.settings-switch--off {
  background: #e5e5e5;
}
:global(html[data-theme="dark"]) .settings-switch--off {
  background: #4b5563;
}
.settings-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
  transition: transform 0.18s ease;
}
.settings-switch--on .settings-switch__thumb {
  transform: translateX(20px);
}
.service-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.service-copy strong {
  font-size: var(--app-font-body);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-text-primary);
}
.service-copy span {
  font-size: var(--app-font-caption);
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
  font-size: var(--app-font-caption);
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
  font-size: var(--app-font-title);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-text-primary);
}
.service-dialog header p {
  margin-top: 2px;
  font-size: var(--app-font-caption);
  color: var(--app-text-muted);
}
.dialog-body {
  overflow-y: auto;
  padding: 18px 20px;
}
.dialog-body--list {
  padding: 0;
}
.dialog-body label {
  display: block;
  margin-bottom: 16px;
}
.dialog-body label span {
  display: block;
  margin-bottom: 6px;
  font-size: var(--app-font-control);
  color: var(--app-text-secondary);
}
.local-model-list {
  margin: 0;
}
.local-model-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--app-border-subtle);
  cursor: pointer;
}
.local-model-list li:last-child .local-model-item {
  border-bottom: none;
}
.local-model-item:hover:not(:disabled) {
  background: var(--app-popup-hover, var(--app-hover));
}
.local-model-item:hover:not(:disabled) .local-model-item__title {
  color: var(--app-accent);
}
.local-model-item--selected .local-model-item__title,
.local-model-item--selected:hover:not(:disabled) .local-model-item__title {
  color: #07c160;
}
.local-model-item--busy {
  cursor: default;
  pointer-events: none;
}
.local-model-item__copy {
  flex: 1;
  min-width: 0;
}
.local-model-item__title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.local-model-item__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--app-font-body);
  font-weight: var(--app-font-weight-regular);
  line-height: 1.35;
  color: var(--app-text-secondary);
  transition: color 0.12s ease;
}
.local-model-item__meta {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  line-height: 1.25;
}
.local-model-item__size {
  font-size: var(--app-font-micro);
  color: var(--app-text-muted);
}
.local-model-item__desc {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--app-font-caption);
  line-height: 1.35;
  color: var(--app-text-muted);
}
.local-model-item__progress,
.local-model-item__error {
  font-size: var(--app-font-micro);
  font-variant-numeric: tabular-nums;
}
.local-model-item__progress {
  color: var(--app-accent);
}
.local-model-item__error {
  color: #fa5151;
}
.dialog-message {
  margin-top: 12px;
  font-size: var(--app-font-control);
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
  font-size: var(--app-font-caption);
  color: var(--app-accent);
}
.secondary-button,
.danger-button {
  height: 34px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: var(--app-font-control);
  background: var(--app-hover);
  color: var(--app-text-secondary);
}
.danger-button {
  color: var(--app-danger, #dc2626);
}
@media (max-width: 767px) {
  .settings-page {
    background: var(--m-page-bg, var(--app-settings-bg));
  }
  .settings-scroll {
    padding: 0 0 calc(12px + env(safe-area-inset-bottom));
  }
  .settings-content {
    width: 100%;
    gap: 0;
  }
  .settings-card {
    margin-top: 8px;
    padding: 0 16px;
    border-radius: 0;
    box-shadow: none;
    background: var(--m-surface, var(--app-settings-card));
  }
  .settings-card:first-child {
    margin-top: 0;
  }
  .settings-card h2,
  .settings-card-title-row {
    display: block;
    margin: 0 -16px;
    padding: 16px 16px 8px;
    border: 0;
    background: var(--m-page-bg, var(--app-settings-bg));
    color: var(--m-text-secondary, var(--app-text-secondary));
    font-size: var(--app-font-control);
    font-weight: var(--app-font-weight-regular);
  }
  .settings-card-title-row small {
    display: none;
  }
  .settings-watson-title {
    gap: 6px;
    font-size: var(--app-font-control);
    font-weight: var(--app-font-weight-regular);
  }
  .settings-watson-title svg {
    width: 16px;
    height: 16px;
  }
  .settings-field {
    grid-template-columns: 1fr;
    gap: 8px;
    min-height: 0;
    padding: 14px 0;
  }
  .settings-field :deep(.model-tree-select) {
    width: 100%;
    justify-self: stretch;
  }
  .settings-field > span {
    font-size: var(--app-font-body-strong);
  }
  select,
  input {
    min-height: 44px;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: var(--app-font-body-strong);
    background: var(--m-control-bg, var(--app-settings-bg));
  }
  .service-list {
    padding-top: 0;
  }
  .service-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    min-height: 56px;
    padding: 12px 0;
  }
  .service-copy strong {
    font-size: var(--app-font-title);
    font-weight: var(--app-font-weight-regular);
  }
  .service-copy span {
    font-size: var(--app-font-control);
  }
  .configure-button {
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: var(--app-font-body);
  }
  .settings-save-bar {
    position: sticky;
    bottom: 0;
    z-index: 3;
    margin-top: 16px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--m-divider, var(--app-border-subtle));
    background: color-mix(in srgb, var(--m-page-bg, var(--app-settings-bg)) 92%, transparent);
    backdrop-filter: blur(12px);
  }
  .save-button {
    width: 100%;
    min-height: 44px;
    border-radius: 10px;
    font-size: var(--app-font-title);
    font-weight: var(--app-font-weight-medium);
  }
  .service-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .service-dialog {
    width: 100%;
    max-height: 86vh;
    border-radius: 12px 12px 0 0;
  }
  .service-dialog footer {
    flex-wrap: wrap;
  }
  .console-link {
    width: 100%;
    margin-bottom: 4px;
  }
  .settings-header {
    display: grid;
    min-height: 52px;
    height: 52px;
    padding-inline: 10px;
    border-bottom: 1px solid var(--app-header-divider, var(--app-border-subtle));
    background: var(--m-header-bg, var(--app-list-header-bg));
    grid-template-columns: var(--m-action-hit-size, 40px) minmax(0, 1fr) var(
        --m-action-hit-size,
        40px
      );
    align-items: center;
  }
  .settings-header .m-mobile-header__title {
    font-weight: 500;
  }
  .settings-header .settings-back {
    display: grid;
    width: var(--m-action-hit-size, 40px);
    height: var(--m-action-hit-size, 40px);
    margin: 0;
    place-items: center;
  }
  .settings-header .settings-back svg {
    width: 22px;
    height: 22px;
  }
}
</style>
