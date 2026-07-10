<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="tool-detail-overlay"
      @click.self="$emit('close')"
    >
      <div
        class="tool-detail-dialog"
        role="dialog"
        aria-modal="true"
      >
        <div class="tool-detail-header">
          <h3 class="tool-detail-title">{{ title }}</h3>
          <button
            type="button"
            class="tool-detail-close"
            @click="$emit('close')"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="tool-detail-body custom-scrollbar">
          <div v-for="(section, i) in sections" :key="i">
            <div class="tool-detail-section-label">{{ section.label }}</div>
            <MarkdownContent
              v-if="section.markdown"
              :content="section.content"
              class="tool-detail-section-md"
            />
            <pre
              v-else
              class="tool-detail-section-pre"
            >{{ section.content }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import MarkdownContent from './MarkdownContent.vue'

export type ToolDetailSection = { label: string; content: string; markdown?: boolean }

defineProps<{
  open: boolean
  title: string
  sections: ToolDetailSection[]
}>()

defineEmits<{ close: [] }>()
</script>

<style scoped>
.tool-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.4);
}

.tool-detail-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 42rem;
  max-height: 80vh;
  overflow: hidden;
  border-radius: 0.5rem;
  border: 1px solid var(--app-border);
  background: var(--app-popup-bg);
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.15);
}

.tool-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--app-border-subtle);
  flex-shrink: 0;
}

.tool-detail-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 1rem;
}

.tool-detail-close {
  padding: 0.25rem;
  border-radius: 0.375rem;
  color: var(--app-text-muted);
  transition: color 0.15s, background 0.15s;
}

.tool-detail-close:hover {
  color: var(--app-text-primary);
  background: var(--app-hover);
}

.tool-detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tool-detail-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--app-text-muted);
  margin-bottom: 0.375rem;
}

.tool-detail-section-md {
  font-size: 0.875rem;
  padding: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--app-border);
  background: var(--app-code-bg);
}

.tool-detail-section-pre {
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--app-border);
  background: var(--app-code-bg);
  color: var(--app-code-text);
}
</style>
