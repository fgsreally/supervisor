<template>
  <TransitionGroup
    v-if="useCss"
    :css="true"
    :name="name"
    :tag="tag"
    :class="contentClass"
    @after-leave="onAfterLeave"
  >
    <slot />
  </TransitionGroup>
  <TransitionGroup
    v-else
    :css="false"
    :tag="tag"
    :class="contentClass"
    @enter="onEnter"
    @leave="onLeave"
    @after-leave="onAfterLeave"
  >
    <slot />
  </TransitionGroup>
</template>

<script setup lang="ts">
import { useDustTransitionHooks } from "@/composables/use-dust-transition";

const emit = defineEmits<{ afterLeave: [el: Element] }>();

const props = withDefaults(
  defineProps<{
    name?: string;
    tag?: string;
    contentClass?: string;
    duration?: number;
    step?: number;
  }>(),
  {
    name: "session-list",
    tag: "div",
    duration: 1100,
    step: 3,
  },
);

const { useCss, onLeave, onEnter } = useDustTransitionHooks({
  duration: props.duration,
  step: props.step,
});

function onAfterLeave(el: Element) {
  emit("afterLeave", el);
}
</script>

<style>
/* Fallback when advanced animations are off (shared by all DustTransitionGroup instances). */
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
}
.session-list-enter-from {
  transform: translateX(32px);
}
.session-list-leave-to {
  transform: translateX(-32px);
}

@media (prefers-reduced-motion: reduce) {
  .session-list-enter-active,
  .session-list-leave-active,
  .session-list-move {
    transition: none;
  }
  .session-list-enter-from,
  .session-list-leave-to {
    opacity: 1;
    transform: none;
  }
}
.chat-list-roots,
.chat-list-projects,
.session-list-subtree,
.agent-list-roots {
  position: relative;
}
.chat-list-roots:has(> .session-list-leave-active) {
  min-height: 68px;
  overflow: visible;
}
.chat-list-root,
.workspace-session-block {
  width: 100%;
  box-sizing: border-box;
}
</style>
