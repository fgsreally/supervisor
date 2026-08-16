<template>
  <div class="shrink-0 px-4 py-2 border-b flex items-center gap-2" style="background: var(--app-list-bg); border-color: var(--app-border)">
    <Search class="w-4 h-4 text-gray-400 shrink-0" />
    <input
      ref="inputRef"
      :value="query"
      type="text"
      :placeholder="t('chat.search.placeholder')"
      class="flex-1 bg-transparent text-[14px] focus:outline-none"
      style="color: var(--app-text-primary)"
      @input="onInput"
    />
    <span v-if="query" class="text-[12px] text-gray-400 shrink-0">
      {{ t('chat.search.count', { count: hitCount }) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Search } from "lucide-vue-next";
import { useI18n } from "@/i18n";

defineProps<{ query: string; hitCount: number }>();
const emit = defineEmits<{ "update:query": [value: string] }>();
const inputRef = ref<HTMLInputElement | null>(null);
const { t } = useI18n();

function onInput(event: Event) {
  emit("update:query", (event.target as HTMLInputElement).value);
}

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>
