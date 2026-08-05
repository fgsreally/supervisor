<template>
  <Teleport to="body">
    <Transition name="m-overlay">
      <div v-if="open" class="m-overlay m-overlay--sheet" @mousedown.self="emit('close')">
        <section
          ref="panel"
          class="m-sheet"
          role="dialog"
          aria-modal="true"
          :aria-label="title || '操作'"
          :style="height ? { height: `${height}px` } : undefined"
        >
          <div class="m-sheet__handle-zone" @pointerdown="startResize">
            <div class="m-sheet__handle" />
          </div>
          <header v-if="title" class="m-sheet__header">{{ title }}</header>
          <div class="m-sheet__body"><slot /></div>
          <MobileButton block class="m-sheet__cancel" @click="emit('close')">取消</MobileButton>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import MobileButton from "./MobileButton.vue";

const props = defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const height = ref<number | null>(null);
let startY = 0;
let startHeight = 0;

function startResize(event: PointerEvent) {
  if (!panel.value) return;
  event.preventDefault();
  startY = event.clientY;
  startHeight = panel.value.getBoundingClientRect().height;
  document.addEventListener("pointermove", resize);
  document.addEventListener("pointerup", stopResize, { once: true });
}
function resize(event: PointerEvent) {
  height.value = Math.round(
    Math.min(window.innerHeight * 0.92, Math.max(240, startHeight + startY - event.clientY)),
  );
}
function stopResize() {
  document.removeEventListener("pointermove", resize);
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}
watch(
  () => props.open,
  (open) => {
    if (open) height.value = null;
    document.body.classList.toggle("m-overlay-open", open);
    if (open) document.addEventListener("keydown", onKeydown);
    else document.removeEventListener("keydown", onKeydown);
  },
);
onBeforeUnmount(() => {
  document.body.classList.remove("m-overlay-open");
  document.removeEventListener("keydown", onKeydown);
  stopResize();
});
</script>

<style scoped>
.m-sheet__handle-zone {
  display: grid;
  min-height: 28px;
  flex: none;
  place-items: center;
  cursor: ns-resize;
  touch-action: none;
}
</style>
