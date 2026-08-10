<template>
  <Teleport to="body">
    <Transition name="m-overlay">
      <div v-if="open" class="m-overlay" @mousedown.self="emit('close')">
        <section ref="panel" class="m-dialog" role="dialog" aria-modal="true" :aria-label="title">
          <header class="m-dialog__header">
            <h2>{{ title }}</h2>
            <MobileIconButton label="关闭" @click="emit('close')"><X /></MobileIconButton>
          </header>
          <div class="m-dialog__body"><slot /></div>
          <footer v-if="$slots.footer" class="m-dialog__footer"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import MobileIconButton from "./MobileIconButton.vue";

const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

watch(
  () => props.open,
  async (open) => {
    document.body.classList.toggle("m-overlay-open", open);
    if (open) document.addEventListener("keydown", onKeydown);
    else document.removeEventListener("keydown", onKeydown);
    if (open) {
      previousFocus = document.activeElement as HTMLElement | null;
      await nextTick();
      panel.value?.querySelector<HTMLElement>("button, input, textarea, select")?.focus();
    } else previousFocus?.focus();
  },
);

onBeforeUnmount(() => {
  document.body.classList.remove("m-overlay-open");
  document.removeEventListener("keydown", onKeydown);
});
</script>
