<template>
  <Teleport to="body">
    <div
      v-if="open && items.length"
      class="fixed rounded-md border chat-autocomplete-popup"
      :style="popupStyle"
      role="listbox"
    >
      <ul class="max-h-52 overflow-y-auto custom-scrollbar py-1">
        <li
          v-for="(item, index) in items"
          :key="`${item.trigger}-${item.value}-${index}`"
          role="option"
          :aria-selected="index === selectedIndex"
          class="px-3 py-2 cursor-pointer flex items-start gap-2 min-w-0 autocomplete-item"
          :class="{ 'autocomplete-item--selected': index === selectedIndex }"
          @mousedown.prevent
          @click="emit('select', item)"
        >
          <FileTypeIcon
            v-if="item.trigger === 'at'"
            :kind="item.fileIconKind"
            :path="item.label"
            :is-directory="item.isDirectory"
            class="mt-0.5"
          />
          <Sparkles
            v-else-if="item.source === 'skill'"
            class="w-4 h-4 shrink-0 mt-0.5 autocomplete-icon autocomplete-icon--skill"
          />
          <FileText
            v-else-if="item.source === 'prompt'"
            class="w-4 h-4 shrink-0 mt-0.5 autocomplete-icon autocomplete-icon--prompt"
          />
          <FileText v-else class="w-4 h-4 shrink-0 mt-0.5 autocomplete-icon" />
          <div class="min-w-0 flex-1">
            <div
              class="text-[13px] truncate autocomplete-label"
              :class="item.trigger === 'at' ? 'font-mono' : ''"
            >
              {{ displayLabel(item) }}
              <span v-if="item.source" class="autocomplete-source">{{ item.source }}</span>
            </div>
            <div v-if="item.description" class="text-[11px] truncate mt-0.5 autocomplete-desc">
              {{ item.description }}
            </div>
          </div>
        </li>
      </ul>
      <div class="px-3 py-1.5 border-t text-[10px] autocomplete-footer">
        ↑↓ 选择 · Tab/Enter 确认 · Ctrl+Enter 换行 · Esc 关闭
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { FileText, Sparkles } from "lucide-vue-next";
import type { ChatAutocompleteItem } from "../utils/chat-autocomplete";
import { getFileBaseName } from "../utils/file-type-icon";
import FileTypeIcon from "./FileTypeIcon.vue";

const props = defineProps<{
  open: boolean;
  items: ChatAutocompleteItem[];
  selectedIndex: number;
  anchorEl: HTMLElement | null;
}>();

const emit = defineEmits<{
  select: [item: ChatAutocompleteItem];
}>();

const popupStyle = ref<Record<string, string>>({
  visibility: "hidden",
});

function updatePosition() {
  const el = props.anchorEl;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  popupStyle.value = {
    left: `${rect.left + 4}px`,
    width: `${Math.max(220, rect.width - 8)}px`,
    bottom: `${window.innerHeight - rect.top + 4}px`,
    zIndex: "200",
    visibility: "visible",
  };
}

watch(
  () => [props.open, props.items.length, props.anchorEl] as const,
  async ([open]) => {
    if (!open) return;
    await nextTick();
    updatePosition();
  },
);

onMounted(() => {
  window.addEventListener("scroll", updatePosition, true);
  window.addEventListener("resize", updatePosition);
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", updatePosition, true);
  window.removeEventListener("resize", updatePosition);
});

function displayLabel(item: ChatAutocompleteItem): string {
  if (item.trigger === "slash") return item.label.replace(/^\//, "");
  return getFileBaseName(item.label.replace(/\/$/, ""));
}
</script>

<style scoped>
.chat-autocomplete-popup {
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}

.autocomplete-item:hover {
  background: var(--app-popup-hover);
}

.autocomplete-item--selected {
  background: var(--app-popup-selected);
}

.autocomplete-icon {
  color: var(--app-text-link);
}

.autocomplete-icon--skill {
  color: #ff9f1a;
}

.autocomplete-icon--prompt {
  color: #576b95;
}

.autocomplete-label {
  color: var(--app-text-primary);
}

.autocomplete-desc {
  color: var(--app-text-secondary);
}

.autocomplete-source {
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 9px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
}

.autocomplete-footer {
  border-color: var(--app-border-subtle);
  color: var(--app-text-muted);
  background: var(--app-popup-hover);
}
</style>
