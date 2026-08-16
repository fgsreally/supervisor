<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="resource-create-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      @click.self="close"
    >
      <section
        class="resource-create-dialog w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg shadow-xl border flex flex-col"
      >
        <header class="h-14 px-5 border-b flex items-center shrink-0">
          <h2 class="text-[16px] font-medium flex-1">
            {{ kind === "mcp" ? t("resource.createMcpConfig") : t("resource.createTemplate") }}
          </h2>
          <button type="button" class="resource-create-close" :title="t('common.close')" @click="close">
            <X class="w-5 h-5" />
          </button>
        </header>

        <div class="p-5 overflow-y-auto custom-scrollbar space-y-4 flex-1 min-h-0 flex flex-col">
          <label class="block text-[13px]">
            <span class="resource-create-label mb-1 block">{{ t("common.name") }}</span>
            <input
              v-model="name"
              type="text"
              class="resource-create-input w-full px-3 py-2 rounded-md border text-[13px] font-mono"
              :placeholder="t('resource.namePlaceholder')"
              :disabled="saving"
            />
          </label>

          <div class="flex-1 min-h-[240px] flex flex-col border rounded-md overflow-hidden">
            <div class="px-3 py-1.5 text-[12px] border-b resource-create-editor-label">{{ t("common.content") }}</div>
            <ResourceContentView
              v-model:content="content"
              :kind="kind === 'mcp' ? 'mcp' : 'prompts'"
              :editable="true"
              class="flex-1 min-h-0"
            />
          </div>

          <p v-if="error" class="text-[12px] resource-create-error">{{ error }}</p>
        </div>

        <footer class="px-5 py-3 border-t flex justify-end gap-2 shrink-0">
          <button
            type="button"
            class="resource-create-btn resource-create-btn--ghost"
            @click="close"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            type="button"
            class="resource-create-btn resource-create-btn--primary"
            :disabled="saving || !name.trim()"
            @click="save"
          >
            {{ saving ? t("common.saving") : t("common.create") }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { X } from "lucide-vue-next";
import ResourceContentView from "./ResourceContentView.vue";
import { upsertResourceContent } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";

const props = defineProps<{
  open: boolean;
  kind: "prompt" | "mcp";
}>();
const { t } = useI18n();

const emit = defineEmits<{
  close: [];
  created: [slug: string];
}>();

const DEFAULT_PROMPT = `---
description: Reusable Template
argument-hint: <topic> [additional requirements]
---
# Template

Complete the task around $1.

All user-provided arguments: $ARGUMENTS
`;

const DEFAULT_MCP = `{
  "servers": {
    "example": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
`;

const name = ref("");
const content = ref("");
const saving = ref(false);
const error = ref<string | null>(null);

watch(
  () => [props.open, props.kind] as const,
  ([open, kind]) => {
    if (!open) return;
    name.value = "";
    content.value = kind === "mcp" ? DEFAULT_MCP : DEFAULT_PROMPT;
    error.value = null;
    saving.value = false;
  },
);

function close() {
  emit("close");
}

async function save() {
  const nextName = name.value.trim();
  if (!nextName) return;
  const normalized = nextName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const nextSlug = normalized || `${props.kind}-${Date.now().toString(36)}`;
  saving.value = true;
  error.value = null;
  try {
    await upsertResourceContent({
      kind: props.kind,
      slug: nextSlug,
      name: nextName,
      content: content.value,
    });
    showUiMessage(t("resource.createdNamed", { kind: props.kind === "mcp" ? "MCP" : "Template" }), "success");
    emit("created", nextSlug);
    close();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.resource-create-overlay {
  background: color-mix(in srgb, #000 45%, transparent);
}

.resource-create-dialog {
  background: var(--app-settings-card, var(--app-bg));
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.resource-create-close {
  color: var(--app-text-secondary);
  padding: 0.25rem;
  border-radius: 0.375rem;
}

.resource-create-close:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.resource-create-label,
.resource-create-editor-label {
  color: var(--app-text-secondary);
}

.resource-create-input {
  background: var(--app-input-bg, var(--app-bg));
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.resource-create-error {
  color: var(--app-error, #d33);
}

.resource-create-btn {
  px: 0;
  padding: 0.4rem 0.9rem;
  border-radius: 0.375rem;
  font-size: 13px;
  border: 1px solid var(--app-border);
}

.resource-create-btn--ghost {
  background: transparent;
  color: var(--app-text-secondary);
}

.resource-create-btn--primary {
  background: var(--app-accent);
  border-color: var(--app-accent);
  color: var(--app-button-text, #fff);
}

.resource-create-btn--primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

footer {
  border-color: var(--app-border);
}

header {
  border-color: var(--app-border);
}
</style>
