<template>
  <TransitionGroup
    :css="useCss"
    :name="useCss ? name : undefined"
    :tag="tag"
    :class="contentClass"
    @enter="onEnter"
    @leave="onLeave"
  >
    <slot />
  </TransitionGroup>
</template>

<script setup lang="ts">
import { useDustTransitionHooks } from "@/composables/use-dust-transition";

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
  transform: translateY(-8px);
}
.chat-list-roots,
.chat-list-projects,
.session-list-subtree,
.agent-list-roots {
  position: relative;
}
</style>
