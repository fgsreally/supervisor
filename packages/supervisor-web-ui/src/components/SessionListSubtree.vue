<template>
  <TransitionGroup name="session-list" tag="div" class="session-list-subtree">
    <div v-for="(child, idx) in children" :key="child.id" class="session-list-node">
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
  </TransitionGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UISession } from "@/types/ui";
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
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()),
);

const ancestorOpenDepths = computed(() => props.ancestorOpenDepths ?? []);

function nextAncestorDepths(idx: number): number[] {
  const result = [...ancestorOpenDepths.value];
  if (idx !== children.value.length - 1) result.push(props.depth);
  return result;
}
</script>

<style scoped>
.session-list-subtree {
  position: relative;
}

.session-list-enter-active,
.session-list-leave-active {
  overflow: hidden;
  transition:
    opacity 0.26s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.session-list-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}
.session-list-move {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.session-list-enter-from,
.session-list-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
