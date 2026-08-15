<template>
  <Teleport to="body">
    <div v-if="open" class="codex-model-overlay" @click.self="close">
      <section
        class="codex-model-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="选择 Codex 模型"
      >
        <header>
          <h2>选择 Codex 模型</h2>
          <button type="button" @click="close">关闭</button>
        </header>

        <p v-if="loading" class="muted">正在从 Codex 获取模型列表…</p>
        <p v-else-if="error" class="error">{{ error }}</p>
        <template v-else>
          <label>
            模型
            <select v-model="selectedModel">
              <option v-for="model in models" :key="model.id" :value="model.model">
                {{ model.displayName || model.model }}{{ model.isDefault ? "（默认）" : "" }}
              </option>
            </select>
          </label>
          <p class="muted">{{ activeModel?.description }}</p>
          <label v-if="efforts.length">
            推理强度
            <select v-model="selectedEffort">
              <option
                v-for="effort in efforts"
                :key="effort.reasoningEffort"
                :value="effort.reasoningEffort"
              >
                {{ effort.reasoningEffort }} — {{ effort.description }}
              </option>
            </select>
          </label>
          <footer>
            <button type="button" @click="close">取消</button>
            <button type="button" :disabled="saving || !selectedModel" @click="save">
              {{ saving ? "应用中…" : "应用" }}
            </button>
          </footer>
        </template>
      </section>
    </div>
    <div v-if="commandOpen" class="codex-model-overlay" @click.self="closeCommand">
      <section
        class="codex-model-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="commandTitle"
      >
        <header>
          <h2>{{ commandTitle }}</h2>
          <button type="button" @click="closeCommand">关闭</button>
        </header>
        <p v-if="commandLoading" class="muted">正在从 Codex 获取信息…</p>
        <p v-else-if="commandError" class="error">{{ commandError }}</p>
        <template v-else>
          <div v-if="commandChoices.length" class="command-choices">
            <button
              v-for="choice in commandChoices"
              :key="choice.value"
              type="button"
              :disabled="commandLoading || choice.disabled"
              @click="selectCommandChoice(choice.value)"
            >
              <strong>{{ choice.label }}</strong>
              <small v-if="choice.description">{{ choice.description }}</small>
            </button>
          </div>
          <pre v-else-if="commandResult" class="command-result">{{ commandResult }}</pre>
          <p v-else class="muted">命令已完成。</p>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import * as api from "@/api";

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ insert: [text: string] }>();
const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const models = ref<api.CodexModelInfo[]>([]);
const selectedModel = ref("");
const selectedEffort = ref("");
const commandOpen = ref(false);
const commandLoading = ref(false);
const commandError = ref("");
const commandName = ref("");
const commandData = ref<Record<string, unknown> | null>(null);

const knownCommands = new Set([
  "compact",
  "status",
  "permissions",
  "skills",
  "plan",
  "fast",
  "personality",
  "mcp",
  "apps",
  "plugins",
  "hooks",
  "usage",
  "review",
  "goal",
  "rename",
  "agent",
  "ps",
  "stop",
  "fork",
  "ide",
  "keymap",
  "vim",
  "setup-default-sandbox",
  "sandbox-add-read-dir",
  "clear",
  "archive",
  "delete",
  "copy",
  "exit",
  "experimental",
  "approve",
  "memories",
  "import",
  "feedback",
  "init",
  "logout",
  "mention",
  "app",
  "side",
  "btw",
  "raw",
  "resume",
  "new",
  "quit",
  "debug-config",
  "statusline",
  "title",
  "theme",
  "pets",
  "pet",
]);
const commandTitle = computed(() => `Codex /${commandName.value}`);
const commandResult = computed(() =>
  commandData.value ? JSON.stringify(commandData.value, null, 2) : "",
);
interface CommandChoice {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

const commandChoices = computed<CommandChoice[]>(() => {
  if (commandName.value === "personality") {
    const choices = Array.isArray(commandData.value?.choices) ? commandData.value.choices : [];
    return choices.map((value) => ({ label: String(value), value: String(value) }));
  }
  if (commandName.value === "permissions") {
    const choices = Array.isArray(commandData.value?.data) ? commandData.value.data : [];
    return choices.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        label: String(record.id ?? ""),
        value: String(record.id ?? ""),
        description: String(record.description ?? ""),
        disabled: record.allowed === false,
      };
    });
  }
  if (commandName.value === "skills") {
    const groups = Array.isArray(commandData.value?.data) ? commandData.value.data : [];
    return groups.flatMap((group) => {
      const skills = Array.isArray((group as Record<string, unknown>).skills)
        ? ((group as Record<string, unknown>).skills as unknown[])
        : [];
      return skills.map((item) => {
        const skill = item as Record<string, unknown>;
        return {
          label: String(skill.name ?? ""),
          value: String(skill.name ?? ""),
          description: String(skill.shortDescription ?? skill.description ?? ""),
          disabled: skill.enabled === false,
        };
      });
    });
  }
  return [];
});

const activeModel = computed(() =>
  models.value.find((model) => model.model === selectedModel.value),
);
const efforts = computed(() => activeModel.value?.supportedReasoningEfforts ?? []);

async function showModelPicker() {
  open.value = true;
  loading.value = true;
  error.value = "";
  try {
    models.value = await api.getCodexSessionModels(props.sessionId);
    const initial = models.value.find((model) => model.isDefault) ?? models.value[0];
    selectedModel.value = initial?.model ?? "";
    selectedEffort.value = initial?.defaultReasoningEffort ?? "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

function handleCommand(text: string): boolean {
  const match = text.trim().match(/^\/(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) return false;
  const command = (match[1] ?? "").toLowerCase();
  const argument = match[2]?.trim();
  if (command === "model") {
    void showModelPicker();
    return true;
  }
  if (!knownCommands.has(command)) return false;
  void runCommand(command, argument);
  return true;
}

async function runCommand(command: string, argument?: string) {
  commandOpen.value = true;
  commandLoading.value = true;
  commandError.value = "";
  commandName.value = command;
  commandData.value = null;
  try {
    commandData.value = await api.executeCodexSessionCommand(props.sessionId, command, argument);
  } catch (cause) {
    commandError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    commandLoading.value = false;
  }
}

function closeCommand() {
  if (!commandLoading.value) commandOpen.value = false;
}

function selectCommandChoice(value: string) {
  if (commandName.value === "skills") {
    emit("insert", `$${value} `);
    commandOpen.value = false;
    return;
  }
  void runCommand(commandName.value, value);
}

function close() {
  if (!saving.value) open.value = false;
}

async function save() {
  if (!selectedModel.value) return;
  saving.value = true;
  error.value = "";
  try {
    await api.updateCodexSessionSettings(props.sessionId, {
      model: selectedModel.value,
      effort: selectedEffort.value || undefined,
    });
    open.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}

defineExpose({ handleCommand });
</script>

<style scoped>
.codex-model-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 45%);
}

.codex-model-dialog {
  width: min(520px, 100%);
  padding: 18px;
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 10px;
  background: var(--app-chat-bg);
  color: var(--app-text-primary);
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

footer {
  justify-content: flex-end;
  margin-top: 20px;
}

h2 {
  margin: 0;
  font-size: 16px;
}

label {
  display: grid;
  gap: 6px;
  margin-top: 16px;
  font-size: 13px;
}

select,
button {
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 6px;
  padding: 7px 9px;
  background: var(--app-chat-bg);
  color: inherit;
}

.muted {
  color: var(--app-text-muted);
  font-size: 12px;
}

.error {
  color: #dc2626;
}

.command-result {
  max-height: min(60vh, 520px);
  margin-top: 16px;
  padding: 12px;
  overflow: auto;
  border-radius: 6px;
  background: var(--app-hover);
  font:
    12px/1.5 ui-monospace,
    monospace;
  white-space: pre-wrap;
}

.command-choices {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.command-choices button {
  display: grid;
  gap: 3px;
  text-align: left;
}

.command-choices small {
  color: var(--app-text-muted);
}
</style>
