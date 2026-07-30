<template>
  <span ref="root" class="m-popover-anchor">
    <span @click="emit('update:open', !open)"><slot name="trigger" /></span>
    <Teleport to="body">
      <Transition name="m-popover">
        <section v-if="open" class="m-popover" :style="position" role="dialog"><slot /></section>
      </Transition>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const root = ref<HTMLElement | null>(null);
const rect = ref<DOMRect | null>(null);
const position = computed(() => {
  if (!rect.value) return {};
  const width = Math.min(280, window.innerWidth - 24);
  const left = Math.min(Math.max(12, rect.value.right - width), window.innerWidth - width - 12);
  return { width: `${width}px`, left: `${left}px`, top: `${rect.value.bottom + 8}px` };
});
function closeOutside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) emit("update:open", false);
}
watch(
  () => props.open,
  (open) => {
    if (open) rect.value = root.value?.getBoundingClientRect() ?? null;
  },
);
onMounted(() => document.addEventListener("pointerdown", closeOutside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeOutside));
</script>
