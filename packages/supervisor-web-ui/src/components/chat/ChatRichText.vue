<template>
  <span class="chat-rich-text whitespace-pre-wrap break-words">
    <template v-for="(part, index) in parts" :key="index">
      <span v-if="part.kind === 'text'">{{ part.text }}</span>
      <ChatTagChip
        v-else-if="part.kind === 'file'"
        variant="file"
        :label="part.label"
        :source="part.source"
        :file-icon-kind="part.fileIconKind"
      />
      <ChatTagChip v-else-if="part.kind === 'image'" variant="file" :label="part.label" />
      <ChatTagChip v-else variant="skill" :label="part.label" />
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSessionStore } from "@/store";
import ChatTagChip from "./ChatTagChip.vue";
import { findChatTokens } from "../../utils/chat-token-patterns";
import {
  getFileBaseName,
  getFileIconKind,
  getFilePathFromToken,
  getSkillNameFromToken,
  type FileIconKind,
} from "../../utils/file-type-icon";
import { getExternalProjectSource } from "../../utils/project-path";

const props = defineProps<{
  content: string;
}>();

const sessionStore = useSessionStore();

type TextPart = { kind: "text"; text: string };
type FileTagPart = { kind: "file"; label: string; source?: string; fileIconKind: FileIconKind };
type SkillTagPart = { kind: "skill"; label: string };
type ImageTagPart = { kind: "image"; label: string };
type ContentPart = TextPart | FileTagPart | SkillTagPart | ImageTagPart;

const IMAGE_REF_RE = /\[Image(?:\s*#\s*\d+)?\]/gi;

const parts = computed((): ContentPart[] => {
  const text = props.content;
  const tokens = findChatTokens(text);
  const projects = sessionStore.projects.map((p) => ({
    id: p.id,
    name: p.name,
    cwd: p.cwd,
  }));
  const currentCwd = sessionStore.currentSession?.cwd ?? "";
  const imageRanges: Array<{ from: number; to: number; label: string }> = [];
  for (const match of text.matchAll(IMAGE_REF_RE)) {
    const from = match.index;
    if (from === undefined) continue;
    imageRanges.push({ from, to: from + match[0].length, label: match[0] });
  }

  type Marker =
    | { from: number; to: number; kind: "file" | "skill"; text: string }
    | { from: number; to: number; kind: "image"; label: string };
  const markers: Marker[] = [
    ...tokens.map((token) => ({
      from: token.from,
      to: token.to,
      kind: token.kind === "file" ? ("file" as const) : ("skill" as const),
      text: token.text,
    })),
    ...imageRanges.map((range) => ({
      from: range.from,
      to: range.to,
      kind: "image" as const,
      label: range.label,
    })),
  ].sort((a, b) => a.from - b.from || a.to - b.to);

  if (markers.length === 0) return [{ kind: "text", text }];

  const result: ContentPart[] = [];
  let cursor = 0;
  for (const marker of markers) {
    if (marker.from < cursor) continue;
    if (marker.from > cursor) {
      result.push({ kind: "text", text: text.slice(cursor, marker.from) });
    }
    if (marker.kind === "file") {
      const path = getFilePathFromToken(marker.text);
      const source = getExternalProjectSource(path, projects, currentCwd) ?? undefined;
      result.push({
        kind: "file",
        label: getFileBaseName(path),
        source,
        fileIconKind: getFileIconKind(path),
      });
    } else if (marker.kind === "skill") {
      result.push({ kind: "skill", label: getSkillNameFromToken(marker.text) });
    } else if (marker.kind === "image") {
      result.push({ kind: "image", label: marker.label });
    }
    cursor = marker.to;
  }
  if (cursor < text.length) {
    result.push({ kind: "text", text: text.slice(cursor) });
  }
  return result;
});
</script>
