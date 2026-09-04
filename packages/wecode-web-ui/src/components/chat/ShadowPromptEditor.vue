<template>
  <div class="shadow-prompt-editor">
    <div class="shadow-prompt-editor__current">
      <label class="shadow-prompt-editor__label" for="shadow-prompt-content">
        {{ t("chat.shadowPrompt.current") }}
      </label>
      <textarea
        id="shadow-prompt-content"
        v-model="draft"
        class="shadow-prompt-editor__textarea"
        :placeholder="t('chat.shadowPrompt.placeholder')"
        rows="5"
      />
      <div class="shadow-prompt-editor__actions">
        <UiActionButton
          variant="primary"
          :loading="saving"
          :disabled="!draft.trim() && !current?.content"
          @click="applyDraft"
        >
          {{ t("chat.shadowPrompt.apply") }}
        </UiActionButton>
        <UiActionButton variant="ghost" :disabled="saving" @click="clearPrompt">
          {{ t("chat.shadowPrompt.clear") }}
        </UiActionButton>
      </div>
    </div>

    <div class="shadow-prompt-editor__saved">
      <div class="shadow-prompt-editor__section-head">
        <span class="shadow-prompt-editor__label">{{ t("chat.shadowPrompt.saved") }}</span>
        <button
          type="button"
          class="shadow-prompt-editor__text-button"
          @click="saveAsOpen = !saveAsOpen"
        >
          {{ t("chat.shadowPrompt.saveAs") }}
        </button>
      </div>
      <div v-if="saveAsOpen" class="shadow-prompt-editor__save-row">
        <input
          v-model="saveAsName"
          class="shadow-prompt-editor__name-input"
          :placeholder="t('chat.shadowPrompt.namePlaceholder')"
          @keydown.enter.prevent="saveAsPrompt"
        />
        <UiActionButton
          variant="secondary"
          :loading="savingAs"
          :disabled="!saveAsName.trim() || !draft.trim()"
          @click="saveAsPrompt"
        >
          {{ t("chat.shadowPrompt.save") }}
        </UiActionButton>
      </div>
      <div v-if="loading" class="shadow-prompt-editor__empty">{{ t("common.loading") }}</div>
      <div v-else-if="prompts.length === 0" class="shadow-prompt-editor__empty">
        {{ t("chat.shadowPrompt.empty") }}
      </div>
      <div v-else class="shadow-prompt-editor__list">
        <div v-for="prompt in prompts" :key="prompt.id" class="shadow-prompt-editor__item">
          <button type="button" class="shadow-prompt-editor__item-main" @click="applySaved(prompt)">
            <strong>{{ prompt.name }}</strong>
            <span>{{ prompt.content }}</span>
          </button>
          <button
            type="button"
            class="shadow-prompt-editor__delete"
            :aria-label="t('chat.shadowPrompt.delete')"
            @click="removePrompt(prompt)"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { Trash2 } from "lucide-vue-next";
import * as api from "@/api";
import { UiActionButton } from "@/components/base";
import { requestUiDeleteConfirm } from "@/composables/use-ui-confirm";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";

export interface ShadowPromptValue {
  id?: number;
  name?: string;
  content: string;
}

const props = defineProps<{
  sessionId: string;
  current?: ShadowPromptValue | null;
}>();

const emit = defineEmits<{ saved: [session: api.Session] }>();
const { t } = useI18n();
const draft = ref("");
const prompts = ref<api.ShadowPrompt[]>([]);
const loading = ref(false);
const saving = ref(false);
const savingAs = ref(false);
const saveAsOpen = ref(false);
const saveAsName = ref("");

watch(
  () => props.current,
  (value) => {
    draft.value = value?.content ?? "";
  },
  { immediate: true },
);

async function loadPrompts() {
  loading.value = true;
  try {
    prompts.value = await api.listShadowPrompts();
  } catch (error) {
    showUiMessage(
      error instanceof Error ? error.message : t("chat.shadowPrompt.loadFailed"),
      "error",
    );
  } finally {
    loading.value = false;
  }
}

async function apply(input: { promptId?: number | null; content?: string; name?: string }) {
  saving.value = true;
  try {
    emit("saved", await api.updateSessionShadowPrompt(props.sessionId, input));
    showUiMessage(t("chat.shadowPrompt.applied"), "success");
  } catch (error) {
    showUiMessage(
      error instanceof Error ? error.message : t("chat.shadowPrompt.saveFailed"),
      "error",
    );
  } finally {
    saving.value = false;
  }
}

function applyDraft() {
  const content = draft.value.trim();
  if (content) void apply({ content, name: props.current?.name });
  else void clearPrompt();
}

function clearPrompt() {
  draft.value = "";
  void apply({ promptId: null });
}

function applySaved(prompt: api.ShadowPrompt) {
  draft.value = prompt.content;
  void apply({ promptId: prompt.id });
}

async function saveAsPrompt() {
  const name = saveAsName.value.trim();
  const content = draft.value.trim();
  if (!name || !content) return;
  savingAs.value = true;
  try {
    const prompt = await api.createShadowPrompt({ name, content });
    prompts.value = [prompt, ...prompts.value.filter((item) => item.id !== prompt.id)];
    saveAsName.value = "";
    saveAsOpen.value = false;
    await apply({ promptId: prompt.id });
  } catch (error) {
    showUiMessage(
      error instanceof Error ? error.message : t("chat.shadowPrompt.saveFailed"),
      "error",
    );
  } finally {
    savingAs.value = false;
  }
}

async function removePrompt(prompt: api.ShadowPrompt) {
  const confirmed = await requestUiDeleteConfirm({
    title: t("chat.shadowPrompt.deleteTitle"),
    message: t("chat.shadowPrompt.deleteMessage", { name: prompt.name }),
  });
  if (!confirmed) return;
  try {
    await api.deleteShadowPrompt(prompt.id);
    prompts.value = prompts.value.filter((item) => item.id !== prompt.id);
    showUiMessage(t("chat.shadowPrompt.deleted"), "success");
  } catch (error) {
    showUiMessage(
      error instanceof Error ? error.message : t("chat.shadowPrompt.saveFailed"),
      "error",
    );
  }
}

onMounted(() => void loadPrompts());
</script>

<style scoped>
.shadow-prompt-editor {
  display: grid;
  gap: var(--app-space-4);
  min-width: min(34rem, 80vw);
}
.shadow-prompt-editor__current,
.shadow-prompt-editor__saved {
  display: grid;
  gap: var(--app-space-2);
}
.shadow-prompt-editor__label {
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  font-weight: var(--app-font-weight-medium);
}
.shadow-prompt-editor__textarea,
.shadow-prompt-editor__name-input {
  width: 100%;
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-control);
  background: var(--app-input-bg, transparent);
  color: var(--app-text-primary);
  font: inherit;
  font-size: var(--app-font-body);
  outline: none;
}
.shadow-prompt-editor__textarea {
  min-height: 7rem;
  padding: var(--app-space-3);
  resize: vertical;
  line-height: 1.5;
}
.shadow-prompt-editor__name-input {
  min-height: var(--app-control-height);
  padding: 0 var(--app-space-3);
}
.shadow-prompt-editor__textarea:focus,
.shadow-prompt-editor__name-input:focus {
  border-color: var(--app-accent);
}
.shadow-prompt-editor__actions,
.shadow-prompt-editor__section-head,
.shadow-prompt-editor__save-row {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
}
.shadow-prompt-editor__section-head {
  justify-content: space-between;
}
.shadow-prompt-editor__text-button {
  color: var(--app-accent);
  font-size: var(--app-font-control);
}
.shadow-prompt-editor__save-row .shadow-prompt-editor__name-input {
  flex: 1;
}
.shadow-prompt-editor__list {
  display: grid;
  gap: var(--app-space-2);
  max-height: 14rem;
  overflow: auto;
}
.shadow-prompt-editor__item {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-control);
  overflow: hidden;
}
.shadow-prompt-editor__item-main {
  display: grid;
  flex: 1;
  gap: 0.2rem;
  min-width: 0;
  padding: var(--app-space-2) var(--app-space-3);
  text-align: left;
}
.shadow-prompt-editor__item-main:hover {
  background: var(--app-hover);
}
.shadow-prompt-editor__item-main strong {
  color: var(--app-text-primary);
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-medium);
}
.shadow-prompt-editor__item-main span {
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shadow-prompt-editor__delete {
  display: grid;
  place-items: center;
  width: 2.5rem;
  color: var(--app-text-secondary);
}
.shadow-prompt-editor__delete:hover {
  color: var(--app-danger);
  background: var(--app-hover);
}
.shadow-prompt-editor__delete svg {
  width: 0.9rem;
  height: 0.9rem;
}
.shadow-prompt-editor__empty {
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
}
</style>
