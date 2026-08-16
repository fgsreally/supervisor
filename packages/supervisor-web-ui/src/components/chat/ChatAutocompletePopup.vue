<template>
  <Teleport to="body">
    <div v-if="open && items.length" class="fixed rounded-md border chat-autocomplete-popup" :style="popupStyle" role="listbox">
      <ul class="autocomplete-list overflow-y-auto custom-scrollbar py-1">
        <li v-for="(item, index) in items" :key="`${item.trigger}-${item.kind ?? 'x'}-${item.value}-${index}`" role="option" :aria-selected="index === selectedIndex" class="px-2.5 py-1.5 md:px-3 md:py-2 cursor-pointer flex items-center gap-2 min-w-0 autocomplete-item" :class="{ 'autocomplete-item--selected': index === selectedIndex }" @mousedown.prevent @click="emit('select', item)">
          <FolderKanban v-if="item.kind === 'project'" class="w-4 h-4 shrink-0 mt-0.5 autocomplete-icon autocomplete-icon--project" /><CornerLeftUp v-else-if="item.kind === 'nav-projects'" class="w-4 h-4 shrink-0 mt-0.5 autocomplete-icon" /><FileTypeIcon v-else-if="item.trigger === 'at' || item.trigger === 'atat'" :kind="item.fileIconKind" :path="item.label" :is-directory="item.isDirectory" class="mt-0.5" /><Sparkles v-else-if="item.source === 'skill'" class="w-4 h-4 shrink-0 mt-0.5 autocomplete-icon autocomplete-icon--skill" /><FileText v-else class="w-4 h-4 shrink-0 mt-0.5 autocomplete-icon" />
          <div class="min-w-0 flex-1"><div class="text-[13px] truncate autocomplete-label" :class="item.trigger === 'at' || item.trigger === 'atat' ? 'font-mono' : ''">{{ displayLabel(item) }}<span v-if="item.source" class="autocomplete-source">{{ item.source === "prompt" ? t("chat.autocomplete.template") : item.source }}</span></div><div v-if="item.description" class="text-[11px] truncate mt-0.5 autocomplete-desc">{{ item.description }}</div></div>
        </li>
      </ul>
      <div class="px-3 py-1.5 border-t text-[10px] autocomplete-footer">{{ t("chat.autocomplete.hint") }}</div>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { CornerLeftUp, FileText, FolderKanban, Sparkles } from "lucide-vue-next";
import type { ChatAutocompleteItem } from "../../utils/chat-autocomplete";
import FileTypeIcon from "../base/FileTypeIcon.vue";
import { useI18n } from "@/i18n";
const props = defineProps<{ open: boolean; items: ChatAutocompleteItem[]; selectedIndex: number; anchorEl: HTMLElement | null }>();
const emit = defineEmits<{ select: [item: ChatAutocompleteItem] }>();
const { t } = useI18n();
const popupStyle = ref<Record<string, string>>({ visibility: "hidden" });
function updatePosition() { const el = props.anchorEl; if (!el) return; const rect = el.getBoundingClientRect(); popupStyle.value = { left: `${rect.left + 4}px`, width: `${Math.max(220, rect.width - 8)}px`, bottom: `${window.innerHeight - rect.top + 4}px`, zIndex: "200", visibility: "visible" }; }
watch(() => [props.open, props.items.length, props.anchorEl] as const, async ([open]) => { if (!open) return; await nextTick(); updatePosition(); });
onMounted(() => { window.addEventListener("scroll", updatePosition, true); window.addEventListener("resize", updatePosition); });
onBeforeUnmount(() => { window.removeEventListener("scroll", updatePosition, true); window.removeEventListener("resize", updatePosition); });
function displayLabel(item: ChatAutocompleteItem): string { return item.trigger === "slash" ? item.label.replace(/^\//, "") : item.label; }
</script>
<style scoped>
.autocomplete-list { max-height: min(46vh, 320px); } @media (min-width: 768px) { .autocomplete-list { max-height: min(58vh, 520px); } } .chat-autocomplete-popup { background: var(--app-popup-bg); border-color: var(--app-popup-border); box-shadow: 0 2px 12px rgb(0 0 0 / 12%); } .autocomplete-item:hover { background: var(--app-popup-hover); } .autocomplete-item--selected { background: var(--app-popup-selected); } .autocomplete-icon { color: var(--app-text-link); } .autocomplete-icon--skill { color: #ff9f1a; } .autocomplete-icon--project { color: #07c160; } .autocomplete-label { color: var(--app-text-primary); } .autocomplete-desc { color: var(--app-text-secondary); } .autocomplete-source { margin-left: 6px; padding: 1px 5px; border-radius: 999px; font-size: 9px; color: var(--app-text-secondary); background: var(--app-hover); } .autocomplete-footer { border-color: var(--app-border-subtle); color: var(--app-text-muted); background: var(--app-popup-hover); }
</style>
