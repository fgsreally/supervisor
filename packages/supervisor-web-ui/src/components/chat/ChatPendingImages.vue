<template>
  <div v-if="images.length" class="pending-images">
    <div v-for="img in images" :key="img.id" class="pending-images__item">
      <img :src="img.previewUrl" :alt="img.name" class="pending-images__thumb" />
      <button
        type="button"
        class="pending-images__remove"
        title="移除"
        @click="emit('remove', img.id)"
      >
        <X class="w-3 h-3" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import type { PendingChatImage } from "@/types/chat-compose";

defineProps<{
  images: PendingChatImage[];
}>();

const emit = defineEmits<{ remove: [id: string] }>();
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
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  background: var(--app-bubble-assistant);
}

.pending-images__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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
  background: rgb(0 0 0 / 0.55);
  color: #fff;
}
</style>
