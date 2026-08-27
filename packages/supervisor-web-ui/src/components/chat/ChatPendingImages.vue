<template>
  <div v-if="images.length" class="pending-images">
    <div v-for="img in images" :key="img.id" class="pending-images__item">
      <img :src="img.previewUrl" :alt="img.name" class="pending-images__thumb" />
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
import { X } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { PendingChatImage } from "@/types/chat-compose";

defineProps<{
  images: PendingChatImage[];
}>();

const emit = defineEmits<{ remove: [id: string] }>();
const { t } = useI18n();
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
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-accent) 18%, var(--app-border));
  background: var(--app-bubble-assistant);
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
}

.pending-images__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pending-images__remove {
  position: absolute;
  top: 4px;
  right: 4px;
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
