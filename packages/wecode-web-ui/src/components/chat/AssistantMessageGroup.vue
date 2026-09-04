<template>
  <div
    class="assistant-message-row flex justify-start items-start gap-2"
    @pointerdown="startLongPress"
    @pointerup="cancelLongPress"
    @pointercancel="cancelLongPress"
    @pointermove="onPointerMove"
    @contextmenu.prevent="onContextMenu"
  >
    <slot name="avatar">
      <AgentAvatar
        v-if="avatarIcon"
        class="chat-avatar shrink-0"
        :agent-id="avatarAgentId || sessionId"
        :agent-name="avatarLabel || 'A'"
        :icon="avatarIcon"
      />
      <div
        v-else
        class="chat-avatar chat-avatar--agent shrink-0"
        :style="{ backgroundColor: avatarColor }"
      >
        {{ avatarLabel }}
      </div>
    </slot>
    <div class="max-w-[82%] flex flex-col items-start min-w-0 assistant-message-body">
      <span v-if="timeLabel" class="chat-msg-time chat-msg-time--agent">{{ timeLabel }}</span>
      <div
        class="relative px-3.5 py-2.5 w-full chat-bubble"
        :class="[
          { 'ring-2 ring-[#07c160]/40': searchHit },
          tone === 'warning' && 'chat-bubble--warning',
          tone === 'error' && 'chat-bubble--error',
        ]"
        :style="{
          background: 'var(--app-bubble-assistant)',
          color: 'var(--app-text-primary)',
          borderRadius: 'var(--app-bubble-radius)',
          fontSize: 'var(--chat-msg-font-size, 14px)',
        }"
      >
        <div
          class="absolute top-3 w-2 h-2 rotate-45 -left-1 chat-bubble-tail"
          :style="{ background: 'var(--app-bubble-assistant)' }"
        />
        <div class="relative z-10 leading-[1.42] flex flex-col gap-2.5">
          <template v-for="segment in displaySegments" :key="segment.key">
            <div
              v-if="segment.kind === 'execution'"
              class="external-details external-details--collapsed"
              :class="{ 'external-details--live': segment.active }"
            >
              <button
                type="button"
                class="external-details__summary"
                :aria-expanded="executionOpen === segment.key"
                @click="executionOpen = executionOpen === segment.key ? null : segment.key"
              >
                <ChevronRight
                  :class="{ 'external-details__chevron--open': executionOpen === segment.key }"
                />
                <Transition name="execution-step" mode="out-in">
                  <span
                    :key="
                      segment.active
                        ? showThinking
                          ? t('chat.thinking')
                          : segment.label
                        : `summary-${segment.pieces.length}`
                    "
                    >{{
                      segment.active
                        ? showThinking
                          ? t("chat.thinking")
                          : segment.label
                        : t("chat.executionSummary", { count: segment.pieces.length })
                    }}</span
                  >
                </Transition>
              </button>
              <div
                class="external-details__collapse"
                :class="{ 'external-details__collapse--open': executionOpen === segment.key }"
              >
                <div class="external-details__body">
                  <template v-for="({ piece, index }, pieceIndex) in segment.pieces" :key="index">
                    <ThinkingBlock
                      v-if="piece.kind === 'thinking'"
                      :content="piece.text"
                      :streaming="segment.active && pieceIndex === segment.pieces.length - 1"
                    />
                    <ToolStepRenderer
                      v-else-if="piece.kind === 'bash' || piece.kind === 'toolStep'"
                      :session-id="sessionId"
                      :piece="piece"
                      :all-pieces="group.pieces"
                      :pending="isToolPiecePending(piece)"
                      :is-error="piece.result?.isError"
                      @open-tool="
                        (name, args, result, entryId) =>
                          emit('open-tool', name, args, result, entryId)
                      "
                      @open-bash="
                        (cmd, result, intent, entryId) =>
                          emit('open-bash', cmd, result, intent, entryId)
                      "
                      @navigate="emit('navigate', $event)"
                      @answered="emit('answered')"
                      @open-external-detail="
                        (args, result) => emit('open-external-detail', args, result)
                      "
                    />
                  </template>
                </div>
              </div>
            </div>
            <ThinkingBlock
              v-else-if="segment.piece.kind === 'thinking'"
              :content="segment.piece.text"
              :streaming="segment.active"
            />
            <MarkdownContent
              v-else-if="segment.piece.kind === 'text'"
              variant="terminal"
              :content="segment.piece.text"
            />
          </template>

          <div
            v-if="showThinking && !(viewPreferences.collapseExternalAgentDetails && isActiveStreamGroup)"
            class="assistant-loading"
          >
            <Loader2 class="w-4 h-4 animate-spin shrink-0" />
            <span>{{ t("chat.thinking") }}</span>
          </div>
        </div>
      </div>
      <span v-if="durationLabel" class="chat-msg-duration">
        {{ t("chat.duration", { duration: durationLabel }) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ChevronRight, Loader2 } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { DisplayGroup, RenderPiece } from "@/utils/flatten-messages";
import MarkdownContent from "../base/MarkdownContent.vue";
import ThinkingBlock from "./ThinkingBlock.vue";
import ToolStepRenderer from "./ToolStepRenderer.vue";
import AgentAvatar from "../agent/AgentAvatar.vue";
import { viewPreferences } from "@/utils/view-preferences";

const executionOpen = ref<string | null>(null);
const { t } = useI18n();

const props = defineProps<{
  sessionId: string;
  group: Extract<DisplayGroup, { type: "grouped_assistant" }>;
  showThinkingBlocks: boolean;
  isStreaming: boolean;
  streamingGroupId: string | null;
  timeLabel: string;
  durationLabel?: string | null;
  /** Latest assistant turn: always show duration; older turns show on hover. */
  durationPinned?: boolean;
  searchHit?: boolean;
  avatarLabel?: string;
  avatarColor?: string;
  avatarIcon?: string | null;
  avatarAgentId?: string;
  externalAgent?: boolean;
  tone?: "warning" | "error";
}>();

const emit = defineEmits<{
  "open-tool": [
    toolName: string,
    callArgs?: Record<string, unknown>,
    result?: Array<{ type: string; text: string }>,
    resultEntryId?: string,
  ];
  "open-bash": [
    command: string,
    result?: Array<{ type: string; text: string }>,
    intent?: string,
    resultEntryId?: string,
  ];
  navigate: [sessionId: string];
  answered: [];
  "open-external-detail": [
    callArgs?: Record<string, unknown>,
    result?: Array<{ type: string; text: string }>,
  ];
  "open-actions": [payload: { mode: "menu" | "sheet"; x: number; y: number }];
}>();

let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressStart = { x: 0, y: 0 };

const isToolPiece = (
  piece: RenderPiece,
): piece is Extract<RenderPiece, { kind: "bash" | "toolStep" }> =>
  piece.kind === "bash" || piece.kind === "toolStep";

const lastToolIndex = computed(() =>
  props.group.pieces.reduce((latest, piece, index) => (isToolPiece(piece) ? index : latest), -1),
);

const lastExecutionIndex = computed(() =>
  props.group.pieces.reduce(
    (latest, piece, index) => (piece.kind === "thinking" || isToolPiece(piece) ? index : latest),
    -1,
  ),
);

const isActiveStreamGroup = computed(
  () => props.isStreaming && props.streamingGroupId === props.group.id,
);

/** Only tool calls belong to the execution rail; text stays in the message area. */
const collapseExecution = computed(
  () => viewPreferences.collapseExternalAgentDetails && lastExecutionIndex.value >= 0,
);

/** Hide "执行过程" chrome while streaming; show it only after the turn finishes. */
const showExecutionSummary = computed(() => collapseExecution.value && !isActiveStreamGroup.value);

const currentExecutionPiece = computed(() => {
  const pieces = props.group.pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ index }) => index <= lastExecutionIndex.value)
    .filter(
      ({ piece }) =>
        props.showThinkingBlocks || piece.kind !== "thinking" || isActiveStreamGroup.value,
    );
  return pieces.at(-1);
});

const currentExecutionLabel = computed(() => {
  const piece = currentExecutionPiece.value?.piece;
  if (!piece) return "";
  if (piece.kind === "text" || piece.kind === "thinking") return piece.text.replace(/\s+/g, " ");
  if (piece.kind === "bash") return piece.command;
  return piece.toolName;
});

const collapsedExecutionPieces = computed(() =>
  collapseExecution.value
    ? isActiveStreamGroup.value
      ? currentExecutionPiece.value
        ? [currentExecutionPiece.value]
        : []
      : props.group.pieces
          .map((piece, index) => ({ piece, index }))
          .filter(
            ({ piece, index }) =>
              // Respect "显示思考过程": never leak thinking into the collapsed rail.
              (props.showThinkingBlocks || piece.kind !== "thinking") &&
              (index <= lastToolIndex.value || piece.kind !== "text"),
          )
    : [],
);

const displayPieces = computed(() =>
  props.group.pieces
    .map((piece, index) => ({ piece, index }))
    .filter(
      ({ piece, index }) =>
        (props.showThinkingBlocks || piece.kind !== "thinking") &&
        (!collapseExecution.value ||
          (!isActiveStreamGroup.value && index > lastToolIndex.value && piece.kind === "text")),
    ),
);

const displaySegments = computed(() => {
  type Segment =
    | { key: string; kind: "text"; piece: RenderPiece; active: boolean }
    | {
        key: string;
        kind: "execution";
        pieces: Array<{ piece: RenderPiece; index: number }>;
        active: boolean;
        label: string;
      };
  const segments: Segment[] = [];
  let run: Array<{ piece: RenderPiece; index: number }> = [];
  let runKind: "text" | "execution" | null = null;
  let part = 0;
  const flush = () => {
    if (!run.length) return;
    if (runKind === "execution") {
      const last = run.at(-1)!.piece;
      const label =
        last.kind === "thinking"
          ? last.text.replace(/\s+/g, " ")
          : last.kind === "bash"
            ? last.command
            : last.kind === "toolStep"
              ? last.toolName
              : "";
      segments.push({ key: `execution-${part++}`, kind: "execution", pieces: run, active: false, label });
    } else {
      for (const item of run) {
        if (item.piece.kind === "thinking" && !props.showThinkingBlocks) continue;
        segments.push({ key: `text-${part++}`, kind: "text", piece: item.piece, active: false });
      }
    }
    run = [];
    runKind = null;
  };
  props.group.pieces.forEach((piece, index) => {
    const kind = piece.kind === "text" ? "text" : "execution";
    if (runKind && kind !== runKind) flush();
    runKind = kind;
    run.push({ piece, index });
  });
  flush();
  if (isActiveStreamGroup.value && segments.at(-1)?.kind === "execution") {
    segments.at(-1)!.active = true;
  }
  return segments;
});

// After stream ends, keep the rail open one frame then close so CSS can animate the collapse.
watch(isActiveStreamGroup, (active, wasActive) => {
  if (!wasActive || active || !collapseExecution.value) return;
  executionOpen.value = "stream";
  nextTick(() => {
    requestAnimationFrame(() => {
      executionOpen.value = null;
    });
  });
});

function showTextDivider(displayIndex: number): boolean {
  if (displayIndex <= 0) return false;
  const prev = displayPieces.value[displayIndex - 1]?.piece;
  const curr = displayPieces.value[displayIndex]?.piece;
  return prev?.kind === "text" && curr?.kind === "text";
}

function isStreamingPiece(pieceIndex: number): boolean {
  if (!isActiveStreamGroup.value) return false;
  const piece = props.group.pieces[pieceIndex];
  if (piece?.kind !== "text" && piece?.kind !== "thinking") return false;
  // Only the trailing text/thinking piece is still growing; earlier segments are done.
  return pieceIndex === props.group.pieces.length - 1;
}

function isToolPiecePending(piece: RenderPiece): boolean {
  if (piece.kind === "bash" || piece.kind === "toolStep") {
    return isActiveStreamGroup.value && props.group.pieces.at(-1) === piece && !piece.result;
  }
  return false;
}

const showThinking = computed(() => {
  if (!isActiveStreamGroup.value) return false;
  const hasPendingTool = props.group.pieces.some(
    (p) => (p.kind === "bash" || p.kind === "toolStep") && !p.result,
  );
  if (hasPendingTool) return false;

  const lastPiece = props.group.pieces[props.group.pieces.length - 1];
  if (!lastPiece) return true;
  if (lastPiece.kind === "text") return false;
  if (lastPiece.kind === "thinking" && !props.showThinkingBlocks) return true;
  if (lastPiece.kind === "bash" || lastPiece.kind === "toolStep") return !!lastPiece.result;
  return false;
});

function startLongPress(event: PointerEvent) {
  if (event.pointerType === "mouse") return;
  cancelLongPress();
  longPressStart = { x: event.clientX, y: event.clientY };
  longPressTimer = setTimeout(() => {
    emit("open-actions", { mode: "sheet", x: event.clientX, y: event.clientY });
  }, 520);
}

function onPointerMove(event: PointerEvent) {
  if (
    Math.abs(event.clientX - longPressStart.x) > 10 ||
    Math.abs(event.clientY - longPressStart.y) > 10
  ) {
    cancelLongPress();
  }
}

function cancelLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = undefined;
}

function onContextMenu(event: MouseEvent) {
  cancelLongPress();
  emit("open-actions", { mode: "menu", x: event.clientX, y: event.clientY });
}

onBeforeUnmount(cancelLongPress);
</script>

<style scoped>
.assistant-message-body {
  font-family:
    Inter, "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", system-ui, sans-serif;
  font-weight: 400;
  letter-spacing: 0.005em;
}

.assistant-message-body :deep(.md-content) {
  line-height: 1.65;
}

.external-details--collapsed {
  margin-top: 0;
  color: var(--app-text-secondary);
  font-size: 12px;
  padding-top: 0;
}

.external-details--live .external-details__summary {
  gap: 0.42rem;
  padding: 0.28rem 0.5rem;
  border-radius: 0.42rem;
  width: min(28rem, calc(100vw - 7rem));
  max-width: 100%;
  background: color-mix(in srgb, var(--app-accent) 6%, var(--app-bubble-assistant));
  color: var(--app-text-primary);
}

.external-details--live .external-details__summary > span:last-child {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-secondary);
  font-weight: var(--app-font-weight-regular);
}

.execution-step-enter-active,
.execution-step-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.execution-step-enter-from {
  opacity: 0;
  transform: translateY(0.35rem);
}

.execution-step-leave-to {
  opacity: 0;
  transform: translateY(-0.35rem);
}

.external-details--live .external-details__summary::before {
  content: "";
  width: 0.48rem;
  height: 0.48rem;
  flex: none;
  border-radius: 999px;
  background: var(--app-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 18%, transparent);
  animation: external-details-live-pulse 1.5s ease-in-out infinite;
}

@keyframes external-details-live-pulse {
  50% {
    opacity: 0.42;
    transform: scale(0.78);
  }
}

.external-details__summary {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0;
  cursor: pointer;
  user-select: none;
}

.external-details__summary svg {
  width: 0.9rem;
  height: 0.9rem;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.external-details__chevron--open {
  transform: rotate(90deg);
}

.external-details__collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.22s ease;
}

.external-details__collapse--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.external-details__body {
  display: flex;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.35rem;
}
.chat-msg-time {
  font-size: 11px;
  line-height: 1;
  color: var(--app-text-muted);
  opacity: 0.85;
  white-space: nowrap;
  margin-bottom: 4px;
}

.chat-msg-time--agent {
  align-self: flex-start;
  margin-left: 2px;
}

.chat-msg-duration {
  align-self: flex-end;
  margin-top: 4px;
  margin-right: 2px;
  font-size: 11px;
  line-height: 1;
  color: var(--app-text-muted);
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
  white-space: nowrap;
}

.assistant-message-row:hover .chat-msg-duration {
  opacity: 0.85;
}

.chat-bubble--warning {
  color: #d99000 !important;
  background: color-mix(in srgb, #d99000 9%, var(--app-bubble-assistant)) !important;
  box-shadow: inset 0 0 0 1px rgb(217 144 0 / 42%);
}
.chat-bubble--warning :deep(.md-content) {
  color: #d99000;
}
.chat-bubble--warning .chat-bubble-tail {
  background: color-mix(in srgb, #d99000 9%, var(--app-bubble-assistant)) !important;
  box-shadow: -1px 1px 0 rgb(217 144 0 / 72%);
}

.chat-bubble--error {
  color: var(--app-danger) !important;
  background: color-mix(in srgb, var(--app-danger) 8%, var(--app-bubble-assistant)) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-danger) 42%, transparent);
}
.chat-bubble--error :deep(.md-content) {
  color: var(--app-danger);
}
.chat-bubble--error .chat-bubble-tail {
  background: color-mix(in srgb, var(--app-danger) 8%, var(--app-bubble-assistant)) !important;
  box-shadow: -1px 1px 0 color-mix(in srgb, var(--app-danger) 72%, transparent);
}

.chat-avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.chat-avatar--agent {
  background: #3b82f6;
  color: #fff;
}

.assistant-loading {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--app-text-muted);
  font-size: 13px;
}

.assistant-piece-divider {
  margin: 0.15em 0;
  border: none;
  border-top: 1px dashed color-mix(in srgb, var(--app-text-secondary) 80%, #94a3b8);
  width: 100%;
}
</style>
