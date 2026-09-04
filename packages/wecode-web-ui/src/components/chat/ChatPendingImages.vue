<template>
  <div v-if="images.length" class="pending-images">
    <div
      v-for="img in images"
      :key="img.id"
      class="pending-images__item"
      :class="{ 'pending-images__item--hovered': hoveredPlaceholder === img.placeholder }"
      @mouseenter="setHovered(img.placeholder)"
      @mouseleave="setHovered(null)"
    >
      <button
        type="button"
        class="pending-images__preview"
        :title="t('imagePreview.open', { label: img.name })"
        @click="openPendingImage(img)"
      >
        <img :src="img.previewUrl" :alt="img.name" class="pending-images__thumb" />
      </button>
      <button
        type="button"
        class="pending-images__remove"
        :title="t('common.remove')"
        @click="emit('remove', img.id)"
      >
        <X class="w-3 h-3" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { X } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { openImagePreview } from "@/composables/use-image-preview";
import type { PendingChatImage } from "@/types/chat-compose";

const props = defineProps<{
  images: PendingChatImage[];
}>();

const emit = defineEmits<{ remove: [id: string] }>();
const { t } = useI18n();
const hoveredPlaceholder = ref<string | null>(null);

function setHovered(placeholder: string | null) {
  hoveredPlaceholder.value = null;
  window.dispatchEvent(new CustomEvent("chat-image-hover", { detail: { placeholder, source: "thumbnail" } }));
}

function onImageHover(event: Event) {
  const detail = (event as CustomEvent<{ placeholder: string | null; source: string }>).detail;
  hoveredPlaceholder.value = detail?.source === "tag" ? detail.placeholder : null;
}

onMounted(() => window.addEventListener("chat-image-hover", onImageHover));
onBeforeUnmount(() => window.removeEventListener("chat-image-hover", onImageHover));

function openPendingImage(item: PendingChatImage) {
  const index = props.images.findIndex((image) => image.id === item.id);
  openImagePreview(
    props.images.map((image) => image.previewUrl),
    index < 0 ? 0 : index,
  );
}
</script>

<style scoped>
.pending-images {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem 0;
}

.pending-images__item {
  position: relative;
  display: flex;
  width: fit-content;
  height: fit-content;
  max-width: 4.5rem;
  max-height: 4.5rem;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-accent) 18%, var(--app-border));
  background: var(--app-bubble-assistant);
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
}
.pending-images__item--hovered {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 45%, transparent);
}

.pending-images__thumb {
  width: auto;
  height: auto;
  max-width: 4.5rem;
  max-height: 4.5rem;
  object-fit: contain;
  background: transparent;
  display: block;
}

.pending-images__preview {
  display: block;
  width: fit-content;
  height: fit-content;
  max-width: 4.5rem;
  max-height: 4.5rem;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.pending-images__remove {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 55%);
  background: rgb(0 0 0 / 62%);
  color: #fff;
}

</style>
