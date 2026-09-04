<template>
  <section class="timeline">
    <header>
      <div>
        <h2>{{ t("home.projectTimeline.title") }}</h2>
        <p v-if="filterHint">{{ filterHint }}</p>
      </div>
      <div class="filters">
        <button
          v-for="project in projects"
          :key="project.id"
          :class="{ active: visibleIds.has(project.id) }"
          @click="toggleProject(project.id)"
        >
          <i :style="{ background: projectColor(project.id) }" />{{ project.name }}
        </button>
      </div>
    </header>
    <div v-if="loading" class="timeline__loading">
      <Loader2 class="timeline__spin" aria-hidden="true" />
      <span>{{ t("home.projectTimeline.loading") }}</span>
    </div>
    <UiEmptyState
      v-else-if="!visibleEvents.length"
      class="timeline__empty"
      :title="t('home.projectTimeline.emptyTitle')"
      :description="t('home.projectTimeline.emptyDescription')"
    >
      <template #icon><GitCommitHorizontal /></template>
    </UiEmptyState>
    <template v-else>
      <div class="mobile-events">
        <template v-for="project in visibleProjects" :key="`mobile-${project.id}`">
          <section v-if="laneEvents(project.id).length" class="mobile-events__project">
            <header>
              <i :style="{ background: projectColor(project.id) }" />
              <strong>{{ project.name }}</strong>
              <span>{{ laneEvents(project.id).length }}</span>
            </header>
            <button
              v-for="event in laneEvents(project.id)"
              :key="event.id"
              type="button"
              @click="emit('open-session', event.entityId)"
            >
              <span class="mobile-events__dot" :data-status="event.status || 'idle'" />
              <span class="mobile-events__body">
                <strong>{{ sessionTitle(event.entityId) }}</strong>
                <small>{{ formatTime(event.createdAt) }} · {{ eventLabel(event) }}</small>
              </span>
              <em>{{ statusLabel(event.status) }}</em>
            </button>
          </section>
        </template>
      </div>
      <div class="scroll custom-scrollbar">
        <div class="canvas">
          <div class="axis-label">{{ t("home.projectTimeline.project") }}</div>
          <div class="axis">
            <span
              v-for="tick in ticks"
              :key="`${tick.at}-${tick.x}`"
              :style="{ left: `${tick.x}%` }"
              ><b>{{ tick.label }}</b></span
            >
          </div>
          <div v-for="project in visibleProjects" :key="project.id" class="lane">
            <aside>
              <i :style="{ background: projectColor(project.id) }" />
              <div>
                <strong>{{ project.name }}</strong
                ><small>{{ t("home.projectTimeline.events", { count: laneEvents(project.id).length }) }}</small>
              </div>
            </aside>
            <div class="track">
              <span
                v-for="tick in ticks"
                :key="`${tick.at}-${tick.x}`"
                class="grid"
                :style="{ left: `${tick.x}%` }"
              />
              <span class="baseline" />
              <button
                v-for="event in laneEvents(project.id)"
                :key="event.id"
                class="point"
                :style="pointStyle(event)"
                :data-status="event.status || 'idle'"
                :aria-label="sessionTitle(event.entityId)"
                @click="emit('open-session', event.entityId)"
              >
                <span class="popover" :class="{ right: eventX(event) > 70 }">
                  <small>{{ formatTime(event.createdAt) }} · {{ eventLabel(event) }}</small>
                  <strong>{{ sessionTitle(event.entityId) }}</strong>
                  <em>{{ statusLabel(event.status) }}</em>
                  <template v-if="commits[event.entityId]?.length">
                    <span
                      v-for="commit in commits[event.entityId].slice(0, 3)"
                      :key="commit.hash"
                      class="commit"
                      ><code>{{ commit.shortHash }}</code
                      >{{ commit.subject }}</span
                    >
                  </template>
                  <span v-else class="empty">{{ t("home.projectTimeline.noCommits") }}</span>
                  <span class="popover__action">{{ t("home.projectTimeline.openSession") }}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { GitCommitHorizontal, Loader2 } from "lucide-vue-next";
import type { Project, Session, TimelineEvent, WorktreeCommit } from "@/api";
import UiEmptyState from "@/components/base/UiEmptyState.vue";
import { useI18n } from "@/i18n";

type StatusFilter = "running" | "attention" | "finish" | "commits" | null;

const props = defineProps<{
  projects: Project[];
  sessions: Session[];
  events: TimelineEvent[];
  commits: Record<string, WorktreeCommit[]>;
  loading?: boolean;
  statusFilter?: StatusFilter;
}>();
const { t, locale } = useI18n();
const emit = defineEmits<{ "open-session": [id: string] }>();
const visibleIds = ref(new Set<string>());
watch(
  () => props.projects,
  (rows) => {
    if (!visibleIds.value.size) visibleIds.value = new Set(rows.map((p) => p.id));
  },
  { immediate: true },
);
const visibleProjects = computed(() => props.projects.filter((p) => visibleIds.value.has(p.id)));
const sessionMap = computed(() => new Map(props.sessions.map((s) => [s.id, s])));
const filterHint = computed(() => {
  switch (props.statusFilter) {
    case "running":
      return t("home.projectTimeline.filterRunning");
    case "attention":
      return t("home.projectTimeline.filterAttention");
    case "finish":
      return t("home.projectTimeline.filterFinished");
    case "commits":
      return t("home.projectTimeline.filterCommits");
    default:
      return "";
  }
});

function matchesStatusFilter(event: TimelineEvent) {
  const filter = props.statusFilter ?? null;
  if (!filter) return true;
  const session = sessionMap.value.get(event.entityId);
  const status = event.status || session?.status || "idle";
  if (filter === "running") return status === "running";
  if (filter === "attention") return status === "blocked" || status === "error";
  if (filter === "finish") return status === "finish" || status === "finished";
  if (filter === "commits") return (props.commits[event.entityId]?.length ?? 0) > 0;
  return true;
}

const visibleEvents = computed(() =>
  props.events.filter(
    (e) =>
      e.projectId &&
      visibleIds.value.has(e.projectId) &&
      e.type === "session" &&
      sessionMap.value.get(e.entityId)?.showInSessionList !== false &&
      matchesStatusFilter(e),
  ),
);
const range = computed(() => {
  const day = 86_400_000;
  const values = visibleEvents.value.map((e) => dayStart(e.createdAt)).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : dayStart(Date.now()) - day * 7;
  const max = values.length ? Math.max(...values) : dayStart(Date.now());
  return { min: min - day, max: max + day };
});
const ticks = computed(() =>
  Array.from({ length: 6 }, (_, index) => {
    const raw = range.value.min + ((range.value.max - range.value.min) * index) / 5;
    const at = dayStart(raw);
    return {
      at,
      x: index * 20,
      label: new Intl.DateTimeFormat(locale.value, { month: "numeric", day: "numeric" }).format(at),
    };
  }),
);
function toggleProject(id: string) {
  const next = new Set(visibleIds.value);
  if (next.has(id) && next.size > 1) next.delete(id);
  else next.add(id);
  visibleIds.value = next;
}
function laneEvents(id: string) {
  return visibleEvents.value.filter((e) => e.projectId === id);
}
function dayStart(value: string | number) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function stackIndex(event: TimelineEvent) {
  const sameDay = laneEvents(event.projectId ?? "").filter(
    (item) => dayStart(item.createdAt) === dayStart(event.createdAt),
  );
  return Math.max(
    0,
    sameDay.findIndex((item) => item.id === event.id),
  );
}
function eventX(event: TimelineEvent) {
  return (
    ((dayStart(event.createdAt) - range.value.min) / (range.value.max - range.value.min)) * 100
  );
}
function sessionColor(id: string) {
  const colors = ["#07c160", "#576b95", "#f2994a", "#2d9cdb", "#bb6bd9", "#eb5757", "#27ae60"];
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length]!;
}
function projectColor(id: string) {
  return sessionColor(`project-${id}`);
}
function pointStyle(event: TimelineEvent) {
  const stacked = stackIndex(event);
  return {
    left: `calc(${eventX(event)}% + ${Math.min(stacked, 7) * 8}px)`,
    zIndex: 3 + stacked,
    background: sessionColor(event.entityId),
  };
}
function sessionTitle(id: string) {
  const s = sessionMap.value.get(id);
  return s?.title || t("home.projectTimeline.session", { id });
}
function statusLabel(status: TimelineEvent["status"]) {
  return (
    (
      {
        finish: t("home.projectTimeline.statusFinished"),
        finished: t("home.projectTimeline.statusFinished"),
        running: t("home.projectTimeline.statusRunning"),
        blocked: t("home.projectTimeline.statusAttention"),
        error: t("home.projectTimeline.statusError"),
        idle: t("home.projectTimeline.statusIdle"),
        initializing: t("home.projectTimeline.statusInitializing"),
        stopped: t("home.projectTimeline.statusStopped"),
      } as Record<string, string>
    )[status || "idle"] ||
    status ||
    t("home.projectTimeline.statusIdle")
  );
}
function eventLabel(event: TimelineEvent) {
  return event.kind === "created"
    ? t("home.projectTimeline.eventCreated")
    : event.kind === "synced"
      ? t("home.projectTimeline.eventSynced")
      : t("home.projectTimeline.eventStatusChanged");
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat(locale.value, {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}
</script>

<style scoped>
.timeline {
  min-width: 0;
  position: relative;
  z-index: 1;
  overflow: visible;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card);
}
.timeline__loading {
  display: flex;
  min-height: 220px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 16px;
  color: var(--app-text-muted);
  font-size: var(--app-font-control, 0.8125rem);
}
.timeline__spin {
  width: 22px;
  height: 22px;
  animation: timeline-spin 0.8s linear infinite;
}
.timeline__empty {
  padding: 24px 16px 32px;
}
@keyframes timeline-spin {
  to {
    transform: rotate(360deg);
  }
}
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
}
h2 {
  font-size: 15px;
  font-weight: 650;
}
header p {
  margin-top: 4px;
  color: var(--app-accent);
  font-size: 12px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.filters button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--app-hover);
  color: var(--app-text-muted);
  font-size: 12px;
  opacity: 0.55;
}
.filters button.active {
  opacity: 1;
  color: var(--app-text-primary);
  background: color-mix(in srgb, var(--app-accent) 10%, var(--app-hover));
}
.filters i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.scroll {
  overflow: auto;
}
.canvas {
  display: grid;
  grid-template-columns: 148px minmax(700px, 1fr);
  position: relative;
  min-width: 860px;
}
.axis-label {
  padding: 12px 14px;
  border-right: 1px solid var(--app-border-subtle);
  color: var(--app-text-muted);
  font-size: 11px;
}
.axis {
  position: relative;
  height: 36px;
}
.axis span {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid color-mix(in srgb, var(--app-border-subtle) 70%, transparent);
}
.axis b {
  position: absolute;
  top: 10px;
  left: 8px;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}
.lane {
  display: contents;
}
.lane aside {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 14px;
  border-top: 1px solid var(--app-border-subtle);
  border-right: 1px solid var(--app-border-subtle);
}
.lane aside > i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.lane aside strong,
.lane aside small {
  display: block;
  max-width: 104px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lane aside strong {
  font-size: 12px;
  font-weight: 600;
}
.lane aside small {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.track {
  position: relative;
  height: 60px;
  border-top: 1px solid var(--app-border-subtle);
}
.grid {
  position: absolute;
  inset-block: 0;
  border-left: 1px solid color-mix(in srgb, var(--app-border-subtle) 55%, transparent);
}
.baseline {
  position: absolute;
  left: 0;
  right: 0;
  top: 29px;
  height: 1px;
  background: color-mix(in srgb, var(--app-border) 70%, transparent);
}
.point {
  position: absolute;
  z-index: 2;
  top: 21px;
  width: 16px;
  height: 16px;
  border: 2px solid #9aa0aa;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--app-settings-card);
  transform: translateX(-50%);
  transition: transform 0.15s ease;
}
.point:hover,
.point:focus-visible {
  z-index: 30;
  transform: translateX(-50%) scale(1.16);
  outline: none;
}
.point[data-status="running"] {
  border-color: #576b95;
}
.point[data-status="finish"],
.point[data-status="finished"] {
  border-color: #07c160;
}
.point[data-status="blocked"],
.point[data-status="error"] {
  border-color: #fa5151;
}
.point[data-status="initializing"] {
  border-color: #f2994a;
}
.popover {
  position: absolute;
  left: 10px;
  bottom: 24px;
  z-index: 40;
  display: none;
  width: 236px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  text-align: left;
  background: var(--app-popup-bg);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.14);
  transform-origin: left bottom;
}
.point:hover .popover,
.point:focus-visible .popover {
  display: grid;
  gap: 6px;
}
.popover.right {
  right: 10px;
  left: auto;
  transform-origin: right bottom;
}
.popover small,
.popover .empty {
  color: var(--app-text-muted);
  font-size: 11px;
}
.popover strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.popover em {
  width: max-content;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  font-size: 11px;
  font-style: normal;
}
.popover__action {
  margin-top: 2px;
  color: var(--app-accent);
  font-size: 12px;
  font-weight: 600;
}
.commit {
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.commit code {
  margin-right: 5px;
  color: #576b95;
}
.mobile-events {
  display: none;
}
@media (max-width: 767px) {
  .timeline {
    overflow: hidden;
    border-radius: 8px;
  }
  header {
    display: grid;
    gap: 10px;
    padding: 12px var(--m-page-inline, 16px);
  }
  h2 {
    font-size: 15px;
  }
  .mobile-events {
    display: grid;
  }
  .mobile-events__project > header {
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 8px;
    padding: 8px var(--m-page-inline, 16px);
    border-top: 1px solid var(--app-border-subtle);
    border-bottom: 0;
    background: color-mix(in srgb, var(--app-hover) 55%, transparent);
  }
  .mobile-events__project > header i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .mobile-events__project > header strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-events__project > header span {
    color: var(--app-text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .mobile-events__project > button {
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 56px;
    align-items: center;
    gap: 12px;
    padding: 12px var(--m-page-inline, 16px);
    border-top: 1px solid var(--app-border-subtle);
    text-align: left;
  }
  .mobile-events__project > button:active {
    background: var(--m-pressed, var(--app-hover));
  }
  .mobile-events__dot {
    width: 10px;
    height: 10px;
    flex: none;
    border-radius: 50%;
    background: #9ca3af;
  }
  .mobile-events__dot[data-status="running"] {
    background: #576b95;
  }
  .mobile-events__dot[data-status="finish"],
  .mobile-events__dot[data-status="finished"] {
    background: #07c160;
  }
  .mobile-events__dot[data-status="blocked"],
  .mobile-events__dot[data-status="error"] {
    background: #fa5151;
  }
  .mobile-events__body {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 2px;
  }
  .mobile-events__body strong {
    overflow: hidden;
    font-size: 15px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-events__body small {
    color: var(--app-text-muted);
    font-size: 12px;
  }
  .mobile-events__project > button em {
    flex: none;
    color: var(--app-text-secondary);
    font-size: 12px;
    font-style: normal;
  }
  .scroll {
    display: none;
  }
  .filters {
    justify-content: flex-start;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;
  }
  .filters button {
    flex: none;
    max-width: none;
    white-space: nowrap;
  }
}
</style>
