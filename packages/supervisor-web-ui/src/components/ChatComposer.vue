<template>
  <div
    ref="composerRoot"
    class="relative flex flex-col min-h-0 h-full chat-composer"
    @mousedown="onComposerMouseDown"
  >
    <ChatAutocompletePopup
      :open="autocompleteOpen"
      :items="suggestions"
      :selected-index="selectedIndex"
      :anchor-el="composerRoot"
      @select="applyItem"
    />

    <p
      v-if="showPlaceholder"
      class="absolute left-3.5 top-2 text-[14px] leading-relaxed pointer-events-none select-none z-10 chat-placeholder"
    >
      {{ placeholder }}
    </p>

    <div ref="editorHost" class="chat-composer-editor flex-1 min-h-0 h-full" />
  </div>
</template>

<script setup lang="ts">
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import * as api from "@/api";
import { chatInputTagExtension, chatInputTheme, slashCatalogFacet } from "../codemirror/chat-input-tags";
import ChatAutocompletePopup from "./ChatAutocompletePopup.vue";
import {
  applyAutocompleteCompletion,
  getAutocompleteContext,
  getAutocompleteSuggestions,
  type ChatAutocompleteItem,
  type PathBrowseState,
  type ProjectAutocompleteEntry,
  type WorkspaceFileEntry,
} from "../utils/chat-autocomplete";
import type { SlashCommandCatalog } from "../utils/slash-command-source";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    workspaceFiles?: WorkspaceFileEntry[];
    projects?: ProjectAutocompleteEntry[];
    workspaceCwd?: string;
    currentProjectId?: string | null;
    skills?: Array<{ name: string; description: string }>;
    prompts?: Array<{ name: string; description: string }>;
    commands?: Array<{
      name: string;
      description: string;
      source?: "skill" | "prompt" | "custom" | "mcp";
    }>;
    skillTrigger?: "slash" | "dollar";
    disabled?: boolean;
    editorHeight?: number;
    placeholder?: string;
  }>(),
  {
    workspaceFiles: () => [],
    projects: () => [],
    workspaceCwd: "",
    currentProjectId: null,
    skills: () => [],
    prompts: () => [],
    commands: () => [],
    skillTrigger: "slash",
    disabled: false,
    editorHeight: 88,
    placeholder: "输入消息",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  send: [];
  "paste-image": [file: File];
}>();

const editorHost = ref<HTMLElement | null>(null);
const composerRoot = ref<HTMLElement | null>(null);
const viewRef = shallowRef<EditorView | null>(null);
const cursor = ref(0);
const selectedIndex = ref(0);
const blurCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const autocompleteDismissed = ref(false);
const isFocused = ref(false);
const editorRevision = ref(0);

const atatProject = ref<ProjectAutocompleteEntry | null>(null);
const atatFiles = ref<WorkspaceFileEntry[]>([]);
let atatLoadToken = 0;

const editableCompartment = new Compartment();
const themeCompartment = new Compartment();
const slashCatalogCompartment = new Compartment();

function buildSlashCatalog(): SlashCommandCatalog {
  return {
    skills: props.skills.map((s) => ({ name: s.name })),
    prompts: props.prompts.map((p) => ({ name: p.name })),
    commands: props.commands.map((c) => ({ name: c.name, source: c.source })),
  };
}

const browseState = computed<PathBrowseState>(() => ({
  atatProject: atatProject.value,
}));

const context = computed(() => {
  void editorRevision.value;
  const view = viewRef.value;
  const text = view?.state.doc.toString() ?? props.modelValue;
  const pos = view?.state.selection.main.head ?? cursor.value;
  return getAutocompleteContext(text, pos);
});

const suggestions = computed(() => {
  const ctx = context.value;
  if (!ctx) return [];
  return getAutocompleteSuggestions(ctx, {
    workspaceFiles: props.workspaceFiles,
    projects: props.projects,
    atatFiles: atatFiles.value,
    browse: browseState.value,
    currentWorkspaceCwd: props.workspaceCwd,
    currentProjectId: props.currentProjectId,
    skills: props.skills,
    prompts: props.prompts,
    commands: props.commands,
    skillTrigger: props.skillTrigger,
  });
});

const autocompleteOpen = computed(
  () => !autocompleteDismissed.value && suggestions.value.length > 0 && !!context.value,
);

const showPlaceholder = computed(() => !props.modelValue && !isFocused.value);

watch(suggestions, () => {
  selectedIndex.value = 0;
});

watch(
  () => context.value?.trigger ?? null,
  (trigger, prev) => {
    if (trigger !== prev) resetBrowseState();
  },
);

function resetBrowseState() {
  atatProject.value = null;
  atatFiles.value = [];
}

function syncCursorFromView(view: EditorView) {
  cursor.value = view.state.selection.main.head;
}

function clearBlurTimer() {
  if (blurCloseTimer.value) {
    clearTimeout(blurCloseTimer.value);
    blurCloseTimer.value = null;
  }
}

function syncFromView(view: EditorView) {
  const text = view.state.doc.toString();
  cursor.value = view.state.selection.main.head;
  emit("update:modelValue", text);
}

function replaceRange(from: number, to: number, insertion: string, cursorPos: number) {
  const view = viewRef.value;
  if (!view) return;
  view.dispatch({
    changes: { from, to, insert: insertion },
    selection: { anchor: cursorPos },
  });
  syncFromView(view);
  view.focus();
}

function rewriteTriggerPrefixInPlace() {
  const view = viewRef.value;
  if (!view) return;
  const text = view.state.doc.toString();
  const ctx = getAutocompleteContext(text, view.state.selection.main.head);
  if (!ctx || (ctx.trigger !== "at" && ctx.trigger !== "atat")) return;
  const insertion = ctx.trigger === "atat" ? "@@" : "@";
  replaceRange(ctx.replaceStart, ctx.replaceEnd, insertion, ctx.replaceStart + insertion.length);
}

async function loadAtatProjectFiles(project: ProjectAutocompleteEntry) {
  const token = ++atatLoadToken;
  try {
    const files = await api.listWorkspaceFiles(project.cwd);
    if (token !== atatLoadToken) return;
    atatFiles.value = files;
  } catch {
    if (token !== atatLoadToken) return;
    atatFiles.value = [];
  }
}

async function applyItem(item: ChatAutocompleteItem) {
  const view = viewRef.value;
  if (!view) return;
  const text = view.state.doc.toString();
  const ctx = getAutocompleteContext(text, view.state.selection.main.head);
  if (!ctx) return;
  clearBlurTimer();

  if (item.kind === "project" && item.projectCwd) {
    atatProject.value = {
      id: item.projectId ?? item.value,
      name: item.label,
      cwd: item.projectCwd,
    };
    await loadAtatProjectFiles(atatProject.value);
    rewriteTriggerPrefixInPlace();
    autocompleteDismissed.value = false;
    return;
  }

  if (item.kind === "nav-projects") {
    atatProject.value = null;
    atatFiles.value = [];
    rewriteTriggerPrefixInPlace();
    autocompleteDismissed.value = false;
    return;
  }

  const result = applyAutocompleteCompletion(text, ctx, item);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: result.text },
    selection: { anchor: result.cursor },
  });
  syncFromView(view);
  autocompleteDismissed.value = false;
  resetBrowseState();
  view.focus();
}

function insertAtCursor(insertion: string) {
  const view = viewRef.value;
  if (!view) return;
  clearBlurTimer();
  const from = view.state.selection.main.from;
  const to = view.state.selection.main.to;
  view.dispatch({
    changes: { from, to, insert: insertion },
    selection: { anchor: from + insertion.length },
  });
  syncFromView(view);
  autocompleteDismissed.value = false;
  view.focus();
}

function handleAutocompleteKey(event: KeyboardEvent): boolean {
  if (!autocompleteOpen.value) return false;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length;
    return true;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex.value =
      (selectedIndex.value - 1 + suggestions.value.length) % suggestions.value.length;
    return true;
  }
  if (
    event.key === "Tab" ||
    (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey)
  ) {
    event.preventDefault();
    const item = suggestions.value[selectedIndex.value];
    if (item) void applyItem(item);
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    autocompleteDismissed.value = true;
    resetBrowseState();
    return true;
  }
  return false;
}

function buildExtensions() {
  return [
    themeCompartment.of(chatInputTheme(props.editorHeight)),
    slashCatalogCompartment.of(slashCatalogFacet.of(buildSlashCatalog())),
    chatInputTagExtension,
    EditorView.lineWrapping,
    editableCompartment.of(EditorView.editable.of(!props.disabled)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) {
        syncCursorFromView(update.view);
        editorRevision.value++;
      }
      if (update.docChanged) {
        autocompleteDismissed.value = false;
        emit("update:modelValue", update.state.doc.toString());
      }
    }),
    EditorView.domEventHandlers({
      paste(event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.kind !== "file") continue;
          const file = item.getAsFile();
          if (file?.type.startsWith("image/")) {
            event.preventDefault();
            emit("paste-image", file);
            return true;
          }
        }
        return false;
      },
      keydown(event) {
        clearBlurTimer();
        if (handleAutocompleteKey(event)) return true;
        if (event.key === "Enter" && !props.disabled) {
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            event.preventDefault();
            insertAtCursor("\n");
            return true;
          }
          event.preventDefault();
          emit("send");
          return true;
        }
        return false;
      },
      focus() {
        isFocused.value = true;
        clearBlurTimer();
        autocompleteDismissed.value = false;
      },
      blur() {
        isFocused.value = false;
        blurCloseTimer.value = setTimeout(() => {
          autocompleteDismissed.value = true;
        }, 120);
      },
    }),
  ];
}

function createView(parent: HTMLElement): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: buildExtensions(),
    }),
    parent,
  });
  syncCursorFromView(view);
  return view;
}

function onComposerMouseDown(event: MouseEvent) {
  if (event.target === editorHost.value || editorHost.value?.contains(event.target as Node)) return;
  viewRef.value?.focus();
}

onMounted(() => {
  if (editorHost.value) viewRef.value = createView(editorHost.value);
});

onBeforeUnmount(() => {
  viewRef.value?.destroy();
  viewRef.value = null;
});

watch(
  () => props.modelValue,
  (next) => {
    const view = viewRef.value;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === next) return;
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      selection: { anchor: Math.min(head, next.length) },
    });
    cursor.value = Math.min(head, next.length);
  },
);

watch(
  () => props.disabled,
  (disabled) => {
    const view = viewRef.value;
    if (!view) return;
    view.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!disabled)),
    });
  },
);

watch(
  () => props.editorHeight,
  (height) => {
    const view = viewRef.value;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(chatInputTheme(height)),
    });
  },
);

watch(
  () => [props.skills, props.prompts, props.commands] as const,
  () => {
    const view = viewRef.value;
    if (!view) return;
    view.dispatch({
      effects: slashCatalogCompartment.reconfigure(slashCatalogFacet.of(buildSlashCatalog())),
    });
  },
  { deep: true },
);

function focus() {
  clearBlurTimer();
  autocompleteDismissed.value = false;
  viewRef.value?.focus();
}

function insertTrigger(trigger: "@" | "@@" | "/") {
  const view = viewRef.value;
  if (!view) return;
  clearBlurTimer();
  autocompleteDismissed.value = false;
  resetBrowseState();
  view.focus();

  if (trigger === "@") {
    insertAtCursor(" @");
    return;
  }

  insertAtCursor(trigger);
}

defineExpose({ focus, insertTrigger });
</script>

<style scoped>
.chat-composer {
  overflow: visible;
}

.chat-composer-editor :deep(.cm-editor) {
  border: none;
  background: transparent;
  height: 100%;
}

.chat-composer-editor :deep(.cm-gutters) {
  display: none;
}

.chat-composer-editor :deep(.cm-scroller) {
  overflow: auto;
}

.chat-placeholder {
  color: var(--app-text-muted);
}
</style>
