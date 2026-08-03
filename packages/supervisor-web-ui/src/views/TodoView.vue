<template>
  <div class="todo-shell">
    <header class="todo-head">
      <h1>Todo</h1>
      <div class="mobile-tabs">
        <button :class="{ active: mobileTab === 'plan' }" @click="mobileTab = 'plan'">规划</button
        ><button :class="{ active: mobileTab === 'run' }" @click="mobileTab = 'run'">执行</button>
      </div>
    </header>
    <main class="todo-stage">
      <section class="plan-pane" :class="{ 'mobile-hidden': mobileTab !== 'plan' }">
        <div class="pane-title">
          <div>
            <h2>规划</h2>
            <span>把想法整理成可执行的任务</span>
          </div>
          <button class="quiet"><History />历史</button>
        </div>
        <div class="goal-box">
          <textarea v-model="goal" rows="5" placeholder="描述你想完成的事情，输入 @ 关联项目" />
          <div class="goal-box__footer">
            <span class="project-pill"><FolderGit2 />supervisor-web-ui</span
            ><button class="primary" @click="mockPlan">
              <Sparkles />{{ planning ? "正在整理…" : "开始规划" }}
            </button>
          </div>
        </div>
        <div class="draft-head">
          <div>
            <strong>当前任务</strong><span>{{ drafts.length }}</span>
          </div>
          <button v-if="false" class="quiet" @click="addDraft"><Plus />添加任务</button>
        </div>
        <TodoSequenceDiagram @select="selectDraft" />
        <div v-if="false" class="dependency-list" @mouseleave="hovered = null">
          <article
            v-for="task in drafts"
            :key="task.id"
            class="task-card draft-card"
            :class="relationClass(task.id)"
            @mouseenter="hovered = task.id"
            @click="selected = task"
          >
            <span class="step">{{ task.id }}</span>
            <div class="task-main">
              <strong>{{ task.title }}</strong>
              <p>{{ task.summary }}</p>
              <div class="task-meta">
                <span class="project-badge"><FolderGit2 />{{ task.project }}</span>
                <span class="agent-badge"
                  ><i>{{ avatarInitial(task.agent) }}</i
                  >{{ task.agent }}</span
                >
              </div>
            </div>
            <button class="icon-btn"><Pencil /></button>
          </article>
        </div>
        <section v-if="false" class="todo-timeline" @mouseleave="hovered = null">
          <header><strong>执行时间轴</strong><span>同列并行，向右依次执行</span></header>
          <div class="timeline-grid">
            <div v-for="(level, index) in draftLevels" :key="index" class="timeline-level">
              <b>阶段 {{ index + 1 }}</b>
              <button
                v-for="task in level"
                :key="task.id"
                :class="relationClass(task.id)"
                @mouseenter="hovered = task.id"
                @click="selected = task"
              >
                <span>{{ task.title }}</span
                ><small>{{ task.project }}</small>
              </button>
              <ChevronRight v-if="index < draftLevels.length - 1" class="timeline-arrow" />
            </div>
          </div>
        </section>
        <div class="plan-actions">
          <label v-if="false" class="auto-switch"
            ><input v-model="autoExecute" type="checkbox" /><span />自动开始后续任务</label
          >
          <div>
            <button class="secondary">仅加入待办</button><button class="primary">开始执行</button>
          </div>
        </div>
      </section>
      <section class="run-pane" :class="{ 'mobile-hidden': mobileTab !== 'run' }">
        <div class="pane-title">
          <div>
            <h2>执行</h2>
            <span>{{ runningCount }} 个任务正在进行</span>
          </div>
        </div>
        <div class="run-toolbar">
          <div class="view-switch">
            <button :class="{ active: runView === 'list' }" @click="runView = 'list'">列表</button>
            <button :class="{ active: runView === 'timeline' }" @click="runView = 'timeline'">
              时间轴
            </button>
          </div>
          <button class="quiet"><SlidersHorizontal />筛选</button>
        </div>
        <nav v-if="runView === 'list'" class="filters">
          <button
            v-for="filter in filters"
            :key="filter.id"
            :class="{ active: activeFilter === filter.id }"
            @click="activeFilter = filter.id"
          >
            {{ filter.label }} <span>{{ count(filter.id) }}</span>
          </button>
        </nav>
        <div v-if="runView === 'list'" class="run-list" @mouseleave="executionHovered = null">
          <div v-if="executionHovered === 11 || executionHovered === 13" class="run-dependency">
            <i /><span>⌄</span>
          </div>
          <article
            v-for="task in visibleTasks"
            :key="task.id"
            class="task-card run-card"
            :class="`status-${task.status}`"
            @mouseenter="executionHovered = task.id"
            @click="openTask(task)"
          >
            <div class="status-mark" />
            <div class="task-main">
              <div class="task-line">
                <strong>{{ task.title }}</strong
                ><span class="status-pill" :data-status="task.status">{{
                  statusLabel(task.status)
                }}</span>
              </div>
              <p>{{ task.summary }}</p>
              <div class="task-meta">
                <span class="project-badge"><FolderGit2 />{{ task.project }}</span>
                <span class="agent-badge"
                  ><i>{{ avatarInitial(task.agent) }}</i
                  >{{ task.agent }}</span
                >
                ><span v-if="task.dependencies.length"
                  ><Link2 />等待 {{ task.dependencies.length }} 项</span
                >
              </div>
            </div>
          </article>
        </div>
        <div v-else class="execution-timeline">
          <article v-for="(task, index) in execution" :key="task.id" @click="openTask(task)">
            <div class="time">
              <strong>{{ ["14:32", "13:10", "11:08", "09:45"][index] }}</strong
              ><span>今天</span>
            </div>
            <div class="rail"><i :data-status="task.status" /></div>
            <div class="event">
              <span class="status-pill" :data-status="task.status">{{
                statusLabel(task.status)
              }}</span
              ><strong>{{ task.title }}</strong>
              <p>{{ task.summary }}</p>
              <footer>
                <span class="project-badge"><FolderGit2 />{{ task.project }}</span
                ><span class="agent-badge"
                  ><i>{{ avatarInitial(task.agent) }}</i
                  >{{ task.agent }}</span
                >
              </footer>
            </div>
          </article>
        </div>
      </section>
    </main>
    <div v-if="selected" class="task-popover" @click.self="selected = null">
      <section>
        <button class="close" @click="selected = null"><X /></button
        ><small>Task {{ selected.id }}</small>
        <h3>{{ selected.title }}</h3>
        <p>{{ selected.detail }}</p>
        <dl>
          <div>
            <dt>项目</dt>
            <dd>{{ selected.project }}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{{ selected.agent }}</dd>
          </div>
          <div>
            <dt>依赖</dt>
            <dd>{{ dependencyNames(selected) }}</dd>
          </div>
          <div>
            <dt>被依赖</dt>
            <dd>{{ dependentNames(selected) }}</dd>
          </div>
        </dl>
        <button
          v-if="selected.sessionId"
          class="primary wide"
          @click="emit('open-session', selected.sessionId)"
        >
          打开 Session
        </button>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Bot,
  ChevronRight,
  FolderGit2,
  History,
  Link2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-vue-next";
import TodoSequenceDiagram from "@/components/home/TodoSequenceDiagram.vue";
type Status = "pending" | "running" | "blocked" | "done";
interface MockTask {
  id: number;
  title: string;
  summary: string;
  detail: string;
  project: string;
  agent: string;
  dependencies: number[];
  status: Status;
  sessionId?: string;
}
const emit = defineEmits<{ "open-session": [sessionId: string] }>();
const goal = ref("优化 Supervisor 的 Todo，让规划、依赖和执行状态更清晰");
const planning = ref(false);
const autoExecute = ref(true);
const mobileTab = ref<"plan" | "run">("plan");
const hovered = ref<number | null>(null);
const executionHovered = ref<number | null>(null);
const selected = ref<MockTask | null>(null);
const activeFilter = ref("all");
const runView = ref<"list" | "timeline">("list");
const drafts = ref<MockTask[]>([
  {
    id: 1,
    title: "梳理 Todo 数据模型",
    summary: "确认任务字段、状态和迁移策略",
    detail: "检查现有 Todo 的存储与调度逻辑，整理单表任务模型及兼容迁移方案。",
    project: "supervisor",
    agent: "Codex",
    dependencies: [],
    status: "pending",
  },
  {
    id: 2,
    title: "重构任务接口",
    summary: "实现规划确认、依赖调度与手动启动",
    detail: "调整 HTTP API 和调度器，支持草稿确认、批次执行和可关闭的自动调度。",
    project: "supervisor",
    agent: "Codex",
    dependencies: [],
    status: "pending",
  },
  {
    id: 3,
    title: "重做 Todo 交互",
    summary: "实现 PC 双栏与移动端双标签",
    detail: "实现规划区、执行区、任务详情与依赖关系的双向高亮。",
    project: "supervisor-web-ui",
    agent: "Claude Code",
    dependencies: [1],
    status: "pending",
  },
  {
    id: 4,
    title: "联调与响应式验证",
    summary: "覆盖 PC、手机和依赖执行顺序",
    detail: "连接真实接口并验证任务状态同步、Session 跳转及窄屏体验。",
    project: "supervisor-web-ui",
    agent: "Codex",
    dependencies: [2],
    status: "pending",
  },
  {
    id: 5,
    title: "联调与验证",
    summary: "等待接口和界面任务完成后统一验证",
    detail: "连接接口与界面，验证依赖调度、Session 跳转和响应式布局。",
    project: "supervisor-web-ui",
    agent: "Codex",
    dependencies: [3, 4],
    status: "pending",
  },
]);
const execution = ref<MockTask[]>([
  {
    id: 11,
    title: "统一助手模型设置",
    summary: "清理按功能拆分的旧模型配置",
    detail: "设置页只保留 featureModels.assistant，并完成旧配置兼容。",
    project: "supervisor-web-ui",
    agent: "Codex",
    dependencies: [],
    status: "running",
    sessionId: "128",
  },
  {
    id: 12,
    title: "Watson Runner 日志",
    summary: "在 Agent 详情中展示内部运行日志",
    detail: "读取 agent home logs 并按时间倒序展示。",
    project: "supervisor",
    agent: "Codex",
    dependencies: [],
    status: "done",
    sessionId: "123",
  },
  {
    id: 13,
    title: "移动端 Session 详情",
    summary: "等待助手模型设置完成",
    detail: "调整移动端详情页信息密度和主要操作位置。",
    project: "supervisor-web-ui",
    agent: "Claude Code",
    dependencies: [11],
    status: "pending",
  },
  {
    id: 14,
    title: "项目脚本启动异常",
    summary: "缺少可用执行 Agent",
    detail: "项目脚本已创建，但当前没有配置可用于该项目的 Agent。",
    project: "supervisor",
    agent: "未分配",
    dependencies: [],
    status: "blocked",
  },
]);
const draftLevels = computed(() => {
  const depth = new Map<number, number>();
  const visit = (task: MockTask): number => {
    const cached = depth.get(task.id);
    if (cached !== undefined) return cached;
    const value = task.dependencies.reduce((max, id) => {
      const dependency = drafts.value.find((item) => item.id === id);
      return dependency ? Math.max(max, visit(dependency) + 1) : max;
    }, 0);
    depth.set(task.id, value);
    return value;
  };
  const levels: MockTask[][] = [];
  for (const task of drafts.value) (levels[visit(task)] ??= []).push(task);
  return levels;
});
const filters = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待办" },
  { id: "running", label: "进行中" },
  { id: "blocked", label: "阻塞" },
  { id: "done", label: "已完成" },
];
const visibleTasks = computed(() =>
  activeFilter.value === "all"
    ? execution.value
    : execution.value.filter((t) => t.status === activeFilter.value),
);
const runningCount = computed(() => execution.value.filter((t) => t.status === "running").length);
function count(id: string) {
  return id === "all"
    ? execution.value.length
    : execution.value.filter((t) => t.status === id).length;
}
function avatarInitial(agent: string) {
  return agent === "Claude Code" ? "C" : agent === "Codex" ? "X" : "?";
}
function statusLabel(s: Status) {
  return { pending: "待办", running: "进行中", blocked: "阻塞", done: "已完成" }[s];
}
function allTasks() {
  return [...drafts.value, ...execution.value];
}
function relationClass(id: number) {
  if (!hovered.value) return "";
  if (id === hovered.value) return "is-current";
  const current = allTasks().find((t) => t.id === hovered.value);
  if (current?.dependencies.includes(id)) return "is-dependency";
  if (
    allTasks()
      .find((t) => t.id === id)
      ?.dependencies.includes(hovered.value)
  )
    return "is-dependent";
  return "is-dim";
}
function dependencyNames(t: MockTask) {
  return (
    t.dependencies
      .map((id) => allTasks().find((x) => x.id === id)?.title)
      .filter(Boolean)
      .join("、") || "无"
  );
}
function dependentNames(t: MockTask) {
  return (
    allTasks()
      .filter((x) => x.dependencies.includes(t.id))
      .map((x) => x.title)
      .join("、") || "无"
  );
}
function openTask(t: MockTask) {
  if (t.sessionId) emit("open-session", t.sessionId);
  else selected.value = t;
}
function selectDraft(id: number) {
  selected.value = drafts.value.find((task) => task.id === id) ?? null;
}
function addDraft() {
  selected.value = {
    id: drafts.value.length + 1,
    title: "新任务",
    summary: "填写任务说明",
    detail: "",
    project: "请选择项目",
    agent: "默认 Agent",
    dependencies: [],
    status: "pending",
  };
}
function mockPlan() {
  planning.value = true;
  setTimeout(() => (planning.value = false), 700);
}
</script>
<style scoped>
.todo-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}
.todo-head {
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid var(--app-border);
}
.todo-head h1 {
  font-size: 17px;
  font-weight: 680;
}
.todo-stage {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.plan-pane,
.run-pane {
  min-width: 0;
  overflow: auto;
  padding: 18px;
}
.plan-pane {
  border-right: 1px solid var(--app-border);
}
.pane-title,
.draft-head,
.goal-box__footer,
.plan-actions,
.task-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.pane-title {
  margin-bottom: 14px;
}
.pane-title h2 {
  font-size: 15px;
  font-weight: 650;
}
.pane-title span,
.draft-head span {
  color: var(--app-text-muted);
  font-size: 11px;
}
.quiet,
.primary,
.secondary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 11px;
}
.quiet {
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
.primary {
  color: #fff;
  background: #07c160;
}
.secondary {
  color: var(--app-text-primary);
  background: var(--app-hover);
}
button svg,
.task-meta svg {
  width: 13px;
  height: 13px;
}
.goal-box {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 11px;
  background: var(--app-settings-card);
}
.goal-box textarea {
  width: 100%;
  resize: none;
  background: transparent;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
}
.goal-box__footer {
  margin-top: 8px;
}
.project-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #078f49;
  font-size: 10px;
}
.draft-head {
  margin: 18px 0 8px;
}
.draft-head > div {
  display: flex;
  gap: 7px;
}
.dependency-list,
.run-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.run-dependency {
  position: absolute;
  z-index: 2;
  left: 8px;
  top: 64px;
  width: 18px;
  height: 205px;
  pointer-events: none;
}
.run-dependency i {
  position: absolute;
  inset: 0 6px 8px 0;
  border-left: 1.5px solid #8290a3;
  border-bottom: 1.5px solid #8290a3;
  border-radius: 0 0 0 8px;
}
.run-dependency span {
  position: absolute;
  right: 0;
  bottom: 0;
  display: grid;
  width: 15px;
  height: 15px;
  place-items: center;
  border-radius: 50%;
  background: var(--app-settings-bg);
  color: #8290a3;
  font-size: 12px;
  line-height: 1;
}
.run-list .task-card {
  position: relative;
  z-index: 1;
}
.task-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 9px;
  background: var(--app-settings-card);
  transition: 0.16s;
  cursor: pointer;
}
.task-card:hover,
.is-current {
  border-color: #07c160;
  box-shadow: 0 3px 12px rgb(0 0 0/7%);
}
.is-dependency {
  border-color: #3b82f6;
  background: color-mix(in srgb, #3b82f6 7%, var(--app-settings-card));
}
.is-dependent {
  border-color: #10b981;
  background: color-mix(in srgb, #10b981 7%, var(--app-settings-card));
}
.is-dim {
  opacity: 0.4;
}
.step {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 50%;
  background: var(--app-hover);
  font-size: 10px;
}
.task-main {
  min-width: 0;
  flex: 1;
}
.task-main strong {
  font-size: 12px;
}
.task-main p {
  margin: 3px 0 7px;
  color: var(--app-text-muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.task-meta span {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--app-text-secondary);
  font-size: 9px;
}
.project-badge {
  padding: 3px 6px;
  border-radius: 5px;
  background: color-mix(in srgb, #3b82f6 10%, transparent);
  color: #2870bd !important;
}
.agent-badge i {
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border-radius: 50%;
  background: #24292f;
  color: white;
  font-size: 8px;
  font-style: normal;
  font-weight: 700;
}
.status-pill {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10px !important;
  font-weight: 650;
  background: var(--app-hover);
}
.status-pill[data-status="running"] {
  color: #1769aa !important;
  background: #e7f2ff;
}
.status-pill[data-status="blocked"] {
  color: #b42318 !important;
  background: #feeceb;
}
.status-pill[data-status="done"] {
  color: #078548 !important;
  background: #e5f7ed;
}
.status-pill[data-status="pending"] {
  color: #765b14 !important;
  background: #fff5d8;
}
.todo-timeline {
  margin-top: 14px;
  padding: 11px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 9px;
  background: var(--app-settings-card);
}
.todo-timeline header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 9px;
}
.todo-timeline header strong {
  font-size: 11px;
}
.todo-timeline header span {
  color: var(--app-text-muted);
  font-size: 9px;
}
.timeline-grid {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  padding: 2px 0 5px;
}
.timeline-level {
  position: relative;
  display: flex;
  min-width: 120px;
  flex-direction: column;
  gap: 5px;
}
.timeline-level > b {
  color: var(--app-text-muted);
  font-size: 9px;
  font-weight: 500;
}
.timeline-level button {
  display: grid;
  gap: 2px;
  padding: 7px 8px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 6px;
  text-align: left;
  background: var(--app-settings-bg);
}
.timeline-level button span {
  font-size: 10px;
  color: var(--app-text-primary);
}
.timeline-level button small {
  font-size: 8px;
  color: var(--app-text-muted);
}
.timeline-arrow {
  position: absolute;
  right: -17px;
  top: 50%;
  width: 14px;
  color: var(--app-text-muted);
}
.icon-btn {
  color: var(--app-text-muted);
}
.plan-actions {
  position: sticky;
  bottom: -18px;
  margin: 16px -18px -18px;
  padding: 12px 18px;
  border-top: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-settings-bg) 92%, transparent);
  backdrop-filter: blur(10px);
}
.plan-actions {
  justify-content: flex-end;
}
.plan-actions > div {
  display: flex;
  gap: 7px;
}
.auto-switch {
  display: none;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--app-text-secondary);
  font-size: 10px;
}
.auto-switch input {
  accent-color: #07c160;
}
.filters {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  overflow: auto;
}
.view-switch {
  display: flex;
  gap: 3px;
  width: max-content;
  margin: 0 0 9px auto;
  padding: 3px;
  border-radius: 7px;
  background: var(--app-hover);
}
.run-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  margin-bottom: 9px;
}
.run-toolbar .view-switch {
  margin: 0;
}
.run-toolbar .quiet {
  padding: 6px 9px;
}
.view-switch button {
  padding: 5px 9px;
  border-radius: 5px;
  color: var(--app-text-muted);
  font-size: 10px;
}
.view-switch button.active {
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  box-shadow: 0 1px 3px rgb(0 0 0/8%);
}
.execution-timeline {
  padding: 4px 4px 20px;
}
.execution-timeline article {
  display: grid;
  grid-template-columns: 48px 24px 1fr;
  min-height: 105px;
  cursor: pointer;
}
.execution-timeline .time {
  display: grid;
  align-content: start;
  gap: 2px;
  padding-top: 4px;
  text-align: right;
}
.execution-timeline .time strong {
  font-size: 10px;
}
.execution-timeline .time span {
  color: var(--app-text-muted);
  font-size: 8px;
}
.execution-timeline .rail {
  position: relative;
}
.execution-timeline .rail:after {
  content: "";
  position: absolute;
  left: 12px;
  top: 18px;
  bottom: -8px;
  width: 1px;
  background: var(--app-border);
}
.execution-timeline article:last-child .rail:after {
  display: none;
}
.execution-timeline .rail i {
  position: absolute;
  z-index: 1;
  left: 7px;
  top: 5px;
  width: 11px;
  height: 11px;
  border: 3px solid var(--app-settings-bg);
  border-radius: 50%;
  background: #9ca3af;
}
.execution-timeline .rail i[data-status="running"] {
  background: #3b82f6;
}
.execution-timeline .rail i[data-status="blocked"] {
  background: #ef4444;
}
.execution-timeline .rail i[data-status="done"] {
  background: #07c160;
}
.execution-timeline .event {
  margin-left: 5px;
  padding: 10px 11px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  background: var(--app-settings-card);
}
.execution-timeline .event > strong {
  display: block;
  margin: 7px 0 3px;
  font-size: 12px;
}
.execution-timeline .event > p {
  color: var(--app-text-muted);
  font-size: 10px;
}
.execution-timeline footer {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.execution-timeline footer span {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 8px;
}
.filters button {
  flex: none;
  padding: 5px 9px;
  border-radius: 6px;
  color: var(--app-text-muted);
  font-size: 10px;
}
.filters button.active {
  color: #078f49;
  background: color-mix(in srgb, #07c160 11%, transparent);
}
.filters span {
  margin-left: 3px;
}
.status-mark {
  width: 3px;
  align-self: stretch;
  border-radius: 4px;
  background: #9ca3af;
}
.status-running .status-mark {
  background: #3b82f6;
}
.status-running {
  border-color: color-mix(in srgb, #3b82f6 30%, var(--app-border));
}
.status-blocked .status-mark {
  background: #ef4444;
}
.status-blocked {
  border-color: color-mix(in srgb, #ef4444 32%, var(--app-border));
}
.status-done .status-mark {
  background: #07c160;
}
.status-done {
  border-color: color-mix(in srgb, #07c160 25%, var(--app-border));
}
.task-line > span {
  font-size: 9px;
  color: var(--app-text-muted);
}
.run-card > svg {
  align-self: center;
  width: 15px;
  color: var(--app-text-muted);
}
.mobile-tabs {
  display: none;
}
.task-popover {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(0 0 0/28%);
}
.task-popover section {
  position: relative;
  width: min(430px, calc(100vw - 24px));
  padding: 20px;
  border-radius: 13px;
  background: var(--app-settings-card);
  box-shadow: 0 18px 55px rgb(0 0 0/22%);
}
.task-popover h3 {
  margin: 4px 0 8px;
  font-size: 16px;
}
.task-popover p {
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.task-popover small {
  color: var(--app-text-muted);
}
.task-popover dl {
  margin: 14px 0;
}
.task-popover dl div {
  display: grid;
  grid-template-columns: 60px 1fr;
  padding: 6px 0;
  border-top: 1px solid var(--app-border-subtle);
  font-size: 11px;
}
.task-popover dt {
  color: var(--app-text-muted);
}
.close {
  position: absolute;
  right: 12px;
  top: 12px;
}
.close svg {
  width: 16px;
}
.wide {
  justify-content: center;
  width: 100%;
}
@media (max-width: 720px) {
  .todo-head {
    height: 48px;
    padding: 0 12px;
  }
  .todo-head h1 {
    display: none;
  }
  .mobile-tabs {
    display: grid;
    width: 100%;
    grid-template-columns: 1fr 1fr;
    padding: 3px;
    border-radius: 8px;
    background: var(--app-hover);
  }
  .mobile-tabs button {
    padding: 6px;
    border-radius: 6px;
    font-size: 12px;
    color: var(--app-text-muted);
  }
  .mobile-tabs button.active {
    background: var(--app-settings-card);
    color: var(--app-text-primary);
    box-shadow: 0 1px 3px rgb(0 0 0/8%);
  }
  .todo-stage {
    display: block;
  }
  .plan-pane,
  .run-pane {
    height: 100%;
    padding: 12px;
    border: 0;
  }
  .mobile-hidden {
    display: none;
  }
  .plan-actions {
    bottom: -12px;
    margin: 14px -12px -12px;
    padding: 10px 12px;
    align-items: flex-end;
  }
  .auto-switch {
    max-width: 90px;
  }
  .task-main p {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .pane-title {
    margin-bottom: 10px;
  }
}
</style>
