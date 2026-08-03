<template>
  <section class="timeline">
    <header>
      <div>
        <h2>项目时间轴</h2>
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
    <div class="scroll custom-scrollbar">
      <div class="canvas">
        <div class="axis-label">项目</div>
        <div class="axis">
          <span v-for="tick in ticks" :key="`${tick.at}-${tick.x}`" :style="{ left: `${tick.x}%` }"
            ><b>{{ tick.label }}</b></span
          >
        </div>
        <div v-for="project in visibleProjects" :key="project.id" class="lane">
          <aside>
            <i :style="{ background: projectColor(project.id) }" />
            <div>
              <strong>{{ project.name }}</strong
              ><small>{{ laneEvents(project.id).length }} 个事件</small>
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
              :aria-label="sessionTitle(event.sessionId)"
              @click="emit('open-session', event.sessionId)"
            >
              <span class="popover" :class="{ right: eventX(event) > 70 }">
                <small>{{ formatTime(event.createdAt) }} · {{ eventLabel(event) }}</small>
                <strong>{{ sessionTitle(event.sessionId) }}</strong>
                <em>{{ statusLabel(event.status) }}</em>
                <template v-if="commits[event.sessionId]?.length">
                  <span
                    v-for="commit in commits[event.sessionId].slice(0, 3)"
                    :key="commit.hash"
                    class="commit"
                    ><code>{{ commit.shortHash }}</code
                    >{{ commit.subject }}</span
                  >
                </template>
                <span v-else class="empty">暂无独立提交</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Project, Session, SessionTimelineEvent, WorktreeCommit } from "@/api";
const props = defineProps<{
  projects: Project[];
  sessions: Session[];
  events: SessionTimelineEvent[];
  commits: Record<string, WorktreeCommit[]>;
}>();
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
const visibleEvents = computed(() =>
  props.events.filter(
    (e) =>
      e.projectId &&
      visibleIds.value.has(e.projectId) &&
      sessionMap.value.get(e.sessionId)?.showInSessionList,
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
      label: new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(at),
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
function stackIndex(event: SessionTimelineEvent) {
  const sameDay = laneEvents(event.projectId ?? "").filter(
    (item) => dayStart(item.createdAt) === dayStart(event.createdAt),
  );
  return Math.max(
    0,
    sameDay.findIndex((item) => item.id === event.id),
  );
}
function eventX(event: SessionTimelineEvent) {
  return (
    ((dayStart(event.createdAt) - range.value.min) / (range.value.max - range.value.min)) * 100
  );
}
function sessionColor(id: string) {
  const colors = ["#5e6ad2", "#f2994a", "#27ae60", "#2d9cdb", "#bb6bd9", "#eb5757", "#f2c94c"];
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length]!;
}
function projectColor(id: string) {
  return sessionColor(`project-${id}`);
}
function pointStyle(event: SessionTimelineEvent) {
  const stacked = stackIndex(event);
  return {
    left: `${eventX(event)}%`,
    top: `${18 + Math.min(stacked, 5) * 4}px`,
    zIndex: 3 + stacked,
    background: sessionColor(event.sessionId),
  };
}
function sessionTitle(id: string) {
  const s = sessionMap.value.get(id);
  return s?.title || `Session ${id}`;
}
function statusLabel(status: SessionTimelineEvent["status"]) {
  return (
    (
      {
        finish: "已合并",
        running: "进行中",
        blocked: "需处理",
        error: "异常",
        idle: "待命",
        initializing: "准备中",
      } as Record<string, string>
    )[status || "idle"] ||
    status ||
    "待命"
  );
}
function eventLabel(event: SessionTimelineEvent) {
  return event.kind === "created" ? "创建" : event.kind === "synced" ? "同步" : "状态变化";
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}
</script>

<style scoped>
.timeline {
  min-width: 0;
  border: 1px solid var(--app-border-subtle);
  border-radius: 12px;
  background: var(--app-settings-card);
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
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 10px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}
.filters button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border-radius: 6px;
  background: var(--app-hover);
  color: var(--app-text-muted);
  font-size: 9px;
  opacity: 0.5;
}
.filters button.active {
  opacity: 1;
  color: var(--app-text-primary);
}
.filters i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.scroll {
  overflow-x: auto;
  overflow-y: visible;
}
.canvas {
  display: grid;
  grid-template-columns: 135px minmax(700px, 1fr);
  position: relative;
  min-width: 850px;
}
.axis-label {
  padding: 10px 14px;
  border-right: 1px solid var(--app-border-subtle);
  color: var(--app-text-muted);
  font-size: 9px;
}
.axis {
  position: relative;
  height: 34px;
}
.axis span {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid var(--app-border-subtle);
}
.axis b {
  position: absolute;
  top: 9px;
  left: 6px;
  color: var(--app-text-muted);
  font-size: 9px;
  font-weight: 400;
  white-space: nowrap;
}
.lane {
  display: contents;
}
.lane aside {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 54px;
  padding: 0 14px;
  border-top: 1px solid var(--app-border-subtle);
  border-right: 1px solid var(--app-border-subtle);
}
.lane aside > i {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}
.lane aside strong,
.lane aside small {
  display: block;
  max-width: 95px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lane aside strong {
  font-size: 10px;
}
.lane aside small {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 8px;
}
.track {
  position: relative;
  height: 54px;
  border-top: 1px solid var(--app-border-subtle);
}
.grid {
  position: absolute;
  inset-block: 0;
  border-left: 1px solid var(--app-border-subtle);
  opacity: 0.65;
}
.baseline {
  position: absolute;
  left: 0;
  right: 0;
  top: 26px;
  height: 1px;
  background: var(--app-border);
}
.point {
  position: absolute;
  z-index: 2;
  top: 19px;
  width: 15px;
  height: 15px;
  border: 4px solid #9aa0aa;
  border-radius: 50%;
  transform: translateX(-50%);
  box-shadow: 0 0 0 2px var(--app-settings-card);
  transition: transform 0.15s ease;
}
.point:hover,
.point:focus-visible {
  z-index: 10;
  transform: translateX(-50%) scale(1.3);
  outline: none;
}
.point[data-status="running"] {
  border-color: #2f80ed;
}
.point[data-status="finish"] {
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
  left: 8px;
  bottom: 22px;
  display: none;
  width: 230px;
  padding: 11px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  text-align: left;
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0/0.18);
  transform: scale(0.77);
  transform-origin: left bottom;
}
.point:hover .popover,
.point:focus-visible .popover {
  display: grid;
  gap: 5px;
}
.popover.right {
  right: 8px;
  left: auto;
  transform-origin: right bottom;
}
.popover small,
.popover .empty {
  color: var(--app-text-muted);
  font-size: 9px;
}
.popover strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.popover em {
  width: max-content;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  font-size: 8px;
  font-style: normal;
}
.commit {
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.commit code {
  margin-right: 5px;
  color: #5e6ad2;
}
@media (max-width: 640px) {
  header {
    display: grid;
  }
  .filters {
    justify-content: flex-start;
  }
  .canvas {
    grid-template-columns: 105px minmax(620px, 1fr);
  }
}
</style>
