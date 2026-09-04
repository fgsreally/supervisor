<template>
  <ResponsiveDialog
    :open="open"
    :title="mode === 'search' ? t('resource.searchSkill') : t('resource.importSkill')"
    width="md"
    :size="mode === 'search' ? 'tall' : 'auto'"
    :dismiss-on-backdrop="!installingId"
    @close="close"
  >
    <div class="skill-install__body">
      <div class="skill-install__content">
        <template v-if="mode === 'search'">
          <div class="relative shrink-0">
            <Search class="w-4 h-4 absolute left-2.5 top-2.5 skill-install-muted" />
            <input
              v-model="query"
              type="text"
              class="skill-install-input w-full rounded-md pl-8 pr-8 py-2 text-[13px]"
              :placeholder="t('resource.skillSearchPlaceholder')"
              :disabled="installingId !== null"
            />
            <Loader2
              v-if="searching"
              class="w-4 h-4 absolute right-2.5 top-2.5 animate-spin skill-install-muted"
            />
          </div>

          <div v-if="searchError" class="text-[12px] skill-install-error shrink-0">
            {{ searchError }}
          </div>

          <div
            v-else-if="searching"
            class="flex-1 flex items-center justify-center text-[13px] skill-install-muted"
          >
            <Loader2 class="w-4 h-4 animate-spin mr-2" />
            {{ t("common.searching") }}
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
                :title="t('resource.installNamed', { name: hit.name })"
                :disabled="installingId !== null"
                @click="installFromHit(hit)"
              >
                <Loader2 v-if="installingId === hit.id" class="w-4 h-4 animate-spin" />
                <Download v-else class="w-4 h-4" />
              </button>
            </li>
          </ul>

          <div
            v-else-if="searched"
            class="flex-1 flex items-center justify-center text-[13px] skill-install-muted"
          >
            {{ t("resource.noMatchingSkill") }}
          </div>
          <div
            v-else
            class="flex-1 flex items-center justify-center text-[13px] skill-install-muted text-center px-6"
          >
            {{ t("resource.skillSearchHint") }}
          </div>
        </template>

        <template v-else>
          <label class="block text-[13px]">
            <span class="skill-install-muted mb-1.5 block">{{ t("resource.source") }}</span>
            <input
              ref="linkInputRef"
              v-model="link"
              type="text"
              class="skill-install-input w-full rounded-md px-3 py-2 text-[13px] font-mono"
              placeholder="owner/repo@skill | GitHub URL | /local/path"
              :disabled="installingId !== null"
              @keyup.enter="installFromLink"
            />
          </label>
          <p class="text-[11px] skill-install-muted leading-relaxed">
            {{ t("resource.skillImportHint") }}
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
              {{ installingId === "__link__" ? t("resource.installing") : t("resource.install") }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { Download, Loader2, Search } from "lucide-vue-next";
import { installSkill, searchSkills, type SkillsShSearchHit } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import { useI18n } from "@/i18n";

const props = defineProps<{
  open: boolean;
  mode: "search" | "link";
}>();
const { t } = useI18n();

const emit = defineEmits<{
  close: [];
  installed: [slug: string];
}>();

const query = ref("");
const link = ref("");
const linkInputRef = ref<HTMLInputElement | null>(null);
const searching = ref(false);
const searched = ref(false);
const searchError = ref<string | null>(null);
const linkError = ref<string | null>(null);
const results = ref<SkillsShSearchHit[]>([]);
const installingId = ref<string | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchGeneration = 0;

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    query.value = "";
    link.value = "";
    results.value = [];
    searched.value = false;
    searchError.value = null;
    linkError.value = null;
    installingId.value = null;
    if (props.mode === "link") {
      await nextTick();
      linkInputRef.value?.focus();
    }
  },
);

watch(query, (value) => {
  if (!props.open || props.mode !== "search") return;
  if (searchTimer) clearTimeout(searchTimer);
  const q = value.trim();
  if (!q) {
    searchGeneration += 1;
    searching.value = false;
    searched.value = false;
    searchError.value = null;
    results.value = [];
    return;
  }
  searchTimer = setTimeout(() => void runSearch(), 320);
});

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
  const generation = ++searchGeneration;
  searching.value = true;
  searchError.value = null;
  searched.value = true;
  try {
    const result = await searchSkills(q, { limit: 20 });
    if (generation !== searchGeneration) return;
    results.value = result.skills;
  } catch (err) {
    if (generation !== searchGeneration) return;
    results.value = [];
    searchError.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (generation === searchGeneration) searching.value = false;
  }
}

async function installFromHit(hit: SkillsShSearchHit) {
  installingId.value = hit.id;
  searchError.value = null;
  try {
    const resource = await installSkill(`${hit.source}@${hit.name}`, hit.name);
    showUiMessage(t("resource.installedNamed", { name: hit.name }), "success");
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
    showUiMessage(t("resource.installedNamed", { name: resource.slug }), "success");
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
.skill-install__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 16px 20px 20px;
}

.skill-install__content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
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
</style>
