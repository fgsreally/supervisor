<template>
  <span class="chat-rich-text whitespace-pre-wrap break-words">
    <template v-for="(part, index) in parts" :key="index">
      <span v-if="part.kind === 'text'">{{ part.text }}</span>
      <a v-else-if="part.kind === 'link'" :href="part.href" target="_blank" rel="noopener noreferrer">{{ part.text }}</a>
      <ChatTagChip v-else-if="part.kind === 'file'" variant="file" :label="part.label" :source="part.source" :file-icon-kind="part.fileIconKind" />
      <ChatTagChip v-else-if="part.kind === 'image'" variant="image" :label="part.label" @image-click="emit('image-click', $event)" />
      <ChatTagChip v-else-if="part.kind === 'pasted_text'" variant="prompt" :label="part.label" @click="emit('pasted-click', pastedId(part))" />
      <ChatTagChip v-else-if="part.kind === 'attachment'" variant="file" :label="part.label" :file-icon-kind="part.fileIconKind" />
      <ChatTagChip v-else-if="part.kind === 'prompt'" variant="prompt" :label="part.label" />
      <ChatTagChip v-else variant="skill" :label="part.label" />
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/i18n";
import { useSessionStore } from "@/store";
import type { ChatAttachmentPart, ChatPastedTextPart } from "@/types/chat-entry";
import ChatTagChip from "./ChatTagChip.vue";
import { findChatTokens } from "../../utils/chat-token-patterns";
import { getExternalProjectSource } from "../../utils/project-path";
import { getFileBaseName, getFileIconKind, getFilePathFromToken, getSkillNameFromToken, type FileIconKind } from "../../utils/file-type-icon";

const props = defineProps<{ content: string; pastedTexts?: ChatPastedTextPart[]; attachments?: ChatAttachmentPart[] }>();
const emit = defineEmits<{ "image-click": [label: string]; "pasted-click": [id: string] }>();
const { t } = useI18n();
const sessionStore = useSessionStore();

type ContentPart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "file"; label: string; source?: string; fileIconKind: FileIconKind }
  | { kind: "skill"; label: string }
  | { kind: "prompt"; label: string }
  | { kind: "image"; label: string }
  | { kind: "pasted_text"; id: string; label: string }
  | { kind: "attachment"; label: string; fileIconKind: FileIconKind };

const IMAGE_REF_RE = /\[Image(?:\s*#\s*\d+)?\]/gi;
const INLINE_PART_RE = /\uE000(?:paste|attachment):([a-zA-Z0-9_-]+)\uE001/g;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

function pastedId(part: ContentPart): string {
  return part.kind === "pasted_text" ? part.id : "";
}

function pushLinkedText(result: ContentPart[], text: string) {
  let cursor = 0;
  for (const match of text.matchAll(URL_RE)) {
    const offset = match.index;
    if (offset == null) continue;
    const url = match[0].replace(/[.,!?;:)}\]]+$/, "");
    if (offset > cursor) result.push({ kind: "text", text: text.slice(cursor, offset) });
    if (url) result.push({ kind: "link", text: url, href: url });
    cursor = offset + url.length;
  }
  if (cursor < text.length) result.push({ kind: "text", text: text.slice(cursor) });
}

const parts = computed((): ContentPart[] => {
  const text = props.content;
  const tokens = findChatTokens(text);
  const projects = sessionStore.projects.map((project) => ({ id: project.id, name: project.name, cwd: project.cwd }));
  const currentCwd = sessionStore.currentSession?.cwd ?? "";
  const pastedById = new Map((props.pastedTexts ?? []).map((item) => [item.id, item]));
  const attachmentById = new Map((props.attachments ?? []).map((item) => [item.id, item]));
  const markers: Array<
    | { from: number; to: number; kind: "file" | "skill" | "prompt"; text: string }
    | { from: number; to: number; kind: "image"; label: string }
    | { from: number; to: number; kind: "pasted_text" | "attachment"; id: string }
  > = tokens.map((token) => ({
    from: token.from,
    to: token.to,
    kind: token.kind === "file" ? "file" : token.kind === "prompt" ? "prompt" : "skill",
    text: token.text,
  }));

  for (const match of text.matchAll(IMAGE_REF_RE)) {
    if (match.index != null) markers.push({ from: match.index, to: match.index + match[0].length, kind: "image", label: match[0].slice(1, -1) });
  }
  for (const match of text.matchAll(INLINE_PART_RE)) {
    if (match.index != null && match[1]) {
      markers.push({ from: match.index, to: match.index + match[0].length, kind: match[0].startsWith("\uE000paste:") ? "pasted_text" : "attachment", id: match[1] });
    }
  }
  markers.sort((a, b) => a.from - b.from || a.to - b.to);
  if (!markers.length) {
    const result: ContentPart[] = [];
    pushLinkedText(result, text);
    return result;
  }

  const result: ContentPart[] = [];
  let cursor = 0;
  for (const marker of markers) {
    if (marker.from < cursor) continue;
    if (marker.from > cursor) pushLinkedText(result, text.slice(cursor, marker.from));
    if (marker.kind === "file") {
      const path = getFilePathFromToken(marker.text);
      result.push({ kind: "file", label: getFileBaseName(path), source: getExternalProjectSource(path, projects, currentCwd) ?? undefined, fileIconKind: getFileIconKind(path) });
    } else if (marker.kind === "skill") result.push({ kind: "skill", label: getSkillNameFromToken(marker.text) });
    else if (marker.kind === "prompt") result.push({ kind: "prompt", label: marker.text.slice(1) });
    else if (marker.kind === "image") result.push({ kind: "image", label: marker.label });
    else if (marker.kind === "pasted_text") result.push({ kind: "pasted_text", id: marker.id, label: pastedById.has(marker.id) ? t("chat.pastedTextTag", { chars: pastedById.get(marker.id)!.chars }) : t("chat.pastedText") });
    else if (marker.kind === "attachment") {
      const attachment = attachmentById.get(marker.id);
      result.push({ kind: "attachment", label: attachment?.name ?? t("chat.attachment"), fileIconKind: getFileIconKind(attachment?.path ?? attachment?.name ?? "") });
    }
    cursor = marker.to;
  }
  if (cursor < text.length) pushLinkedText(result, text.slice(cursor));
  return result;
});
</script>

<style scoped>
.chat-rich-text :deep(a) {
  color: var(--app-text-link);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
