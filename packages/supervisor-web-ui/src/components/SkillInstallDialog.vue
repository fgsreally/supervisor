<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="skill-install-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      @click.self="close"
    >
      <section
        class="skill-install-dialog w-full max-w-xl max-h-[90vh] overflow-hidden rounded-lg shadow-xl border flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-install-title"
      >
        <header class="h-14 px-5 border-b flex items-center shrink-0 gap-2">
          <h2 id="skill-install-title" class="text-[16px] font-medium flex-1">引入 Skill</h2>
          <button type="button" class="skill-install-icon-btn" title="关闭" @click="close">
            <X class="w-5 h-5" />
          </button>
        </header>

        <div class="px-5 pt-3 flex gap-1 shrink-0">
          <button
            type="button"
            class="skill-install-tab px-2.5 py-1 rounded text-[12px]"
            :class="mode === 'search' ? 'skill-install-tab--active' : ''"
            @click="mode = 'search'"
          >
            联网搜索
          </button>
          <button
            type="button"
            class="skill-install-tab px-2.5 py-1 rounded text-[12px]"
            :class="mode === 'link' ? 'skill-install-tab--active' : ''"
            @click="mode = 'link'"
          >
            链接安装
          </button>
        </div>

        <div class="p-5 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          <template v-if="mode === 'search'">
            <div class="relative shrink-0 flex gap-1">
              <div class="relative flex-1">
                <Search
                  class="w-4 h-4 absolute left-2.5 top-2.5 skill-install-muted"
                />
                <input
                  v-model="query"
                  type="text"
                  class="skill-install-input w-full rounded-md pl-8 pr-2 py-2 text-[13px]"
                  placeholder="搜索 skills.sh，例如 typescript / react"
                  :disabled="searching || installingId !== null"
                  @keyup.enter="runSearch"
                />
              </div>
              <button
                type="button"
                class="skill-install-icon-btn shrink-0"
                title="搜索"
                :disabled="searching || installingId !== null || !query.trim()"
                @click="runSearch"
              >
                <Loader2 v-if="searching" class="w-4 h-4 animate-spin" />
                <Search v-else class="w-4 h-4" />
              </button>
            </div>

            <div
              v-if="searchError"
              class="text-[12px] skill-install-error shrink-0"
            >
              {{ searchError }}
            </div>

            <div
              v-else-if="searching"
              class="flex-1 flex items-center justify-center text-[13px] skill-install-muted"
            >
              <Loader2 class="w-4 h-4 animate-spin mr-2" />
              搜索中…
            </div>

            <ul
              v-else-if="results.length"
              class="flex-1 min-h-0 overflow-y-auto custom-scrollbar border rounded-md skill-install-list"
            >
              <li
                v-for="hit in results"
                :key="hit.id"
                class="skill-install-item flex items-start gap-2 px-3 py-2.5 border-b"
              >
                <div class="min-w-0 flex-1">
                  <div class="text-[13px] font-medium truncate">{{ hit.name }}</div>
                  <div class="text-[11px] skill-install-muted truncate mt-0.5">
                    {{ hit.source }} · {{ formatInstalls(hit.installs) }} installs
                  </div>
                </div>
                <button
                  type="button"
                  class="skill-install-icon-btn shrink-0"
                  :title="`安装 ${hit.name}`"
                  :disabled="installingId !== null"
                  @click="installFromHit(hit)"
                >
                  <Loader2
                    v-if="installingId === hit.id"
                    class="w-4 h-4 animate-spin"
                  />
                  <Download v-else class="w-4 h-4" />
                </button>
              </li>
            </ul>

            <div
              v-else-if="searched"
              class="flex-1 flex items-center justify-center text-[13px] skill-install-muted"
            >
              未找到匹配的 Skill
            </div>
            <div
              v-else
              class="flex-1 flex items-center justify-center text-[13px] skill-install-muted text-center px-6"
            >
              输入关键词搜索 skills.sh 公开目录
            </div>
          </template>

          <template v-else>
            <label class="block text-[13px]">
              <span class="skill-install-muted mb-1.5 block">源地址</span>
              <input
                v-model="link"
                type="text"
                class="skill-install-input w-full rounded-md px-3 py-2 text-[13px] font-mono"
                placeholder="owner/repo@skill | GitHub URL | /local/path"
                :disabled="installingId !== null"
                @keyup.enter="installFromLink"
              />
            </label>
            <p class="text-[11px] skill-install-muted leading-relaxed">
              支持 skills.sh 简写（owner/repo@skill）、GitHub 链接或本地目录。
            </p>
            <p v-if="linkError" class="text-[12px] skill-install-error">{{ linkError }}</p>
            <div class="flex justify-end">
              <button
                type="button"
                class="skill-install-primary-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px]"
                :disabled="installingId !== null || !link.trim()"
                @click="installFromLink"
              >
                <Loader2 v-if="installingId === '__link__'" class="w-4 h-4 animate-spin" />
                <Download v-else class="w-4 h-4" />
                {{ installingId === "__link__" ? "安装中…" : "安装" }}
              </button>
            </div>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Download, Loader2, Search, X } from "lucide-vue-next";
import {
  installSkill,
  searchSkills,
  type SkillsShSearchHit,
} from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  installed: [slug: string];
}>();

const mode = ref<"search" | "link">("search");
const query = ref("");
const link = ref("");
const searching = ref(false);
const searched = ref(false);
const searchError = ref<string | null>(null);
const linkError = ref<string | null>(null);
const results = ref<SkillsShSearchHit[]>([]);
const installingId = ref<string | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    mode.value = "search";
    query.value = "";
    link.value = "";
    results.value = [];
    searched.value = false;
    searchError.value = null;
    linkError.value = null;
    installingId.value = null;
  },
);

function close() {
  if (installingId.value) return;
  emit("close");
}

function formatInstalls(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

async function runSearch() {
  const q = query.value.trim();
  if (!q) return;
  searching.value = true;
  searchError.value = null;
  searched.value = true;
  try {
    const result = await searchSkills(q, { limit: 20 });
    results.value = result.skills;
  } catch (err) {
    results.value = [];
    searchError.value = err instanceof Error ? err.message : String(err);
  } finally {
    searching.value = false;
  }
}

async function installFromHit(hit: SkillsShSearchHit) {
  installingId.value = hit.id;
  searchError.value = null;
  try {
    const resource = await installSkill(`${hit.source}@${hit.name}`, hit.name);
    showUiMessage(`已安装 ${hit.name}`, "success");
    emit("installed", resource.slug);
    emit("close");
  } catch (err) {
    searchError.value = err instanceof Error ? err.message : String(err);
  } finally {
    installingId.value = null;
  }
}

async function installFromLink() {
  const source = link.value.trim();
  if (!source) return;
  installingId.value = "__link__";
  linkError.value = null;
  try {
    const resource = await installSkill(source);
    showUiMessage(`已安装 ${resource.slug}`, "success");
    emit("installed", resource.slug);
    emit("close");
  } catch (err) {
    linkError.value = err instanceof Error ? err.message : String(err);
  } finally {
    installingId.value = null;
  }
}
</script>

<style scoped>
.skill-install-overlay {
  background: color-mix(in srgb, #000 45%, transparent);
}

.skill-install-dialog {
  background: var(--app-settings-card, var(--app-bg));
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.skill-install-icon-btn {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-nav-icon, var(--app-text-secondary));
  transition: background-color 0.15s;
}

.skill-install-icon-btn:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.skill-install-icon-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.skill-install-tab {
  background: var(--app-settings-card);
  color: var(--app-text-secondary);
  border: 1px solid var(--app-border);
}

.skill-install-tab--active {
  background: var(--app-accent);
  color: #fff;
  border-color: var(--app-accent);
}

.skill-install-input {
  background: var(--app-list-search-bg, var(--app-input-bg, var(--app-bg)));
  border: 1px solid var(--app-border);
  color: var(--app-text-primary);
}

.skill-install-input:focus {
  outline: none;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-accent) 50%, transparent);
}

.skill-install-muted {
  color: var(--app-text-muted);
}

.skill-install-error {
  color: var(--app-error, #d33);
}

.skill-install-list {
  border-color: var(--app-border-subtle);
  background: var(--app-settings-bg, var(--app-bg));
}

.skill-install-item {
  border-color: var(--app-border-subtle);
}

.skill-install-item:last-child {
  border-bottom: none;
}

.skill-install-primary-btn {
  background: var(--app-accent);
  color: var(--app-button-text, #fff);
}

.skill-install-primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

header {
  border-color: var(--app-border);
}
</style>
