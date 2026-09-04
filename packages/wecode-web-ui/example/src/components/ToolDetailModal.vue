<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
      @click.self="$emit('close')"
    >
      <div
        class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-gray-200"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 class="text-sm font-medium text-gray-900 truncate pr-4">{{ title }}</h3>
          <button
            type="button"
            class="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            @click="$emit('close')"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-4 py-3 space-y-4 custom-scrollbar">
          <div v-for="(section, i) in sections" :key="i">
            <div class="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
              {{ section.label }}
            </div>
            <MarkdownContent
              v-if="section.markdown"
              :content="section.content"
              class="text-sm bg-gray-50 rounded-md p-3 border border-gray-100"
            />
            <pre
              v-else
              class="text-xs font-mono text-gray-800 whitespace-pre-wrap break-words bg-gray-50 rounded-md p-3 border border-gray-100"
              >{{ section.content }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import MarkdownContent from "./MarkdownContent.vue";

export type ToolDetailSection = { label: string; content: string; markdown?: boolean };

defineProps<{
  open: boolean;
  title: string;
  sections: ToolDetailSection[];
}>();

defineEmits<{ close: [] }>();
</script>
