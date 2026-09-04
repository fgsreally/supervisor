<template>
  <ResponsiveDialog
    :open="open"
    :title="t('project.create.title')"
    :description="t('project.create.description')"
    width="sm"
    size="auto"
    panel-class="form-dialog"
    @close="emit('close')"
  >
    <div class="form-dialog__body">
      <div class="form-dialog__field">
        <label class="form-dialog__label" for="project-create-cwd">{{ t("project.create.folder") }}</label>
        <div class="form-dialog__row">
          <input
            id="project-create-cwd"
            v-model="cwd"
            type="text"
            class="form-dialog__input"
            :placeholder="t('project.create.pathPlaceholder')"
            :disabled="busy"
            @keydown.enter.prevent="submit"
          />
          <UiActionButton
            variant="secondary"
            :loading="browsing"
            :disabled="busy"
            :title="t('project.create.browse')"
            @click="browse"
          >
            <FolderSearch class="h-4 w-4" />
            {{ t("project.create.browse") }}
          </UiActionButton>
        </div>
      </div>

      <p class="form-dialog__hint">
        {{ t("project.create.hint") }}
      </p>

      <UiActionButton :loading="busy" :disabled="!cwd.trim()" block @click="submit">
        {{ t("project.create.submit") }}
      </UiActionButton>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { FolderSearch } from "lucide-vue-next";
import { pickDirectory } from "@/api";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import { showUiMessage } from "@/composables/use-ui-message";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import UiActionButton from "@/components/base/UiActionButton.vue";
import { useI18n } from "@/i18n";
const { t } = useI18n();

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
    showUiMessage(error instanceof Error ? error.message : t("project.create.browseFailed"), "error");
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
