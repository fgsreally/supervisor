<template>
  <div class="flex justify-center my-5 px-2">
    <button
      type="button"
      class="inline-flex items-center rounded-md bg-[#dadada] px-3 py-1 text-[12px] text-white"
      @click="$emit('open')"
    >
      <span>上下文已压缩</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { MockCompactionEntry } from "../mock/types";

defineProps<{
  entry: MockCompactionEntry;
}>();

defineEmits<{ open: [] }>();
</script>
