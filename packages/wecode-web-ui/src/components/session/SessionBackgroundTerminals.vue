<template>
  <div v-if="terminals.length" class="bg-terminals">
    <button type="button" class="bg-terminals__summary" :aria-expanded="expanded" @click="expanded = !expanded">
      <ChevronRight class="bg-terminals__chevron" :class="{ 'bg-terminals__chevron--open': expanded }" />
      <span>{{ t("session.background.count", { count: terminals.length }) }}</span>
    </button>
    <ul v-if="expanded" class="bg-terminals__list">
      <li v-for="shell in terminals" :key="shell.id" class="bg-terminals__item">
        <button type="button" class="bg-terminals__open" :title="shellCommand(shell)" @click="$emit('open', shell.id)">
          <span class="bg-terminals__dot" :data-status="shell.status" />
          <span class="bg-terminals__label">{{ shellLabel(shell) }}</span>
        </button>
        <button v-if="canCancel(shell)" type="button" class="bg-terminals__kill" :title="t('session.background.stop')" :disabled="killingId === shell.id" @click.stop="kill(shell.id)">
          {{ t("session.background.stop") }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { cancelSessionShell, getSessionShells, type SessionShell } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { useSessionStore } from "@/store";
import { useI18n } from "@/i18n";

const props = defineProps<{ sessionId: string }>();
const { t } = useI18n();
const emit = defineEmits<{ open: [shellId: string]; changed: [] }>();
const terminals = ref<SessionShell[]>([]);
const expanded = ref(true);
const killingId = ref<string | null>(null);
const sessionStore = useSessionStore();
let poll: ReturnType<typeof setInterval> | undefined;

function isLive(shell: SessionShell): boolean {
  return shell.status === "running" || shell.status === "waiting" || shell.status === "queued" || shell.status === "active";
}
function shellCommand(shell: SessionShell): string {
  return shell.command?.trim() || (typeof shell.metadata.command === "string" ? shell.metadata.command.trim() : "") || shell.title;
}
function shellLabel(shell: SessionShell): string {
  const label = shell.kind === "service" ? `Service · ${shell.title}` : shell.kind === "eval" ? "Eval" : shellCommand(shell);
  return label.length <= 42 ? label : `${label.slice(0, 40)}…`;
}
function canCancel(shell: SessionShell): boolean {
  return isLive(shell) && shell.capabilities.includes("cancel");
}
async function refresh() {
  const sessionId = props.sessionId;
  if (!sessionId || document.hidden) return;
  const snapshot = await getSessionShells(sessionId).catch(() => undefined);
  if (!snapshot || props.sessionId !== sessionId) return;
  const previous = terminals.value.map((shell) => shell.id).join(",");
  terminals.value = snapshot.shells;
  if (previous !== snapshot.shells.map((shell) => shell.id).join(",")) emit("changed");
}
async function kill(shellId: string) {
  if (killingId.value) return;
  killingId.value = shellId;
  try {
    await cancelSessionShell(props.sessionId, shellId);
    void sessionStore.fetchSession(props.sessionId);
    showUiMessage(t("session.background.stopped"), "success");
    await refresh();
    emit("changed");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("session.background.stopFailed"), "error");
  } finally {
    killingId.value = null;
  }
}
function startPolling() {
  if (poll) clearInterval(poll);
  void refresh();
  poll = setInterval(() => void refresh(), 2000);
}
onMounted(startPolling);
watch(() => props.sessionId, startPolling);
onBeforeUnmount(() => { if (poll) clearInterval(poll); });
</script>

<style scoped>
.bg-terminals { flex: none; border-bottom: 1px solid var(--app-border-subtle); }
.bg-terminals__summary { display: flex; width: 100%; align-items: center; gap: 4px; padding: 8px 10px; border: 0; background: transparent; color: var(--app-text-muted); font-size: var(--app-font-caption); font-weight: var(--app-font-weight-medium); text-align: left; cursor: pointer; }
.bg-terminals__summary:hover, .bg-terminals__open:hover { background: var(--app-hover); color: var(--app-text-primary); }
.bg-terminals__chevron { width: .875rem; height: .875rem; flex: none; transition: transform .12s ease; }
.bg-terminals__chevron--open { transform: rotate(90deg); }
.bg-terminals__list { margin: 0; padding: 0 6px 8px; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.bg-terminals__item { display: flex; align-items: center; gap: 4px; min-width: 0; }
.bg-terminals__open { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--app-text-primary); font-size: var(--app-font-caption); text-align: left; cursor: pointer; }
.bg-terminals__dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--app-status-running, #07c160); }
.bg-terminals__dot[data-status="waiting"], .bg-terminals__dot[data-status="queued"] { background: var(--app-text-muted); }
.bg-terminals__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bg-terminals__kill { flex: none; padding: 4px 6px; color: var(--app-text-muted); font-size: var(--app-font-micro); }
</style>
