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
              :disabled="busy || saving"
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
                  :disabled="busy || saving"
                  @keydown.enter.prevent="saveName"
                />
                <button
                  type="button"
                  class="project-settings-modal__save"
                  :disabled="busy || saving || !nameDirty"
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
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps<{
  open: boolean;
  name?: string;
  cwd?: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  rename: [name: string];
}>();

const draftName = ref("");
const saving = ref(false);

const nameDirty = computed(
  () => draftName.value.trim() !== "" && draftName.value.trim() !== (props.name ?? "").trim(),
);

watch(
  () => [props.open, props.name] as const,
  ([open, name]) => {
    if (open) {
      draftName.value = name ?? "";
      saving.value = false;
    }
  },
);

function onBackdrop() {
  if (busyOrSaving()) return;
  emit("close");
}

function busyOrSaving() {
  return Boolean(props.busy) || saving.value;
}

async function saveName() {
  if (!nameDirty.value || busyOrSaving()) return;
  const next = draftName.value.trim();
  saving.value = true;
  try {
    emit("rename", next);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.project-settings-modal {
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
}

.project-settings-modal__header {
  border-color: var(--app-border-subtle);
}

.project-settings-modal__icon {
  padding: 4px;
  border-radius: 6px;
  color: var(--app-text-muted);
}

.project-settings-modal__icon:hover:not(:disabled) {
  color: var(--app-text-primary);
  background: var(--app-hover);
}

.project-settings-modal__icon:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-settings-modal__label {
  display: block;
  font-size: 12px;
  color: var(--app-text-secondary);
  margin-bottom: 6px;
}

.project-settings-modal__row {
  display: flex;
  gap: 8px;
}

.project-settings-modal__input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--app-border);
  background: var(--app-settings-card, var(--app-popup-bg));
  color: var(--app-text-primary);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
}

.project-settings-modal__input:focus {
  outline: none;
  border-color: #07c160;
}

.project-settings-modal__save {
  flex: none;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 13px;
  background: #07c160;
  color: #fff;
}

.project-settings-modal__save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-settings-modal__path {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--app-border);
  background: var(--app-settings-card, transparent);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-all;
  max-height: 6.2em;
  overflow: auto;
}

.project-settings-enter-active,
.project-settings-leave-active {
  transition: opacity 0.2s ease;
}

.project-settings-enter-from,
.project-settings-leave-to {
  opacity: 0;
}
</style>
