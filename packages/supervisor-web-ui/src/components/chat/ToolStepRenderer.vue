<template>
  <AskStep
    v-if="isAsk && piece.kind === 'toolStep'"
    :session-id="sessionId"
    :tool-call-id="piece.callId"
    :call-args="piece.callArgs"
    :result-content="piece.result?.content"
    :pending="pending"
    :is-error="isError"
    @answered="emit('answered')"
  />
  <ExternalInteractionStep
    v-else-if="isExternalInteraction && piece.kind === 'toolStep'"
    :session-id="sessionId"
    :args="piece.callArgs"
    :result="piece.result?.content"
    :pending="pending"
    @resolved="emit('answered')"
    @open-detail="emit('open-external-detail', piece.callArgs, piece.result?.content)"
  />
  <BashStep
    v-else-if="piece.kind === 'bash'"
    :command="piece.command"
    :intent="piece.intent"
    :result-content="piece.result?.content"
    :pending="pending"
    :is-error="isError"
    @open="emit('open-bash', piece.command, piece.result?.content, piece.intent, piece.result?.id)"
  />
  <RecordingStep
    v-else-if="isRecording && piece.kind === 'toolStep'"
    :session-id="sessionId"
    :tool-name="piece.toolName"
    :call-args="piece.callArgs"
    :result-content="piece.result?.content"
    :pending="pending"
    :is-error="isError"
    @open="openTool"
  />
  <SubagentActivityCard
    v-else-if="isExpandedSubagent && piece.kind === 'toolStep'"
    :child-session-id="childSessionId"
    :agent-name="subagentName"
    :description="subagentDescription"
    :pending="pending"
    :is-error="isError"
    @open="childSessionId && emit('navigate', childSessionId)"
  />
  <ToolActivityBar
    v-else-if="piece.kind === 'toolStep'"
    :tool-name="piece.toolName"
    :call-args="piece.callArgs"
    :result-content="piece.result?.content"
    :pending="pending"
    :is-error="isError"
    :show-navigate="piece.toolName === 'spawn_agent' && !!childSessionId"
    @open="openTool"
    @navigate="childSessionId && emit('navigate', childSessionId)"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RenderPiece } from "@/utils/flatten-messages";
import { spawnChildSessionId } from "@/utils/flatten-messages";
import { isAskToolName } from "@/utils/ask-tool";
import AskStep from "./AskStep.vue";
import ExternalInteractionStep from "./ExternalInteractionStep.vue";
import BashStep from "@/components/chat/BashStep.vue";
import RecordingStep from "./RecordingStep.vue";
import ToolActivityBar from "../tool/ToolActivityBar.vue";
import SubagentActivityCard from "./SubagentActivityCard.vue";

const props = defineProps<{
  sessionId: string;
  piece: Extract<RenderPiece, { kind: "bash" | "toolStep" }>;
  allPieces: RenderPiece[];
  pending?: boolean;
  isError?: boolean;
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
}>();

const isAsk = computed(
  () => props.piece.kind === "toolStep" && isAskToolName(props.piece.toolName),
);
const isExternalInteraction = computed(
  () =>
    props.piece.kind === "toolStep" &&
    (props.piece.toolName === "external_interaction" ||
      props.piece.callArgs?.externalInteraction === true),
);
const isRecording = computed(
  () =>
    props.piece.kind === "toolStep" &&
    ["browser", "desktop_recording"].includes(props.piece.toolName),
);

const childSessionId = computed(() => {
  if (props.piece.kind !== "toolStep") return undefined;
  return spawnChildSessionId(props.allPieces, props.piece.callId);
});
const isExpandedSubagent = computed(
  () =>
    props.piece.kind === "toolStep" &&
    props.piece.toolName === "spawn_agent" &&
    props.piece.latestSubagentInteraction === true,
);
const subagentName = computed(() =>
  props.piece.kind === "toolStep" && typeof props.piece.callArgs?.agentName === "string"
    ? props.piece.callArgs.agentName
    : undefined,
);
const subagentDescription = computed(() =>
  props.piece.kind === "toolStep" && typeof props.piece.callArgs?.description === "string"
    ? props.piece.callArgs.description
    : undefined,
);

function openTool() {
  if (props.piece.kind !== "toolStep") return;
  emit(
    "open-tool",
    props.piece.toolName,
    props.piece.callArgs,
    props.piece.result?.content,
    props.piece.result?.id,
  );
}
</script>
