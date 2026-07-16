<template>
  <div
    class="inline-block self-start max-w-full w-fit rounded-md border border-gray-700 overflow-hidden text-xs font-mono shadow-sm"
  >
    <button
      type="button"
      class="inline-flex w-auto bg-[#2d2d2d] text-gray-100 px-3 py-2.5 items-start gap-2 text-left transition-colors"
      :class="hasResult ? 'hover:bg-[#383838] cursor-pointer' : 'cursor-default'"
      :disabled="!hasResult"
      @click="hasResult && $emit('open')"
    >
      <Terminal class="w-3.5 h-3.5 shrink-0 text-[#4ade80] mt-0.5" />
      <span class="min-w-0 font-sans text-[13px] text-gray-200 leading-snug whitespace-normal">
        {{ displayText }}
      </span>
      <Eye
        v-if="hasResult"
        class="w-3.5 h-3.5 shrink-0 text-[#4ade80]/70 mt-0.5"
        title="查看输出"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Terminal, Eye } from "lucide-vue-next";

const props = defineProps<{
  command: string;
  intent?: string;
  resultContent?: Array<{ type: string; text: string }>;
}>();

defineEmits<{ open: [] }>();

const hasResult = computed(() => !!props.resultContent?.length);

const displayText = computed(() => props.intent?.trim() || props.command);
</script>
