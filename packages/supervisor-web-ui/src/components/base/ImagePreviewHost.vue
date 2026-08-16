<template>
  <Teleport to="body">
    <Transition name="image-preview">
      <div v-if="preview" class="image-preview-host" role="dialog" aria-modal="true" :aria-label="t('imagePreview.title')" @click.self="closeImagePreview">
        <button type="button" class="image-preview-host__close" :title="t('common.close')" :aria-label="t('common.close')" @click="closeImagePreview"><X class="w-5 h-5" /></button>
        <button v-if="preview.urls.length > 1" type="button" class="image-preview-host__nav image-preview-host__nav--prev" :title="t('imagePreview.previous')" :aria-label="t('imagePreview.previous')" @click.stop="step(-1)"><ChevronLeft class="w-7 h-7" /></button>
        <img class="image-preview-host__img" :src="currentUrl" :alt="t('imagePreview.imageAlt')" draggable="false" @click.stop />
        <button v-if="preview.urls.length > 1" type="button" class="image-preview-host__nav image-preview-host__nav--next" :title="t('imagePreview.next')" :aria-label="t('imagePreview.next')" @click.stop="step(1)"><ChevronRight class="w-7 h-7" /></button>
        <div v-if="preview.urls.length > 1" class="image-preview-host__counter">{{ preview.index + 1 }} / {{ preview.urls.length }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next";
import { closeImagePreview, openImagePreview, useImagePreview } from "@/composables/use-image-preview";
import { useI18n } from "@/i18n";

const { preview } = useImagePreview();
const { t } = useI18n();
const currentUrl = computed(() => preview.value?.urls[preview.value.index] ?? "");

function step(delta: number) {
  const current = preview.value;
  if (!current || current.urls.length <= 1) return;
  openImagePreview([...current.urls], (current.index + delta + current.urls.length) % current.urls.length);
}

function onKeydown(event: KeyboardEvent) {
  if (!preview.value) return;
  if (event.key === "Escape") { event.preventDefault(); closeImagePreview(); return; }
  if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); return; }
  if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
}

watch(preview, (value) => {
  if (value) { document.addEventListener("keydown", onKeydown); document.body.style.overflow = "hidden"; }
  else { document.removeEventListener("keydown", onKeydown); document.body.style.overflow = ""; }
}, { flush: "post" });

onBeforeUnmount(() => { document.removeEventListener("keydown", onKeydown); document.body.style.overflow = ""; });
</script>

<style scoped>
.image-preview-host { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgb(0 0 0 / 78%); backdrop-filter: blur(2px); cursor: zoom-out; }
.image-preview-host__img { max-width: min(96vw, 1400px); max-height: min(90vh, 1400px); object-fit: contain; border-radius: 4px; box-shadow: 0 12px 40px rgb(0 0 0 / 45%); cursor: default; user-select: none; }
.image-preview-host__close, .image-preview-host__nav { position: absolute; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 999px; color: #fff; background: rgb(0 0 0 / 45%); cursor: pointer; }
.image-preview-host__close:hover, .image-preview-host__nav:hover { background: rgb(0 0 0 / 65%); }
.image-preview-host__close { top: 16px; right: 16px; width: 40px; height: 40px; }
.image-preview-host__nav { top: 50%; width: 44px; height: 44px; transform: translateY(-50%); }
.image-preview-host__nav--prev { left: 16px; } .image-preview-host__nav--next { right: 16px; }
.image-preview-host__counter { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 4px 10px; border-radius: 999px; color: #fff; background: rgb(0 0 0 / 45%); font-size: 12px; font-variant-numeric: tabular-nums; }
.image-preview-enter-active, .image-preview-leave-active { transition: opacity 0.18s ease; }
.image-preview-enter-active .image-preview-host__img, .image-preview-leave-active .image-preview-host__img { transition: transform 0.18s ease, opacity 0.18s ease; }
.image-preview-enter-from, .image-preview-leave-to { opacity: 0; }
.image-preview-enter-from .image-preview-host__img, .image-preview-leave-to .image-preview-host__img { opacity: 0; transform: scale(0.96); }
@media (max-width: 767px) { .image-preview-host { padding: 12px; } .image-preview-host__nav { display: none; } }
</style>
