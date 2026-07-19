<template>
  <div class="flex-1 flex flex-col min-w-0 overflow-hidden settings-page">
    <div class="h-16 flex items-center px-6 border-b settings-header">
      <h1 class="text-[17px] font-medium">设置</h1>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div class="max-w-2xl space-y-5">
        <section class="settings-card">
          <h2>浏览器</h2>
          <label>
            <span>启动模式</span>
            <select v-model="form.browserMode">
              <option value="headless">无头模式（默认）</option>
              <option value="headed">有头模式</option>
            </select>
          </label>
          <p>有头模式会显示 Supervisor 独立启动的 Chromium 窗口，需要桌面环境。</p>
        </section>

        <section class="settings-card">
          <h2>Web Search 与 Fetch</h2>
          <label>
            <span>搜索服务</span>
            <select v-model="form.webSearchProvider">
              <option value="duckduckgo">DuckDuckGo HTML（免费）</option>
              <option value="tavily">Tavily Search</option>
              <option value="brave">Brave Search</option>
              <option value="serper">Serper Google Search</option>
              <option value="firecrawl">Firecrawl Search</option>
            </select>
          </label>
          <label>
            <span>网页读取服务</span>
            <select v-model="form.webFetchProvider">
              <option value="native">原生 Fetch（默认）</option>
              <option value="native-then-tavily">原生失败后使用 Tavily</option>
              <option value="native-then-firecrawl">原生失败后使用 Firecrawl</option>
              <option value="tavily">仅 Tavily Extract</option>
              <option value="firecrawl">仅 Firecrawl Scrape</option>
            </select>
          </label>
          <label>
            <span>Tavily API Key 环境变量</span>
            <input v-model.trim="form.tavilyApiKeyEnv" placeholder="TAVILY_API_KEY" />
          </label>
          <label>
            <span>Brave API Key 环境变量</span>
            <input v-model.trim="form.braveApiKeyEnv" placeholder="BRAVE_API_KEY" />
          </label>
          <label>
            <span>Serper API Key 环境变量</span>
            <input v-model.trim="form.serperApiKeyEnv" placeholder="SERPER_API_KEY" />
          </label>
          <label>
            <span>Firecrawl API Key 环境变量</span>
            <input v-model.trim="form.firecrawlApiKeyEnv" placeholder="FIRECRAWL_API_KEY" />
          </label>
          <p>这里只保存环境变量名称，不保存或向模型暴露 API Key。修改后新建的会话生效。</p>
        </section>

        <div class="flex items-center gap-3">
          <button class="save-button" type="button" :disabled="saving" @click="save">
            {{ saving ? "保存中..." : "保存" }}
          </button>
          <span v-if="message" class="text-sm" :class="failed ? 'text-red-500' : 'text-green-600'">
            {{ message }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import {
  getSupervisorSettings,
  updateSupervisorSettings,
  type SupervisorSettings,
} from "../api/api";

const form = reactive<
  Required<
    Pick<
      SupervisorSettings,
      | "browserMode"
      | "webSearchProvider"
      | "webFetchProvider"
      | "tavilyApiKeyEnv"
      | "braveApiKeyEnv"
      | "serperApiKeyEnv"
      | "firecrawlApiKeyEnv"
    >
  >
>({
  browserMode: "headless",
  webSearchProvider: "duckduckgo",
  webFetchProvider: "native",
  tavilyApiKeyEnv: "TAVILY_API_KEY",
  braveApiKeyEnv: "BRAVE_API_KEY",
  serperApiKeyEnv: "SERPER_API_KEY",
  firecrawlApiKeyEnv: "FIRECRAWL_API_KEY",
});
const saving = ref(false);
const message = ref("");
const failed = ref(false);

function apply(settings: SupervisorSettings) {
  form.browserMode = settings.browserMode ?? "headless";
  form.webSearchProvider = settings.webSearchProvider ?? "duckduckgo";
  form.webFetchProvider = settings.webFetchProvider ?? "native";
  form.tavilyApiKeyEnv = settings.tavilyApiKeyEnv ?? "TAVILY_API_KEY";
  form.braveApiKeyEnv = settings.braveApiKeyEnv ?? "BRAVE_API_KEY";
  form.serperApiKeyEnv = settings.serperApiKeyEnv ?? "SERPER_API_KEY";
  form.firecrawlApiKeyEnv = settings.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY";
}

onMounted(async () => {
  try {
    apply(await getSupervisorSettings());
  } catch (error) {
    failed.value = true;
    message.value = error instanceof Error ? error.message : "读取设置失败";
  }
});

async function save() {
  saving.value = true;
  message.value = "";
  try {
    apply(await updateSupervisorSettings({ ...form }));
    failed.value = false;
    message.value = "已保存";
  } catch (error) {
    failed.value = true;
    message.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
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
.settings-card {
  padding: 20px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  background: var(--app-settings-card);
}
.settings-card h2 {
  margin-bottom: 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.settings-card label {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  font-size: 14px;
  color: var(--app-text-primary);
}
.settings-card select,
.settings-card input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}
.settings-card p {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-text-muted);
}
.save-button {
  padding: 8px 22px;
  border-radius: 6px;
  color: white;
  background: #07c160;
}
.save-button:disabled {
  opacity: 0.55;
}
@media (max-width: 640px) {
  .settings-card label {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
