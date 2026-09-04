<template>
  <ResponsiveDialog
    :open="open"
    :title="t('resource.installPlugin')"
    width="sm"
    size="auto"
    :dismiss-on-backdrop="!installing"
    @close="close"
  >
    <div class="plugin-dialog__body">
      <label class="plugin-dialog__label" for="plugin-source">{{
        t("resource.source")
      }}</label>
      <div class="plugin-dialog__field">
        <input
          id="plugin-source"
          ref="sourceInputRef"
          v-model="source"
          type="text"
          placeholder="npm:pkg | git+url | /local/path"
          :disabled="installing"
          @keyup.enter="install"
        />
      </div>
      <p v-if="error" class="plugin-dialog__error">{{ error }}</p>
      <UiActionButton
        class="plugin-dialog__submit"
        block
        :loading="installing"
        :disabled="!source.trim()"
        @click="install"
      >
        {{ installing ? t("resource.installing") : t("resource.install") }}
      </UiActionButton>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import { installPlugin } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";

const props = defineProps<{ open: boolean }>();
const { t } = useI18n();
const emit = defineEmits<{
  close: [];
  installed: [id: string];
}>();

const source = ref("");
const sourceInputRef = ref<HTMLInputElement | null>(null);
const installing = ref(false);
const error = ref("");

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    source.value = "";
    error.value = "";
    await nextTick();
    sourceInputRef.value?.focus();
  },
);

function close() {
  if (!installing.value) emit("close");
}

async function install() {
  const value = source.value.trim();
  if (!value || installing.value) return;
  installing.value = true;
  error.value = "";
  try {
    const result = await installPlugin(value);
    showUiMessage(t("resource.pluginInstalled", { id: result.id }), "success");
    emit("installed", result.id);
    emit("close");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    installing.value = false;
  }
}
</script>

<style scoped>
.plugin-dialog__body {
  padding: 1rem 1.25rem 1.25rem;
}

.plugin-dialog__label {
  display: block;
  margin: 0 0.25rem 0.5rem;
  font-size: var(--app-font-caption);
  color: var(--app-text-muted);
}

.plugin-dialog__field {
  min-height: 3rem;
  padding-inline: 0.875rem;
  border-top: 1px solid var(--app-border-subtle);
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-settings-card);
}

.plugin-dialog__field:focus-within {
  border-color: color-mix(in srgb, var(--app-accent) 52%, var(--app-border-subtle));
}

.plugin-dialog__field input {
  width: 100%;
  min-height: 3rem;
  border: 0;
  outline: 0;
  font-size: var(--app-font-body);
  color: var(--app-text-primary);
  background: transparent;
}

.plugin-dialog__field input::placeholder {
  color: var(--app-text-muted);
}

.plugin-dialog__error {
  margin: 0.625rem 0.25rem 0;
  font-size: var(--app-font-caption);
  color: var(--app-error, #d33);
}

.plugin-dialog__submit {
  margin-top: 1rem;
}
</style>
