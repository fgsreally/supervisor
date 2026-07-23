<template>
  <Teleport to="body">
    <Transition name="home-composer">
      <div
        v-if="open"
        class="home-composer-overlay"
        @mousedown.self="emit('close')"
      >
        <div class="absolute inset-0 bg-black/35" />
        <div
          class="home-composer-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-composer-title"
          @mousedown.stop
        >
          <header>
            <h2 id="home-composer-title">添加任务</h2>
            <button type="button" class="home-composer-dialog__icon" title="关闭" @click="emit('close')">
              <X class="h-5 w-5" />
            </button>
          </header>

          <div class="home-composer-dialog__body">
            <label>
              <span>标题</span>
              <input
                v-model="title"
                type="text"
                placeholder="任务标题"
                @keydown.enter.prevent="submit"
              />
            </label>

            <label>
              <span>紧急度</span>
              <div class="home-composer-priority">
                <button
                  v-for="item in priorityOptions"
                  :key="item.value"
                  type="button"
                  class="home-composer-priority__item"
                  :class="{
                    'home-composer-priority__item--active': priority === item.value,
                    [`home-composer-priority__item--${item.value}`]: true,
                  }"
                  @click="priority = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </label>

            <label>
              <span>描述（输入 @ 选择项目）</span>
              <div class="home-composer__body-wrap">
                <div ref="editorHost" class="home-composer__editor" />
                <div v-if="mentionOpen" class="home-composer__mention">
                  <button
                    v-for="(project, index) in filteredProjects"
                    :key="project.id"
                    type="button"
                    class="home-composer__mention-item"
                    :class="{ 'home-composer__mention-item--active': index === mentionIndex }"
                    @mousedown.prevent="pickProject(project)"
                  >
                    <strong>{{ project.name }}</strong>
                    <small>{{ project.cwd }}</small>
                  </button>
                  <div v-if="!filteredProjects.length" class="home-composer__mention-empty">
                    无匹配项目
                  </div>
                </div>
              </div>
            </label>
          </div>

          <footer>
            <button type="button" class="home-composer-dialog__cancel" @click="emit('close')">
              取消
            </button>
            <button
              type="button"
              class="home-composer-dialog__submit"
              :disabled="!canSubmit || busy"
              @click="submit"
            >
              {{ busy ? "创建中…" : "创建到待办" }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { EditorState } from "@codemirror/state";
import { EditorView, placeholder as cmPlaceholder } from "@codemirror/view";
import { X } from "lucide-vue-next";
import type { HomeTaskPriority, Project } from "@/api";
import {
  homeProjectTagExtension,
  homeTaskInputTheme,
  resolveProjectFromText,
} from "@/codemirror/home-task-input-tags";

const props = defineProps<{
  open: boolean;
  projects: Project[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  create: [
    payload: {
      title: string;
      description: string;
      projectId: number | null;
      priority: HomeTaskPriority;
    },
  ];
}>();

const priorityOptions: Array<{ value: HomeTaskPriority; label: string }> = [
  { value: "urgent", label: "紧急" },
  { value: "high", label: "高" },
  { value: "normal", label: "普通" },
  { value: "low", label: "低" },
];

const title = ref("");
const description = ref("");
const priority = ref<HomeTaskPriority>("normal");
const mentionOpen = ref(false);
const mentionQuery = ref("");
const mentionIndex = ref(0);
const mentionStart = ref(-1);
const editorHost = ref<HTMLElement | null>(null);
const viewRef = shallowRef<EditorView | null>(null);

const filteredProjects = computed(() => {
  const q = mentionQuery.value.trim().toLowerCase();
  if (!q) return props.projects.slice(0, 8);
  return props.projects
    .filter(
      (project) =>
        project.name.toLowerCase().includes(q) || project.cwd.toLowerCase().includes(q),
    )
    .slice(0, 8);
});

const canSubmit = computed(() => title.value.trim().length > 0);

function syncMentionFromView(view: EditorView) {
  const cursor = view.state.selection.main.head;
  const before = view.state.doc.sliceString(0, cursor);
  const match = before.match(/(^|[\s])@([^\s@]*)$/);
  if (!match) {
    mentionOpen.value = false;
    return;
  }
  mentionOpen.value = true;
  mentionQuery.value = match[2] ?? "";
  mentionStart.value = cursor - (match[2]?.length ?? 0) - 1;
  mentionIndex.value = 0;
}

function destroyEditor() {
  viewRef.value?.destroy();
  viewRef.value = null;
}

function createEditor() {
  destroyEditor();
  const host = editorHost.value;
  if (!host) return;

  const view = new EditorView({
    state: EditorState.create({
      doc: description.value,
      extensions: [
        homeTaskInputTheme(),
        homeProjectTagExtension(() => props.projects),
        cmPlaceholder("补充说明，可用 @项目名 关联项目"),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged && !update.selectionSet) return;
          description.value = update.view.state.doc.toString();
          syncMentionFromView(update.view);
        }),
        EditorView.domEventHandlers({
          keydown(event) {
            if (!mentionOpen.value) return false;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              mentionIndex.value = Math.min(
                mentionIndex.value + 1,
                Math.max(filteredProjects.value.length - 1, 0),
              );
              return true;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              mentionIndex.value = Math.max(mentionIndex.value - 1, 0);
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              const project = filteredProjects.value[mentionIndex.value];
              if (project) {
                event.preventDefault();
                pickProject(project);
                return true;
              }
            }
            if (event.key === "Escape") {
              event.preventDefault();
              mentionOpen.value = false;
              return true;
            }
            return false;
          },
        }),
      ],
    }),
    parent: host,
  });
  viewRef.value = view;
  view.focus();
}

function pickProject(project: Project) {
  const view = viewRef.value;
  if (!view) return;
  const start = mentionStart.value;
  const cursor = view.state.selection.main.head;
  const from = start >= 0 ? start : cursor;
  const insertion = `@${project.name} `;
  view.dispatch({
    changes: { from, to: cursor, insert: insertion },
    selection: { anchor: from + insertion.length },
  });
  description.value = view.state.doc.toString();
  mentionOpen.value = false;
  view.focus();
}

function submit() {
  if (!canSubmit.value || props.busy) return;
  const text = description.value.trim();
  const project = resolveProjectFromText(text, props.projects);
  emit("create", {
    title: title.value.trim(),
    description: text,
    projectId: project ? Number(project.id) : null,
    priority: priority.value,
  });
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      destroyEditor();
      return;
    }
    title.value = "";
    description.value = "";
    priority.value = "normal";
    mentionOpen.value = false;
    await nextTick();
    createEditor();
  },
);

onBeforeUnmount(() => {
  destroyEditor();
});
</script>

<style scoped>
.home-composer-overlay {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.home-composer-dialog {
  position: relative;
  display: flex;
  width: min(460px, 100%);
  max-height: min(86vh, 640px);
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--app-popup-border);
  background: var(--app-popup-bg);
  color: var(--app-text-primary);
  box-shadow: 0 18px 48px rgb(0 0 0 / 22%);
}
.home-composer-dialog header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.home-composer-dialog header h2 {
  font-size: 15px;
  font-weight: 600;
}
.home-composer-dialog__icon {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 6px;
  color: var(--app-text-muted);
}
.home-composer-dialog__icon:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
.home-composer-dialog__body {
  overflow: auto;
  padding: 16px;
}
.home-composer-dialog__body label {
  display: block;
  margin-bottom: 14px;
}
.home-composer-dialog__body label:last-child {
  margin-bottom: 0;
}
.home-composer-dialog__body label > span {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--app-text-secondary);
}
.home-composer-dialog__body input {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--app-chat-bg) 70%, transparent);
  color: var(--app-text-primary);
  font-size: 13px;
  outline: none;
  box-shadow: none;
}
.home-composer-dialog__body input:focus {
  border-color: color-mix(in srgb, #07c160 45%, var(--app-border));
  outline: none;
  box-shadow: none;
}
.home-composer-priority {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.home-composer-priority__item {
  height: 34px;
  border-radius: 7px;
  border: 1px solid var(--app-border-subtle);
  font-size: 12px;
  color: var(--app-text-secondary);
  background: color-mix(in srgb, var(--app-chat-bg) 55%, transparent);
}
.home-composer-priority__item--active {
  border-color: transparent;
  color: #fff;
}
.home-composer-priority__item--urgent.home-composer-priority__item--active {
  background: #dc2626;
}
.home-composer-priority__item--high.home-composer-priority__item--active {
  background: #ea580c;
}
.home-composer-priority__item--normal.home-composer-priority__item--active {
  background: #07c160;
}
.home-composer-priority__item--low.home-composer-priority__item--active {
  background: #6b7280;
}
.home-composer__body-wrap {
  position: relative;
}
.home-composer__editor {
  width: 100%;
  min-height: 96px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--app-chat-bg) 70%, transparent);
  overflow: hidden;
}
.home-composer__editor:focus-within {
  border-color: color-mix(in srgb, #07c160 45%, var(--app-border));
}
.home-composer__editor :deep(.cm-editor) {
  background: transparent;
}
.home-composer__editor :deep(.cm-editor.cm-focused) {
  outline: none;
}
.home-composer__mention {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 4px);
  z-index: 20;
  max-height: 200px;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid var(--app-popup-border);
  background: var(--app-popup-bg);
  box-shadow: 0 10px 28px rgb(0 0 0 / 16%);
}
.home-composer__mention-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  text-align: left;
}
.home-composer__mention-item:hover,
.home-composer__mention-item--active {
  background: var(--app-popup-hover);
}
.home-composer__mention-item strong {
  font-size: 13px;
}
.home-composer__mention-item small,
.home-composer__mention-empty {
  font-size: 11px;
  color: var(--app-text-muted);
}
.home-composer__mention-empty {
  padding: 12px;
}
.home-composer-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--app-border-subtle);
}
.home-composer-dialog__cancel,
.home-composer-dialog__submit {
  height: 34px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
}
.home-composer-dialog__cancel {
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
.home-composer-dialog__submit {
  color: #fff;
  background: #07c160;
}
.home-composer-dialog__submit:disabled {
  opacity: 0.5;
}
.home-composer-enter-active,
.home-composer-leave-active {
  transition: opacity 0.18s ease;
}
.home-composer-enter-from,
.home-composer-leave-to {
  opacity: 0;
}
</style>
