<template>
  <Transition v-if="useCss" :css="true" :name="name">
    <slot />
  </Transition>
  <Transition v-else :css="false" @enter="onEnter" @leave="onLeave">
    <slot />
  </Transition>
</template>

<script setup lang="ts">
import { useDustTransitionHooks } from "@/composables/use-dust-transition";

const props = withDefaults(
  defineProps<{
    name?: string;
    duration?: number;
    step?: number;
  }>(),
  {
    name: "session-list",
    duration: 1100,
    step: 3,
  },
);

const { useCss, onLeave, onEnter } = useDustTransitionHooks({
  duration: props.duration,
  step: props.step,
});
</script>
