<template>
  <MobileDrawer
    :open="open"
    title="项目设置"
    ariaLabel="项目设置"
    variant="adaptive"
    size="auto"
    width="sm"
    :show-close="!(busy || parsing)"
    :dismiss-on-backdrop="!(busy || parsing)"
    :modal-breakpoint="767"
    panel-class="form-dialog project-settings-drawer"
    @close="onClose"
  >
    <div class="form-dialog__body">
      <div class="form-dialog__field">
        <label class="form-dialog__label" for="project-settings-name">项目名</label>
        <div class="form-dialog__row">
          <input
            id="project-settings-name"
            v-model="draftName"
            type="text"
            class="form-dialog__input"
            :disabled="busy || saving || parsing"
            @keydown.enter.prevent="saveName"
          />
          <UiActionButton
            :loading="saving"
            :disabled="busy || parsing || !nameDirty"
            @click="saveName"
          >
            保存
          </UiActionButton>
        </div>
      </div>

      <div class="form-dialog__field">
        <span class="form-dialog__label">路径</span>
        <div class="form-dialog__value" :title="cwd">{{ cwd || "—" }}</div>
      </div>

      <div class="form-dialog__field">
        <div class="form-dialog__row">
          <p class="form-dialog__hint form-dialog__grow">初始化 Git 与 AGENTS.md</p>
          <UiActionButton
            variant="secondary"
            :loading="parsing"
            :disabled="busy"
            title="解析并初始化项目"
            @click="emit('parse')"
          >
            <WatsonIcon class="h-3.5 w-3.5" />
            解析
          </UiActionButton>
        </div>
      </div>
    </div>
  </MobileDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { MobileDrawer } from "@/components/mobile/ui";
import UiActionButton from "@/components/base/UiActionButton.vue";
import WatsonIcon from "@/components/base/WatsonIcon.vue";

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

<style>
.project-settings-drawer.m-drawer--modal {
  width: min(420px, calc(100vw - 24px));
  max-width: 420px;
}
</style>
