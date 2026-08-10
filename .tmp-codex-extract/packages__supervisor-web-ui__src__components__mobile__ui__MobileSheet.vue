<template>
  <Teleport to="body">
    <Transition name="m-overlay">
      <div v-if="open" class="m-overlay m-overlay--sheet" @mousedown.self="emit('close')">
        <section class="m-sheet" role="dialog" aria-modal="true" :aria-label="title || '操作'">
          <div class="m-sheet__handle" />
          <header v-if="title" class="m-sheet__header">{{ title }}</header>
          <div class="m-sheet__body"><slot /></div>
          <MobileButton block class="m-sheet__cancel" @click="emit('close')">取消</MobileButton>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import MobileButton from "./MobileButton.vue";

const props = defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}
watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle("m-overlay-open", open);
    if (open) document.addEventListener("keydown", onKeydown);
    else document.removeEventListener("keydown", onKeydown);
  },
);
onBeforeUnmount(() => {
  document.body.classList.remove("m-overlay-open");
  document.removeEventListener("keydown", onKeydown);
});
</script>
