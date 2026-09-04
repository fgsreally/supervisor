<template>
  <section class="task-timeline" :aria-label="t('home.timeline.title')">
    <header>
      <div>
        <h3>{{ t("home.timeline.execution") }}</h3>
        <p>{{ t("home.timeline.summary", { tasks: tasks.length, lanes: laneCount }) }}</p>
      </div>
      <div class="task-timeline__legend">
        <span><i class="is-ready" />{{ t("home.timeline.ready") }}</span>
        <span><i class="is-waiting" />{{ t("home.timeline.waiting") }}</span>
      </div>
    </header>
    <div v-if="!tasks.length" class="task-timeline__empty">
      {{ t("home.timeline.empty") }}
    </div>
    <div v-else class="task-timeline__scroll custom-scrollbar">
      <div class="task-timeline__grid" :style="gridStyle">
        <div v-for="lane in laneCount" :key="lane" class="task-timeline__lane-head">
          {{ t("home.timeline.stage", { lane }) }}
        </div>
        <template v-for="row in rows" :key="row.task.id">
          <div class="task-timeline__name" :title="row.task.title">{{ row.task.title }}</div>
          <div class="task-timeline__track" :style="{ gridColumn: `2 / span ${laneCount}` }">
            <span
              class="task-timeline__bar"
              :class="barClass(row.task)"
              :style="{ left: `${(row.lane / laneCount) * 100}%`, width: `${100 / laneCount}%` }"
            >
              <span>{{ projectName(row.task) }}</span>
            </span>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { HomeTask, Project } from "@/api";
import { useI18n } from "@/i18n";

const props = defineProps<{ tasks: HomeTask[]; projects: Project[] }>();
const { t } = useI18n();

const rows = computed(() => {
  const depths = new Map<number, number>();
  const byId = new Map(props.tasks.map((task) => [task.id, task]));
  const depthOf = (task: HomeTask, visiting = new Set<number>()): number => {
    if (depths.has(task.id)) return depths.get(task.id)!;
    if (visiting.has(task.id)) return 0;
    visiting.add(task.id);
    const depth = task.dependsOn.reduce((max, id) => {
      const dependency = byId.get(id);
      return dependency ? Math.max(max, depthOf(dependency, visiting) + 1) : max;
    }, 0);
    visiting.delete(task.id);
    depths.set(task.id, depth);
    return depth;
  };
  return props.tasks.map((task) => ({ task, lane: depthOf(task) }));
});

const laneCount = computed(() => Math.max(1, ...rows.value.map((row) => row.lane + 1)));
const gridStyle = computed(() => ({
  gridTemplateColumns: `minmax(132px, 0.7fr) repeat(${laneCount.value}, minmax(112px, 1fr))`,
}));

function projectName(task: HomeTask): string {
  return (
    props.projects.find((project) => Number(project.id) === task.projectId)?.name ?? t("home.timeline.noProject")
  );
}

function barClass(task: HomeTask): string {
  if (task.status === "done") return "is-done";
  if (task.status === "in_progress") return "is-running";
  if (task.status === "blocked" || task.status === "error") return "is-error";
  return task.dependsOn.length ? "is-waiting" : "is-ready";
}
</script>

<style scoped>
.task-timeline {
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card);
  overflow: hidden;
}
.task-timeline > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.task-timeline h3 {
  margin: 0;
  color: var(--app-text-primary);
  font-size: 13px;
  font-weight: 650;
}
.task-timeline p {
  margin: 2px 0 0;
  color: var(--app-text-muted);
  font-size: 11px;
}
.task-timeline__legend {
  display: flex;
  gap: 12px;
  color: var(--app-text-muted);
  font-size: 10px;
}
.task-timeline__legend span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.task-timeline__legend i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}
.task-timeline__empty {
  padding: 24px;
  text-align: center;
  color: var(--app-text-muted);
  font-size: 12px;
}
.task-timeline__scroll {
  overflow-x: auto;
}
.task-timeline__grid {
  display: grid;
  min-width: max-content;
  align-items: center;
  padding: 8px 12px 12px;
  gap: 5px 0;
}
.task-timeline__lane-head {
  grid-row: 1;
  padding: 2px 8px 6px;
  border-bottom: 1px solid var(--app-border-subtle);
  color: var(--app-text-muted);
  font-size: 10px;
}
.task-timeline__lane-head:first-child {
  grid-column: 2;
}
.task-timeline__name {
  overflow: hidden;
  padding-right: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-primary);
  font-size: 11px;
}
.task-timeline__track {
  position: relative;
  height: 28px;
  border-radius: 5px;
  background: var(--app-hover);
}
.task-timeline__bar {
  position: absolute;
  top: 3px;
  height: 22px;
  padding: 3px 8px;
  border-radius: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #17643b;
  background: color-mix(in srgb, #07c160 18%, var(--app-settings-card));
  font-size: 10px;
  border-left: 3px solid #07c160;
}
.task-timeline__bar.is-waiting {
  color: var(--app-text-secondary);
  background: var(--app-hover);
  border-left-color: #9ca3af;
}
.task-timeline__bar.is-running {
  color: #175b9c;
  background: color-mix(in srgb, #3b82f6 15%, var(--app-settings-card));
  border-left-color: #3b82f6;
}
.task-timeline__bar.is-done {
  opacity: 0.7;
}
.task-timeline__bar.is-error {
  color: #a52b2b;
  background: color-mix(in srgb, #dc2626 12%, var(--app-settings-card));
  border-left-color: #dc2626;
}
@media (max-width: 640px) {
  .task-timeline > header {
    align-items: flex-start;
  }
  .task-timeline__legend {
    display: none;
  }
}
</style>
