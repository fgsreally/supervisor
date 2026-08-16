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
.session-list-enter-active {
  overflow: hidden;
  transition:
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.session-list-leave-active {
  /* Collapse height even if Vue never removes the node (stuck leave = blank hole). */
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
  animation: session-list-leave-slot 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.session-list-move {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.session-list-enter-from {
  opacity: 0;
  transform: translateX(32px);
}
.session-list-enter-to {
  opacity: 1;
  transform: translateX(0);
}
@keyframes session-list-leave-slot {
  from {
    opacity: 1;
    transform: translateX(0);
    max-height: 7.5rem;
  }
  to {
    opacity: 0;
    transform: translateX(-32px);
    max-height: 0;
    margin-top: 0;
    margin-bottom: 0;
    padding-top: 0;
    padding-bottom: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .session-list-enter-active,
  .session-list-move {
    transition: none;
  }
  .session-list-enter-from {
    opacity: 1;
    transform: none;
  }
  .session-list-leave-active {
    animation: none;
    max-height: 0;
    margin: 0;
    padding: 0;
    opacity: 0;
    overflow: hidden;
  }
}
.chat-list-roots,
.chat-list-projects,
.session-list-subtree,
.agent-list-roots {
  position: relative;
  align-content: start;
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
