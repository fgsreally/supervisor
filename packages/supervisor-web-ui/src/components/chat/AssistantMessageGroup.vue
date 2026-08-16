<template>
  <div
    class="assistant-message-row flex justify-start items-start gap-2"
    @pointerdown="startLongPress"
    @pointerup="cancelLongPress"
    @pointercancel="cancelLongPress"
    @pointermove="onPointerMove"
    @contextmenu.prevent="onContextMenu"
  >
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
    <div class="max-w-[82%] flex flex-col items-start min-w-0 assistant-message-body">
      <span class="chat-msg-time chat-msg-time--agent">{{ timeLabel }}</span>
      <div
        class="relative px-3.5 py-2.5 w-full chat-bubble"
        :class="{ 'ring-2 ring-[#07c160]/40': searchHit }"
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
          <div
            v-if="collapsedExecutionPieces.length"
            class="external-details"
            :class="{ 'external-details--collapsed': showExecutionSummary }"
          >
            <button
              v-if="showExecutionSummary"
              type="button"
              class="external-details__summary"
              :aria-expanded="executionOpen"
              @click="executionOpen = !executionOpen"
            >
              <ChevronRight :class="{ 'external-details__chevron--open': executionOpen }" />
              <span>{{ t("chat.executionSummary", { count: collapsedExecutionPieces.length }) }}</span>
            </button>
            <div
              class="external-details__collapse"
              :class="{
                'external-details__collapse--open': executionOpen || isActiveStreamGroup,
              }"
            >
              <div class="external-details__body">
                <template v-for="{ piece, index } in collapsedExecutionPieces" :key="index">
                  <ThinkingBlock
                    v-if="piece.kind === 'thinking'"
                    :content="piece.text"
                    :streaming="isStreamingPiece(index)"
                  />
                  <MarkdownContent
                    v-else-if="piece.kind === 'text'"
                    variant="terminal"
                    :content="piece.text"
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

          <template
            v-for="({ piece, index: pieceIndex }, displayIndex) in displayPieces"
            :key="pieceIndex"
          >
            <hr
              v-if="showTextDivider(displayIndex)"
              class="assistant-piece-divider"
              aria-hidden="true"
            />
            <ThinkingBlock
              v-if="piece.kind === 'thinking'"
              :content="piece.text"
              :streaming="isStreamingPiece(pieceIndex)"
            />

            <MarkdownContent
              v-else-if="piece.kind === 'text'"
              variant="terminal"
              :content="piece.text"
            />

            <ToolStepRenderer
              v-else-if="piece.kind === 'bash' || piece.kind === 'toolStep'"
              :session-id="sessionId"
              :piece="piece"
              :all-pieces="group.pieces"
              :pending="isToolPiecePending(piece)"
              :is-error="piece.result?.isError"
              @open-tool="
                (name, args, result, entryId) => emit('open-tool', name, args, result, entryId)
              "
              @open-bash="
                (cmd, result, intent, entryId) => emit('open-bash', cmd, result, intent, entryId)
              "
              @navigate="emit('navigate', $event)"
              @answered="emit('answered')"
              @open-external-detail="(args, result) => emit('open-external-detail', args, result)"
            />
          </template>

          <div v-if="showThinking" class="assistant-loading">
            <Loader2 class="w-4 h-4 animate-spin shrink-0" />
            <span>{{ t("chat.thinking") }}</span>
          </div>
        </div>
      </div>
      <span
        v-if="durationLabel"
        class="chat-msg-duration"
        :class="{ 'chat-msg-duration--pinned': durationPinned }"
      >
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

const executionOpen = ref(false);
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

/** Preference on + this turn has tools: rail execution into the collapse container. */
const collapseExecution = computed(
  () => viewPreferences.collapseExternalAgentDetails && lastToolIndex.value >= 0,
);

const isActiveStreamGroup = computed(
  () => props.isStreaming && props.streamingGroupId === props.group.id,
);

/** Hide "执行过程" chrome while streaming; show it only after the turn finishes. */
const showExecutionSummary = computed(() => collapseExecution.value && !isActiveStreamGroup.value);

const collapsedExecutionPieces = computed(() =>
  collapseExecution.value
    ? props.group.pieces
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
        (!collapseExecution.value || (index > lastToolIndex.value && piece.kind === "text")),
    ),
);

// After stream ends, keep the rail open one frame then close so CSS can animate the collapse.
watch(isActiveStreamGroup, (active, wasActive) => {
  if (!wasActive || active || !collapseExecution.value) return;
  executionOpen.value = true;
  nextTick(() => {
    requestAnimationFrame(() => {
      executionOpen.value = false;
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
  if (piece.kind === "bash" || piece.kind === "toolStep") return !piece.result;
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
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 12px;
  padding-top: 0.25rem;
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

.chat-msg-duration--pinned,
.assistant-message-row:hover .chat-msg-duration {
  opacity: 0.85;
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
