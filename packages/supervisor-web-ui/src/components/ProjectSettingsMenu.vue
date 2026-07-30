<template>
  <Teleport to="body">
    <Transition name="project-settings">
      <div
        v-if="open"
        class="fixed inset-0 z-[210] flex items-center justify-center p-4"
        @mousedown.self="onBackdrop"
      >
        <div class="absolute inset-0 bg-black/40" />
        <div
          class="project-settings-modal relative w-full max-w-[420px] overflow-hidden rounded-lg border shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-settings-title"
          @mousedown.stop
        >
          <header
            class="project-settings-modal__header flex shrink-0 items-center gap-3 border-b px-4 py-3"
          >
            <h2 id="project-settings-title" class="min-w-0 flex-1 text-[15px] font-medium">
              项目设置
            </h2>
            <button
              type="button"
              class="project-settings-modal__icon"
              :disabled="busy || saving || parsing"
              title="关闭"
              @click="emit('close')"
            >
              <X class="h-5 w-5" />
            </button>
          </header>

          <div class="space-y-4 p-4">
            <div>
              <label class="project-settings-modal__label">项目名</label>
              <div class="project-settings-modal__row">
                <input
                  v-model="draftName"
                  type="text"
                  class="project-settings-modal__input"
                  :disabled="busy || saving || parsing"
                  @keydown.enter.prevent="saveName"
                />
                <button
                  type="button"
                  class="project-settings-modal__save"
                  :disabled="busy || saving || parsing || !nameDirty"
                  @click="saveName"
                >
                  {{ saving ? "..." : "保存" }}
                </button>
              </div>
            </div>

            <div>
              <label class="project-settings-modal__label">路径</label>
              <div class="project-settings-modal__path" :title="cwd">{{ cwd || "—" }}</div>
            </div>

            <div class="project-settings-modal__parse">
              <div class="project-settings-modal__desc-head">
                <div>
                  <div class="project-settings-modal__parse-title">解析</div>
                  <div class="project-settings-modal__muted">初始化 Git、运行参数和 AGENTS.md</div>
                </div>
                <button
                  type="button"
                  class="project-settings-modal__refresh"
                  title="解析并初始化项目"
                  :disabled="busy || parsing"
                  @click="emit('parse')"
                >
                  <WatsonIcon class="h-3.5 w-3.5" />
                  {{ parsing ? "解析中..." : "解析" }}
                </button>
              </div>
              <button
                type="button"
                class="project-settings-modal__details-toggle"
                :aria-expanded="detailsOpen"
                @click="detailsOpen = !detailsOpen"
              >
                <ChevronRight class="h-4 w-4" :class="{ 'rotate-90': detailsOpen }" />
                解析详情
              </button>
              <div v-if="detailsOpen" class="project-settings-modal__details">
                <div class="project-settings-modal__desc">
                  <template v-if="parsing || parseStatus === 'pending'">
                    <span class="project-settings-modal__muted">正在解析项目…</span>
                  </template>
                  <template v-else-if="description">
                    {{ description }}
                  </template>
                  <template v-else-if="parseStatus === 'skipped'">
                    <span class="project-settings-modal__muted">
                      {{ parseError || "未配置「助手模型」" }}
                    </span>
                  </template>
                  <template v-else-if="parseStatus === 'error'">
                    <span class="project-settings-modal__error">
                      {{ parseError || "解析失败" }}
                    </span>
                  </template>
                  <template v-else>
                    <span class="project-settings-modal__muted">暂无解析结果</span>
                  </template>
                </div>
                <div v-if="scripts?.length" class="project-settings-modal__scripts">
                  <div
                    v-for="script in scripts"
                    :key="`${script.kind}-${script.id}`"
                    class="project-settings-modal__script"
                  >
                    <span class="project-settings-modal__script-kind">{{ script.kind }}</span>
                    <span class="project-settings-modal__script-name">{{ script.name }}</span>
                    <code class="project-settings-modal__script-cmd">{{ script.command }}</code>
                  </div>
                </div>
                <div
                  v-else-if="!parsing && parseStatus === 'ready'"
                  class="project-settings-modal__muted"
                  style="margin-top: 8px"
                >
                  无需安装/启动/销毁脚本
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronRight, X } from "lucide-vue-next";
import WatsonIcon from "./WatsonIcon.vue";

const props = defineProps<{
  open: boolean;
  name?: string;
  cwd?: string;
  description?: string | null;
  parseStatus?: string | null;
  parseError?: string | null;
  scripts?: Array<{ id: number; kind: string; name: string; command: string }>;
  busy?: boolean;
  parsing?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  rename: [name: string];
  parse: [];
}>();

const draftName = ref("");
const saving = ref(false);
const detailsOpen = ref(false);

const nameDirty = computed(
  () => draftName.value.trim() !== "" && draftName.value.trim() !== (props.name ?? "").trim(),
);

watch(
  () => [props.open, props.name] as const,
  ([open, name]) => {
    if (open) {
      draftName.value = name ?? "";
      saving.value = false;
      detailsOpen.value = false;
    }
  },
);

function onBackdrop() {
  if (props.busy || props.parsing) return;
  emit("close");
}

async function saveName() {
  if (!nameDirty.value || props.busy || saving.value) return;
  saving.value = true;
  try {
    emit("rename", draftName.value.trim());
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.project-settings-modal {
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
  color: var(--app-text-primary);
}

.project-settings-modal__header {
  border-color: var(--app-border-subtle);
}

.project-settings-modal__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.project-settings-modal__row {
  display: flex;
  gap: 8px;
}

.project-settings-modal__input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-chat-bg);
  color: var(--app-text-primary);
  font-size: 13px;
}

.project-settings-modal__save,
.project-settings-modal__refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px;
  border-radius: 6px;
  background: var(--app-accent);
  color: #fff;
  font-size: 13px;
  white-space: nowrap;
}

.project-settings-modal__save:disabled,
.project-settings-modal__refresh:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-settings-modal__refresh {
  height: 28px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--app-btn-secondary-border);
  color: var(--app-btn-secondary-text);
}

.project-settings-modal__refresh:hover:not(:disabled) {
  background: var(--app-btn-secondary-hover-bg);
}

.project-settings-modal__icon {
  padding: 4px;
  border-radius: 6px;
  color: var(--app-text-muted);
}

.project-settings-modal__icon:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.project-settings-modal__path,
.project-settings-modal__desc {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--app-chat-bg);
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-text-primary);
  word-break: break-all;
}

.project-settings-modal__desc {
  min-height: 72px;
  max-height: 220px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.project-settings-modal__desc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.project-settings-modal__desc-head .project-settings-modal__label {
  margin-bottom: 0;
}

.project-settings-modal__parse {
  padding-top: 2px;
}

.project-settings-modal__parse-title {
  font-size: 13px;
  font-weight: 600;
}

.project-settings-modal__details-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.project-settings-modal__details-toggle svg {
  transition: transform 0.15s ease;
}

.project-settings-modal__details {
  margin-top: 8px;
}

.project-settings-modal__muted {
  color: var(--app-text-muted);
}

.project-settings-modal__error {
  color: #e54d42;
}

.project-settings-modal__scripts {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.project-settings-modal__script {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 6px 8px;
  align-items: baseline;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--app-chat-bg);
  font-size: 12px;
}

.project-settings-modal__script-kind {
  color: var(--app-accent);
  font-weight: 600;
  text-transform: uppercase;
}

.project-settings-modal__script-name {
  color: var(--app-text-muted);
}

.project-settings-modal__script-cmd {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-primary);
}

.project-settings-enter-active,
.project-settings-leave-active {
  transition: opacity 0.18s ease;
}

.project-settings-enter-active .project-settings-modal,
.project-settings-leave-active .project-settings-modal {
  transition:
    transform 0.2s ease,
    opacity 0.18s ease;
}

.project-settings-enter-from,
.project-settings-leave-to {
  opacity: 0;
}

.project-settings-enter-from .project-settings-modal,
.project-settings-leave-to .project-settings-modal {
  transform: scale(0.96);
  opacity: 0;
}
</style>
