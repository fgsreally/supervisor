<template>
  <div class="agent-config mx-auto w-full max-w-[1040px]">
    <section class="agent-config-section">
      <div class="agent-config-section__title">
        <div>
          <h3>基本配置</h3>
          <p>外部 Agent 的运行方式与本机可用性</p>
        </div>
      </div>
      <dl class="agent-config-list">
        <div class="agent-config-row">
          <dt>运行后端</dt>
          <dd>{{ backendLabel }}</dd>
        </div>
        <div class="agent-config-row">
          <dt>启动命令</dt>
          <dd class="external-inline-value">
            <span class="external-inline-text">{{ displayCommand }}</span>
            <button
              type="button"
              class="external-agent-edit-icon"
              title="修改启动命令"
              aria-label="修改启动命令"
              @click="openEditor"
            >
              <Wrench class="w-4 h-4" />
            </button>
          </dd>
        </div>
        <div class="agent-config-row">
          <dt>可用性</dt>
          <dd class="external-inline-value">
            <template v-if="agent.available !== false">
              <span v-if="versionLabel" class="external-inline-text">{{ versionLabel }}</span>
              <Check
                class="external-availability-icon external-availability-icon--ok"
                aria-label="可用"
              />
            </template>
            <template v-else-if="isNotInstalled">
              <a
                v-if="canInstall"
                href="#"
                class="external-install-link"
                :aria-disabled="installing || undefined"
                @click.prevent="installInBackground"
              >
                <Loader2 v-if="installing" class="w-3 h-3 animate-spin" />
                <span>帮我安装</span>
              </a>
              <span v-else class="external-inline-text">未安装</span>
            </template>
            <template v-else>
              <span class="external-inline-text external-availability-error">
                {{ agent.unavailableReason || "检测失败" }}
              </span>
              <X
                class="external-availability-icon external-availability-icon--error"
                aria-label="不可用"
              />
            </template>
          </dd>
        </div>
        <div v-if="detectCommandLabel" class="agent-config-row">
          <dt>检测命令</dt>
          <dd>{{ detectCommandLabel }}</dd>
        </div>
      </dl>
    </section>

    <Teleport to="body">
      <div
        v-if="editorOpen"
        class="external-command-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
        @click.self="closeEditor"
      >
        <section
          class="external-command-dialog w-full max-w-lg overflow-hidden rounded-lg border shadow-xl"
        >
          <header class="h-12 px-4 border-b flex items-center shrink-0">
            <h2 class="text-[15px] font-medium flex-1">修改启动命令</h2>
            <button type="button" class="external-command-close" title="关闭" @click="closeEditor">
              <X class="w-5 h-5" />
            </button>
          </header>
          <div class="p-4 space-y-3">
            <label class="block text-[13px]">
              <span class="external-command-label mb-1 block">命令</span>
              <UiField
                v-model="draft.command"
                type="text"
                class="font-mono"
                placeholder="cursor-agent"
              />
            </label>
            <label class="block text-[13px]">
              <span class="external-command-label mb-1 block">参数（每行一个）</span>
              <UiField
                v-model="draft.args"
                as="textarea"
                rows="6"
                class="font-mono resize-y"
                placeholder="--yolo"
              />
            </label>
            <p class="text-[12px] external-command-hint">
              实际启动为：<code>{{ previewLine }}</code>
            </p>
          </div>
          <footer class="px-4 py-3 border-t flex justify-end gap-2">
            <UiButton @click="closeEditor">取消</UiButton>
            <UiActionButton :disabled="!canSave" :loading="saving" @click="save">
              保存
            </UiActionButton>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Check, Loader2, Wrench, X } from "lucide-vue-next";
import type { Agent } from "@/api";
import { useAgentStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { installExternalAgent } from "@/composables/use-external-agent-actions";
import UiActionButton from "./UiActionButton.vue";
import { UiButton, UiField } from "./ui";

const props = defineProps<{ agent: Agent }>();
const emit = defineEmits<{ saved: [] }>();

const agentStore = useAgentStore();
const editorOpen = ref(false);
const saving = ref(false);
const installing = ref(false);
const draft = reactive({ command: "", args: "" });

const versionLabel = computed(() => props.agent.detectedVersion?.trim() || "");
const isNotInstalled = computed(
  () => props.agent.available === false && !props.agent.executablePath,
);
const canInstall = computed(() => Boolean(props.agent.installCommand?.trim()));

const backendLabel = computed(() => {
  if (props.agent.backendType === "codex") return "Codex";
  if (props.agent.backendType === "claude") return "Claude Code";
  if (props.agent.backendType === "kimi") return "Kimi Code";
  if (props.agent.backendType === "cursor") return "Cursor";
  if (props.agent.backendType === "mimo") return "MiMo Code";
  return "ACP";
});

const DEFAULT_COMMANDS: Partial<Record<Agent["backendType"], string>> = {
  claude: "claude",
  codex: "codex",
  kimi: "kimi",
  cursor: "cursor-agent",
  mimo: "mimo",
};

const ACP_BACKENDS = new Set<Agent["backendType"]>(["kimi", "cursor", "mimo"]);

const DEFAULT_ARGS: Partial<Record<Agent["backendType"], string[]>> = {
  kimi: ["acp"],
  cursor: ["acp"],
  mimo: ["acp"],
};

function userVisibleArgs(args: string[]): string[] {
  return args.filter((arg) => arg !== "acp");
}

function mergeAcpArgs(args: string[]): string[] {
  const visible = args.filter((arg) => arg !== "acp");
  return ACP_BACKENDS.has(props.agent.backendType) ? [...visible, "acp"] : visible;
}

function resolveCommandParts(agent: Agent): { command: string; args: string[] } {
  const legacy = agent.meta.external as { command?: string; args?: string[] } | undefined;
  const rawCommand =
    agent.externalConfig?.command ??
    (typeof agent.meta.command === "string" ? agent.meta.command : legacy?.command) ??
    "";
  const command =
    (rawCommand.trim() === "agent" && agent.backendType === "cursor"
      ? (DEFAULT_COMMANDS.cursor ?? rawCommand)
      : rawCommand.trim()) ||
    (DEFAULT_COMMANDS[agent.backendType] ?? "");
  const rawArgs =
    agent.externalConfig?.args ??
    (Array.isArray(agent.meta.args) ? agent.meta.args : legacy?.args) ??
    [];
  const args = rawArgs.filter((value): value is string => typeof value === "string");
  return {
    command,
    args: args.length > 0 ? args : (DEFAULT_ARGS[agent.backendType] ?? []),
  };
}

const commandParts = computed(() => resolveCommandParts(props.agent));
const displayCommand = computed(() => commandParts.value.command || "-");

const detectCommandLabel = computed(() => {
  const parts = resolveCommandParts(props.agent);
  const detectArgs = props.agent.externalConfig?.detectArgs?.filter(Boolean) ??
    DEFAULT_DETECT_ARGS[props.agent.backendType] ?? ["--version"];
  if (!parts.command) return "";
  return [parts.command, ...detectArgs].join(" ");
});

const DEFAULT_DETECT_ARGS: Partial<Record<Agent["backendType"], string[]>> = {
  codex: ["--version"],
  claude: ["--version"],
  kimi: ["--version"],
  cursor: ["--version"],
  mimo: ["--version"],
  acp: ["--version"],
};

const previewArgs = computed(() =>
  draft.args
    .split(/\r?\n/)
    .map((arg) => arg.trim())
    .filter(Boolean),
);
const previewLine = computed(
  () => [draft.command.trim(), ...mergeAcpArgs(previewArgs.value)].filter(Boolean).join(" ") || "-",
);
const canSave = computed(() => Boolean(draft.command.trim()));

function openEditor() {
  const parts = resolveCommandParts(props.agent);
  draft.command = parts.command;
  draft.args = userVisibleArgs(parts.args).join("\n");
  editorOpen.value = true;
}

function closeEditor() {
  if (!saving.value) editorOpen.value = false;
}

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    await agentStore.updateAgent(props.agent.id, {
      externalConfig: {
        ...(props.agent.externalConfig ?? { command: draft.command.trim() }),
        command: draft.command.trim(),
        args: mergeAcpArgs(previewArgs.value),
      },
    });
    showUiMessage("启动命令已更新", "success");
    emit("saved");
    editorOpen.value = false;
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "保存失败", "error");
  } finally {
    saving.value = false;
  }
}

async function installInBackground() {
  if (installing.value || !canInstall.value) return;
  installing.value = true;
  try {
    const updated = await installExternalAgent(props.agent);
    if (updated) emit("saved");
  } finally {
    installing.value = false;
  }
}
</script>

<style scoped>
.agent-config {
  padding: 2px 0 28px;
}

.agent-config-section {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-border-subtle) 84%, transparent);
  border-radius: 12px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.agent-config-section__title {
  display: flex;
  align-items: center;
  min-height: 64px;
  padding: 13px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.agent-config-section__title h3 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.agent-config-section__title p {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.agent-config-list {
  padding: 0 20px;
}

.agent-config-row {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  min-height: 54px;
  align-items: center;
  gap: 18px;
  padding: 9px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border-subtle) 78%, transparent);
  font-size: 13px;
}

.agent-config-row:last-child {
  border-bottom: 0;
}

.agent-config-row dt {
  color: var(--app-text-secondary);
}

.agent-config-row dd {
  min-width: 0;
  color: var(--app-text-primary);
  font-weight: 450;
}

.external-inline-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}

.external-inline-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.external-agent-edit-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  margin-left: 10px;
  color: var(--app-accent);
  cursor: pointer;
}

.external-agent-edit-icon:hover {
  opacity: 0.82;
}

.external-agent-edit-icon:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.external-availability-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.external-availability-icon--ok {
  color: #07c160;
}

.external-availability-icon--error {
  color: #e54d42;
}

.external-availability-error {
  color: #e54d42;
}

.external-install-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--app-accent);
  font-size: 12px;
  line-height: 1.2;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.external-install-link:hover {
  opacity: 0.82;
}

.external-install-link[aria-disabled="true"] {
  opacity: 0.55;
  pointer-events: none;
  cursor: not-allowed;
}

.external-command-overlay {
  background: rgb(0 0 0 / 42%);
}

.external-command-dialog {
  background: var(--app-settings-bg);
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.external-command-dialog header,
.external-command-dialog footer {
  border-color: var(--app-border);
}

.external-command-close {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 6px;
  color: var(--app-text-secondary);
}

.external-command-close:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.external-command-label {
  color: var(--app-text-secondary);
}

.external-command-hint {
  color: var(--app-text-secondary);
}

.external-command-hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--app-text-primary);
}
</style>
