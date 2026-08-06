<template>
  <DustTransitionGroup name="session-list" tag="div" content-class="session-list-subtree">
    <div v-for="(child, idx) in children" :key="child.id" class="session-list-node" :data-session-id="child.id">
      <SessionListItem
        :session="child"
        :active="activeId === child.id"
        mode="chat"
        :depth="depth"
        :is-last-child="idx === children.length - 1"
        :ancestor-open-depths="ancestorOpenDepths"
        @select="$emit('select', $event)"
        @context-menu="(pos) => $emit('context-menu', { sessionId: child.id, ...pos })"
      />
      <SessionListSubtree
        :parent-id="child.id"
        :depth="depth + 1"
        :active-id="activeId"
        :sessions="sessions"
        :ancestor-open-depths="nextAncestorDepths(idx)"
        @select="$emit('select', $event)"
        @context-menu="$emit('context-menu', $event)"
      />
    </div>
  </DustTransitionGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UISession } from "@/types/ui";
import { compareSessionsByRecentActivity } from "@/utils/ui-session";
import DustTransitionGroup from "./DustTransitionGroup.vue";
import SessionListItem from "./SessionListItem.vue";
import SessionListSubtree from "./SessionListSubtree.vue";

const props = defineProps<{
  parentId: string;
  depth: number;
  activeId: string;
  sessions: UISession[];
  ancestorOpenDepths?: number[];
}>();

defineEmits<{
  select: [id: string];
  "context-menu": [payload: { sessionId: string; x: number; y: number }];
}>();

const children = computed(() =>
  props.sessions
    .filter(
      (s) =>
        s.parentId === props.parentId && s.showInSessionList && s.creationMethod === "spawn_agent",
    )
    .sort((a, b) => compareSessionsByRecentActivity(a, b, props.sessions)),
);

const ancestorOpenDepths = computed(() => props.ancestorOpenDepths ?? []);

function nextAncestorDepths(idx: number): number[] {
  const result = [...ancestorOpenDepths.value];
  if (idx !== children.value.length - 1) result.push(props.depth);
  return result;
}
</script>
