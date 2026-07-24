<template>
  <Teleport to="body">
    <Transition name="project-create">
      <div
        v-if="open"
        class="fixed inset-0 z-[210] flex items-end sm:items-center justify-center"
        @mousedown.self="emit('close')"
      >
        <div class="absolute inset-0 bg-black/45" />
        <div
          class="project-create relative w-full sm:max-w-[400px] sm:rounded-xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-create-title"
          @mousedown.stop
        >
          <header class="project-create__header">
            <h2 id="project-create-title">新建项目</h2>
            <button type="button" class="project-create__icon" title="关闭" @click="emit('close')">
              <X class="h-5 w-5" />
            </button>
          </header>

          <div class="project-create__body">
            <label class="project-create__label">本地文件夹</label>
            <div class="project-create__path-row">
              <input
                v-model="cwd"
                type="text"
                class="project-create__input"
                placeholder="项目绝对路径"
                :disabled="busy"
                @keydown.enter.prevent="submit"
              />
              <button
                type="button"
                class="project-create__browse"
                :disabled="busy || browsing"
                title="浏览文件夹"
                @click="browse"
              >
                <FolderSearch class="h-4 w-4" />
                浏览
              </button>
            </div>
            <p class="project-create__hint">
              创建后会用「项目描述」功能模型启动临时 Coding Agent，只读整理描述写入项目。
            </p>
            <button
              type="button"
              class="project-create__primary"
              :disabled="busy || !cwd.trim()"
              @click="submit"
            >
              {{ busy ? "创建中…" : "创建项目" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { FolderSearch, X } from "lucide-vue-next";
import { pickDirectory } from "@/api";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import { showUiMessage } from "@/composables/use-ui-message";

const props = defineProps<{
  open: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  create: [cwd: string];
}>();

const cwd = ref(getDefaultWorkspaceCwd());
const browsing = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) cwd.value = getDefaultWorkspaceCwd();
  },
);

async function browse() {
  browsing.value = true;
  try {
    const result = await pickDirectory(cwd.value.trim() || getDefaultWorkspaceCwd());
    if (!result.cancelled && result.path) cwd.value = result.path;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "打开文件夹选择失败", "error");
  } finally {
    browsing.value = false;
  }
}

function submit() {
  const value = cwd.value.trim();
  if (!value || props.busy) return;
  emit("create", value);
}
</script>

<style scoped>
.project-create {
  background: var(--app-chat-bg);
  color: var(--app-text-primary);
  box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
}

.project-create__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-chat-header-bg);
}

.project-create__header h2 {
  margin: 0;
  flex: 1;
  font-size: 16px;
  font-weight: 500;
}

.project-create__icon {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--app-text-secondary);
}

.project-create__icon:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.project-create__body {
  padding: 16px;
}

.project-create__label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.project-create__path-row {
  display: flex;
  gap: 8px;
}

.project-create__input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  font-size: 13px;
}

.project-create__browse {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--app-btn-secondary-border);
  color: var(--app-btn-secondary-text);
  font-size: 13px;
  white-space: nowrap;
}

.project-create__browse:hover:not(:disabled) {
  background: var(--app-btn-secondary-hover-bg);
}

.project-create__hint {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--app-text-muted);
}

.project-create__primary {
  width: 100%;
  margin-top: 14px;
  height: 40px;
  border-radius: 8px;
  background: var(--app-accent);
  color: #fff;
  font-size: 15px;
}

.project-create__primary:hover:not(:disabled) {
  background: var(--app-accent-hover);
}

.project-create__primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-create-enter-active,
.project-create-leave-active {
  transition: opacity 0.18s ease;
}

.project-create-enter-active .project-create,
.project-create-leave-active .project-create {
  transition:
    transform 0.2s ease,
    opacity 0.18s ease;
}

.project-create-enter-from,
.project-create-leave-to {
  opacity: 0;
}

.project-create-enter-from .project-create,
.project-create-leave-to .project-create {
  transform: translateY(12px);
  opacity: 0;
}
</style>
