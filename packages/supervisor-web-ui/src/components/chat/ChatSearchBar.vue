<template>
  <div
    class="shrink-0 px-4 py-2 border-b flex items-center gap-2"
    style="background: var(--app-list-bg); border-color: var(--app-border)"
  >
    <Search class="w-4 h-4 text-gray-400 shrink-0" />
    <input
      ref="inputRef"
      :value="query"
      type="text"
      placeholder="搜索聊天记录"
      class="flex-1 bg-transparent text-[14px] focus:outline-none"
      style="color: var(--app-text-primary)"
      @input="onInput"
    />
    <span v-if="query" class="text-[12px] text-gray-400 shrink-0">{{ hitCount }} 条</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Search } from "lucide-vue-next";

defineProps<{
  query: string;
  hitCount: number;
}>();

const emit = defineEmits<{ "update:query": [value: string] }>();

const inputRef = ref<HTMLInputElement | null>(null);

function onInput(event: Event) {
  emit("update:query", (event.target as HTMLInputElement).value);
}

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>
