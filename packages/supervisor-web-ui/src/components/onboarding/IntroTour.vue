<template>
  <Teleport to="body">
    <div v-if="open" class="intro-layer" :class="{ 'intro-layer--mobile': isMobile }">
      <div class="intro-focus" :style="focusStyle" />
      <section
        class="intro-popover"
        :class="{
          'intro-popover--sheet': isMobile,
          'intro-popover--above-tabbar': isMobile && sheetClearance > 0,
        }"
        :style="popoverStyle"
      >
        <header>
          <span>{{ current.eyebrow }}</span>
          <button type="button" :title="t('onboarding.close')" :aria-label="t('onboarding.close')" @click="close">
            <X />
          </button>
        </header>
        <h3>{{ current.title }}</h3>
        <p>{{ current.content }}</p>

        <div v-if="current.kind === 'overview'" class="intro-chapters">
          <p class="intro-chapters-label">{{ t("onboarding.chapterHint") }}</p>
          <div class="intro-chapters-list">
            <button
              v-for="ch in chapters"
              :key="ch.id"
              type="button"
              class="intro-chapter-btn"
              @click="playChapter(ch.id)"
            >
              <component :is="ch.icon" />
              <span>
                <strong>{{ ch.label }}</strong>
                <small>{{ ch.desc }}</small>
              </span>
            </button>
          </div>
        </div>

        <div v-if="current.kind === 'nav'" class="intro-action-hint">
          <MousePointer2 />{{ t("onboarding.clickTarget", { label: current.navLabel }) }}
        </div>
        <div v-else-if="current.kind === 'finish'" class="intro-finish-note">
          {{
            isMobile
              ? t("onboarding.mobileFinishNote")
              : t("onboarding.desktopFinishNote")
          }}
        </div>

        <footer v-if="current.kind !== 'nav'">
          <button v-if="mode === 'chapter'" type="button" class="intro-skip" @click="returnToMenu">
            {{ t("onboarding.returnChapters") }}
          </button>
          <button
            v-else-if="current.kind !== 'finish'"
            type="button"
            class="intro-skip"
            @click="close"
          >
            {{ t("onboarding.skip") }}
          </button>
          <button type="button" class="intro-next" @click="next">
            {{ nextButtonLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, type Component } from "vue";
import {
  Bot,
  FolderOpen,
  ListTodo,
  MessageSquare,
  MousePointer2,
  UserRound,
  Users,
  X,
} from "lucide-vue-next";
import { useI18n } from "@/i18n";

const { t } = useI18n();

type ChapterId = "chat" | "todo" | "agents" | "resources" | "work" | "me";

type Stage = {
  kind: "overview" | "nav" | "feature" | "finish";
  chapterId?: ChapterId;
  selector: string;
  eyebrow: string;
  title: string;
  content: string;
  navLabel?: string;
  nextLabel?: string;
};

type Chapter = {
  id: ChapterId;
  label: string;
  desc: string;
  icon: Component;
};

const desktopStages: Stage[] = [
  {
    kind: "overview",
    selector: "[data-tour-sidebar]",
    eyebrow: t("onboarding.d0e"), title: t("onboarding.d0t"), content: t("onboarding.d0c"),
  },
  {
    kind: "nav",
    chapterId: "chat",
    selector: '[data-tour-nav="chat"]',
    eyebrow: t("onboarding.d1e"), title: t("onboarding.d1t"), content: t("onboarding.d1c"), navLabel: t("onboarding.navChat"),
  },
  {
    kind: "feature",
    chapterId: "chat",
    selector: '[data-tour-page="chat"]',
    eyebrow: t("onboarding.d2e"), title: t("onboarding.d2t"), content: t("onboarding.d2c"),
  },
  {
    kind: "nav",
    chapterId: "todo",
    selector: '[data-tour-nav="todo"]',
    eyebrow: t("onboarding.d3e"), title: t("onboarding.d3t"), content: t("onboarding.d3c"), navLabel: t("onboarding.navTodo"),
  },
  {
    kind: "feature",
    chapterId: "todo",
    selector: '[data-tour-page="todo"]',
    eyebrow: t("onboarding.d4e"), title: t("onboarding.d4t"), content: t("onboarding.d4c"),
  },
  {
    kind: "nav",
    chapterId: "agents",
    selector: '[data-tour-nav="contacts"]',
    eyebrow: t("onboarding.d5e"), title: t("onboarding.d5t"), content: t("onboarding.d5c"), navLabel: t("onboarding.navAgents"),
  },
  {
    kind: "feature",
    chapterId: "agents",
    selector: '[data-tour-page="contacts"]',
    eyebrow: t("onboarding.d6e"), title: t("onboarding.d6t"), content: t("onboarding.d6c"),
  },
  {
    kind: "nav",
    chapterId: "resources",
    selector: '[data-tour-nav="resources"]',
    eyebrow: t("onboarding.d7e"), title: t("onboarding.d7t"), content: t("onboarding.d7c"), navLabel: t("onboarding.navResources"),
  },
  {
    kind: "feature",
    chapterId: "resources",
    selector: '[data-tour-page="resources"]',
    eyebrow: t("onboarding.d8e"), title: t("onboarding.d8t"), content: t("onboarding.d8c"),
  },
  {
    kind: "finish",
    selector: "[data-tour-tutorial]",
    eyebrow: t("onboarding.d9e"), title: t("onboarding.d9t"), content: t("onboarding.d9c"),
  },
];

const mobileStages: Stage[] = [
  {
    kind: "overview",
    selector: "[data-tour-tabbar]",
    eyebrow: t("onboarding.m0e"), title: t("onboarding.m0t"), content: t("onboarding.m0c"),
  },
  {
    kind: "nav",
    chapterId: "chat",
    selector: '[data-tour-nav="chat"]',
    eyebrow: t("onboarding.m1e"), title: t("onboarding.m1t"), content: t("onboarding.m1c"), navLabel: t("onboarding.navChat"),
  },
  {
    kind: "feature",
    chapterId: "chat",
    selector: '[data-tour-page="chat"]',
    eyebrow: t("onboarding.m2e"), title: t("onboarding.m2t"), content: t("onboarding.m2c"),
  },
  {
    kind: "nav",
    chapterId: "work",
    selector: '[data-tour-nav="work"]',
    eyebrow: t("onboarding.m3e"), title: t("onboarding.m3t"), content: t("onboarding.m3c"), navLabel: t("onboarding.navWork"),
  },
  {
    kind: "feature",
    chapterId: "work",
    selector: '[data-tour-page="work"]',
    eyebrow: t("onboarding.m4e"), title: t("onboarding.m4t"), content: t("onboarding.m4c"),
  },
  {
    kind: "nav",
    chapterId: "agents",
    selector: '[data-tour-nav="agents"]',
    eyebrow: t("onboarding.m5e"), title: t("onboarding.m5t"), content: t("onboarding.m5c"), navLabel: t("onboarding.navAgents"),
  },
  {
    kind: "feature",
    chapterId: "agents",
    selector: '[data-tour-page="contacts"]',
    eyebrow: t("onboarding.m6e"), title: t("onboarding.m6t"), content: t("onboarding.m6c"),
  },
  {
    kind: "nav",
    chapterId: "me",
    selector: '[data-tour-nav="me"]',
    eyebrow: t("onboarding.m7e"), title: t("onboarding.m7t"), content: t("onboarding.m7c"), navLabel: t("onboarding.navMe"),
  },
  {
    kind: "feature",
    chapterId: "me",
    selector: '[data-tour-page="me"]',
    eyebrow: t("onboarding.m8e"), title: t("onboarding.m8t"), content: t("onboarding.m8c"),
  },
  {
    kind: "finish",
    selector: "[data-tour-tutorial]",
    eyebrow: t("onboarding.m9e"), title: t("onboarding.m9t"), content: t("onboarding.m9c"),
  },
];

const desktopChapters: Chapter[] = [
  { id: "chat", label: t("onboarding.chat"), desc: t("onboarding.chatDesc"), icon: MessageSquare },
  { id: "todo", label: t("onboarding.todoPlan"), desc: t("onboarding.todoDesc"), icon: ListTodo },
  { id: "agents", label: t("onboarding.agents"), desc: t("onboarding.agentsDesc"), icon: Users },
  { id: "resources", label: t("onboarding.resources"), desc: t("onboarding.resourcesDesc"), icon: FolderOpen },
];

const mobileChapters: Chapter[] = [
  { id: "chat", label: t("onboarding.chat"), desc: t("onboarding.chatDesc"), icon: MessageSquare },
  { id: "work", label: t("onboarding.work"), desc: t("onboarding.workDesc"), icon: ListTodo },
  { id: "agents", label: t("onboarding.agents"), desc: t("onboarding.agentsDesc"), icon: Bot },
  { id: "me", label: t("onboarding.me"), desc: t("onboarding.meDesc"), icon: UserRound },
];

const open = ref(false);
const index = ref(0);
const isMobile = ref(false);
const mode = ref<"full" | "chapter">("full");
const activeStages = ref<Stage[]>(desktopStages);
const listenersBound = ref(false);
const rect = ref({ left: 12, top: 12, width: 48, height: 48 });
/** Mobile nav steps: lift sheet above tabbar so the target stays clickable. */
const sheetClearance = ref(0);

const current = computed(() => activeStages.value[index.value]!);
const chapters = computed(() => (isMobile.value ? mobileChapters : desktopChapters));
const isLast = computed(() => index.value >= activeStages.value.length - 1);

const nextButtonLabel = computed(() => {
  if (current.value.kind === "finish") return t("onboarding.finish");
  if (mode.value === "chapter" && isLast.value) return t("onboarding.finishChapter");
  return current.value.nextLabel || t("onboarding.next");
});

const focusStyle = computed(() => ({
  left: `${rect.value.left}px`,
  top: `${rect.value.top}px`,
  width: `${rect.value.width}px`,
  height: `${rect.value.height}px`,
}));

const popoverStyle = computed(() => {
  if (isMobile.value) {
    return sheetClearance.value > 0 ? { bottom: `${sheetClearance.value}px` } : {};
  }
  const width = current.value.kind === "overview" ? 380 : 320;
  const rightSide = rect.value.left < window.innerWidth / 2;
  const left = rightSide
    ? Math.min(window.innerWidth - width - 16, rect.value.left + rect.value.width + 14)
    : Math.max(16, rect.value.left - width - 14);
  const top = Math.max(16, Math.min(window.innerHeight - 520, rect.value.top));
  return { left: `${left}px`, top: `${top}px`, width: `${width}px` };
});

function allStages() {
  return isMobile.value ? mobileStages : desktopStages;
}

function refreshMobileFlag() {
  isMobile.value = window.matchMedia("(max-width: 767px)").matches;
}

function updateSheetClearance() {
  if (!isMobile.value || current.value.kind !== "nav") {
    sheetClearance.value = 0;
    return;
  }
  const tabbar = document.querySelector("[data-tour-tabbar]")?.getBoundingClientRect();
  // Keep a small gap so the sheet doesn't sit flush on the highlighted tab.
  sheetClearance.value = tabbar ? Math.ceil(window.innerHeight - tabbar.top) + 10 : 72;
}

async function locate() {
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  updateSheetClearance();
  const el = document.querySelector(current.value.selector);
  const target = el?.getBoundingClientRect();
  if (!target || (target.width === 0 && target.height === 0)) {
    // Fallback: highlight tabbar / sidebar so tour never points at empty space.
    const fallback = document
      .querySelector(isMobile.value ? "[data-tour-tabbar]" : "[data-tour-sidebar]")
      ?.getBoundingClientRect();
    if (!fallback) return;
    rect.value = {
      left: fallback.left - 4,
      top: fallback.top - 4,
      width: fallback.width + 8,
      height: fallback.height + 8,
    };
    return;
  }
  rect.value = {
    left: target.left - 4,
    top: target.top - 4,
    width: target.width + 8,
    height: target.height + 8,
  };
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value || current.value.kind !== "nav") return;
  const target = document.querySelector(current.value.selector);
  if (!target || !(event.target instanceof Node) || !target.contains(event.target)) return;
  index.value += 1;
  void locate();
}

function onViewportChange() {
  refreshMobileFlag();
  void locate();
}

function bindListeners() {
  if (listenersBound.value) return;
  document.addEventListener("click", onDocumentClick, true);
  window.addEventListener("resize", onViewportChange);
  window.visualViewport?.addEventListener("resize", onViewportChange);
  listenersBound.value = true;
}

function unbindListeners() {
  if (!listenersBound.value) return;
  document.removeEventListener("click", onDocumentClick, true);
  window.removeEventListener("resize", onViewportChange);
  window.visualViewport?.removeEventListener("resize", onViewportChange);
  listenersBound.value = false;
}

function start() {
  refreshMobileFlag();
  mode.value = "full";
  activeStages.value = allStages();
  index.value = 0;
  open.value = true;
  bindListeners();
  void locate();
}

function playChapter(chapterId: ChapterId) {
  refreshMobileFlag();
  const chapterStages = allStages().filter((stage) => stage.chapterId === chapterId);
  if (chapterStages.length === 0) return;
  mode.value = "chapter";
  activeStages.value = chapterStages;
  index.value = 0;
  open.value = true;
  bindListeners();
  void locate();
}

function returnToMenu() {
  mode.value = "full";
  activeStages.value = allStages();
  index.value = 0;
  void locate();
}

function close() {
  open.value = false;
  mode.value = "full";
  sheetClearance.value = 0;
  unbindListeners();
}

function next() {
  if (isLast.value) {
    if (mode.value === "chapter") return returnToMenu();
    return close();
  }
  index.value += 1;
  void locate();
}

onBeforeUnmount(close);
defineExpose({ start, startChapter: playChapter });
</script>

<style scoped>
.intro-layer {
  position: fixed;
  inset: 0;
  z-index: 1200;
  pointer-events: none;
}

.intro-focus {
  position: fixed;
  border: 2px solid #07c160;
  border-radius: 9px;
  box-shadow:
    0 0 0 3px rgb(7 193 96 / 14%),
    0 0 0 9999px rgb(0 0 0 / 30%);
  pointer-events: none;
  transition: all 0.24s ease;
}

.intro-popover {
  position: fixed;
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 17px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-popup-bg);
  color: var(--app-text-primary);
  box-shadow: 0 12px 36px rgb(0 0 0 / 20%);
  pointer-events: auto;
  transition:
    top 0.24s ease,
    left 0.24s ease;
}

.intro-popover header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.intro-popover header > span {
  color: #07c160;
  font-size: 11px;
  font-weight: 550;
}

.intro-popover header button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  color: var(--app-text-muted);
}

.intro-popover header button:hover {
  background: var(--app-hover);
}

.intro-popover header svg {
  width: 16px;
  height: 16px;
}

.intro-popover h3 {
  margin-top: 7px;
  font-size: 16px;
  font-weight: 650;
}

.intro-popover > p {
  margin-top: 7px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.intro-chapters {
  margin-top: 14px;
}

.intro-chapters-label {
  margin-bottom: 8px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.intro-chapters-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.intro-chapter-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 7px;
  background: transparent;
  color: inherit;
  text-align: left;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.intro-chapter-btn:hover {
  border-color: color-mix(in srgb, #07c160 45%, var(--app-border-subtle));
  background: color-mix(in srgb, #07c160 8%, transparent);
}

.intro-chapter-btn svg {
  width: 16px;
  height: 16px;
  flex: none;
  color: #07c160;
}

.intro-chapter-btn span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.intro-chapter-btn strong {
  font-size: 12px;
  font-weight: 550;
}

.intro-chapter-btn small {
  margin-top: 1px;
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.intro-action-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 10px;
  border-radius: 7px;
  background: color-mix(in srgb, #07c160 9%, transparent);
  color: #07c160;
  font-size: 12px;
}

.intro-action-hint svg {
  width: 15px;
  height: 15px;
  flex: none;
}

.intro-finish-note {
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px solid var(--app-border-subtle);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.intro-popover footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.intro-popover footer button {
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 12px;
}

.intro-skip {
  color: var(--app-text-secondary);
  background: var(--app-hover);
}

.intro-next {
  color: white;
  background: #07c160;
}

.intro-layer--mobile .intro-focus {
  border-radius: 12px;
}

.intro-popover--sheet {
  left: 0;
  right: 0;
  bottom: 0;
  top: auto;
  width: 100%;
  max-width: none;
  max-height: min(68vh, 520px);
  margin: 0;
  padding: 16px 16px calc(14px + env(safe-area-inset-bottom));
  border-radius: 16px 16px 0 0;
  border-left: 0;
  border-right: 0;
  border-bottom: 0;
  box-shadow: 0 -8px 28px rgb(0 0 0 / 18%);
}

/* Nav steps: float above tabbar so the highlighted tab remains tappable. */
.intro-popover--above-tabbar {
  left: 12px;
  right: 12px;
  width: auto;
  max-height: min(52vh, 360px);
  padding: 14px 14px 12px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 14px;
  box-shadow: 0 10px 28px rgb(0 0 0 / 22%);
}

.intro-popover--sheet footer button {
  min-height: 44px;
  min-width: 96px;
  font-size: 14px;
  border-radius: 8px;
}

.intro-popover--sheet header button {
  width: 44px;
  height: 44px;
}

.intro-popover--sheet .intro-chapter-btn {
  min-height: 48px;
}
</style>
