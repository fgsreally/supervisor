<template>
  <MobileDrawer
    :open="open"
    ariaLabel="项目设置"
    variant="adaptive"
    size="auto"
    :show-close="!(busy || parsing)"
    :dismiss-on-backdrop="!(busy || parsing)"
    :modal-breakpoint="767"
    panel-class="project-settings-drawer"
    @close="onClose"
  >
    <div class="project-settings">
      <div>
        <label class="project-settings__label">项目名</label>
        <div class="project-settings__row">
          <input
            v-model="draftName"
            type="text"
            class="project-settings__input"
            :disabled="busy || saving || parsing"
            @keydown.enter.prevent="saveName"
          />
          <button
            type="button"
            class="project-settings__save"
            :disabled="busy || saving || parsing || !nameDirty"
            @click="saveName"
          >
            {{ saving ? "..." : "保存" }}
          </button>
        </div>
      </div>

      <div>
        <label class="project-settings__label">路径</label>
        <div class="project-settings__path" :title="cwd">{{ cwd || "—" }}</div>
      </div>

      <div class="project-settings__parse">
        <div class="project-settings__desc-head">
          <div>
            <div class="project-settings__parse-title">解析</div>
            <div class="project-settings__muted">初始化 Git 与 AGENTS.md</div>
          </div>
          <button
            type="button"
            class="project-settings__refresh"
            title="解析并初始化项目"
            :disabled="busy || parsing"
            @click="emit('parse')"
          >
            <WatsonIcon class="h-3.5 w-3.5" />
            {{ parsing ? "解析中..." : "解析" }}
          </button>
        </div>
      </div>
    </div>
  </MobileDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { MobileDrawer } from "@/components/mobile/ui";
import WatsonIcon from "./WatsonIcon.vue";

const props = defineProps<{
  open: boolean;
  name?: string;
  cwd?: string;
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

function onClose() {
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
.project-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.project-settings__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.project-settings__row {
  display: flex;
  gap: 8px;
}

.project-settings__input {
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

.project-settings__save,
.project-settings__refresh {
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

.project-settings__save:disabled,
.project-settings__refresh:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-settings__refresh {
  height: 28px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--app-btn-secondary-border);
  color: var(--app-btn-secondary-text);
}

.project-settings__refresh:hover:not(:disabled) {
  background: var(--app-btn-secondary-hover-bg);
}

.project-settings__path {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--app-chat-bg);
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-text-primary);
  word-break: break-all;
}

.project-settings__desc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.project-settings__parse-title {
  font-size: 13px;
  font-weight: 600;
}

.project-settings__muted {
  color: var(--app-text-muted);
}

@media (max-width: 767px) {
  .project-settings__input,
  .project-settings__save {
    height: 40px;
    font-size: 15px;
  }

  .project-settings__path,
  .project-settings__parse-title {
    font-size: 14px;
  }
}
</style>

<style>
.project-settings-drawer.m-drawer--modal {
  width: min(420px, calc(100vw - 24px));
  max-width: 420px;
}
</style>
