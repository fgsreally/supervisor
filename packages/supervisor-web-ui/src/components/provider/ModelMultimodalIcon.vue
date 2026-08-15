<template>
  <span
    class="model-multimodal-icon"
    :class="supportsMultimodal ? 'model-multimodal-icon--supported' : 'model-multimodal-icon--unsupported'"
    :title="supportsMultimodal ? '支持图像输入（多模态）' : '仅文本'"
  >
    <Image class="model-multimodal-icon__image" :stroke-width="supportsMultimodal ? 2 : 1.5" />
  </span>
</template>

<script setup lang="ts">
import { Image } from "lucide-vue-next";

defineProps<{
  supportsMultimodal: boolean;
}>();
</script>

<style scoped>
.model-multimodal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.model-multimodal-icon--supported {
  color: #3b82f6;
}

.model-multimodal-icon--unsupported {
  color: var(--app-text-muted);
}

.model-multimodal-icon__image {
  width: 1rem;
  height: 1rem;
}
</style>
