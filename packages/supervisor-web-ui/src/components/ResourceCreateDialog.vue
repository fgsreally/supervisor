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
            {{ kind === "mcp" ? "新建 MCP 配置" : "新建 Prompt 模板" }}
          </h2>
          <button type="button" class="resource-create-close" title="关闭" @click="close">
            <X class="w-5 h-5" />
          </button>
        </header>

        <div class="p-5 overflow-y-auto custom-scrollbar space-y-4 flex-1 min-h-0 flex flex-col">
          <label class="block text-[13px]">
            <span class="resource-create-label mb-1 block">标识 (slug)</span>
            <input
              v-model="slug"
              type="text"
              class="resource-create-input w-full px-3 py-2 rounded-md border text-[13px] font-mono"
              placeholder="my-resource"
              :disabled="saving"
            />
          </label>

          <div class="flex-1 min-h-[240px] flex flex-col border rounded-md overflow-hidden">
            <div class="px-3 py-1.5 text-[12px] border-b resource-create-editor-label">内容</div>
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
          <button type="button" class="resource-create-btn resource-create-btn--ghost" @click="close">
            取消
          </button>
          <button
            type="button"
            class="resource-create-btn resource-create-btn--primary"
            :disabled="saving || !slug.trim()"
            @click="save"
          >
            {{ saving ? "保存中..." : "创建" }}
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

const props = defineProps<{
  open: boolean;
  kind: "prompt" | "mcp";
}>();

const emit = defineEmits<{
  close: [];
  created: [slug: string];
}>();

const DEFAULT_PROMPT = `# Prompt 模板

在此编写可复用的提示词内容。
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

const slug = ref("");
const content = ref("");
const saving = ref(false);
const error = ref<string | null>(null);

watch(
  () => [props.open, props.kind] as const,
  ([open, kind]) => {
    if (!open) return;
    slug.value = "";
    content.value = kind === "mcp" ? DEFAULT_MCP : DEFAULT_PROMPT;
    error.value = null;
    saving.value = false;
  },
);

function close() {
  emit("close");
}

async function save() {
  const nextSlug = slug.value.trim();
  if (!nextSlug) return;
  saving.value = true;
  error.value = null;
  try {
    await upsertResourceContent({
      kind: props.kind,
      slug: nextSlug,
      content: content.value,
    });
    showUiMessage(`${props.kind === "mcp" ? "MCP" : "Prompt"} 已创建`, "success");
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
