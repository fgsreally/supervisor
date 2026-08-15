<template>
  <TransitionGroup
    :css="useCss"
    :name="useCss ? name : undefined"
    :duration="useCss ? { enter: 320, leave: 320 } : undefined"
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
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.session-list-leave-active {
  /* Keep in flow: absolute + display:grid parents makes leave invisible. */
  z-index: 1;
  pointer-events: none;
}
.session-list-move {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.session-list-enter-from {
  opacity: 0;
  transform: translateX(32px);
}
.session-list-enter-to,
.session-list-leave-from {
  opacity: 1;
  transform: translateX(0);
}
.session-list-leave-to {
  opacity: 0;
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
  /* Do NOT set min-height here — leave-active can stick and leave a permanent hole. */
  overflow: visible;
}
.chat-list-root,
.workspace-session-block {
  width: 100%;
  box-sizing: border-box;
}
</style>
