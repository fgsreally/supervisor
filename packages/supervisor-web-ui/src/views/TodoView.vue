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
      <section
        class="plan-pane"
        :class="{
          'mobile-hidden': mobileTab !== 'plan',
          'plan-pane--ready': drafts.length > 0,
        }"
      >
        <div class="pane-title plan-desktop-only">
          <div>
            <h2>规划</h2>
            <span>把想法整理成可执行的任务</span>
          </div>
          <button class="quiet" @click="openGoalHistory"><History />历史</button>
        </div>

        <div class="plan-mobile-toolbar">
          <div>
            <strong>{{ planMobileTitle }}</strong>
            <span>{{ planMobileSubtitle }}</span>
          </div>
          <button
            type="button"
            class="plan-icon-btn"
            title="规划历史"
            aria-label="规划历史"
            @click="openGoalHistory"
          >
            <History />
          </button>
        </div>

        <div class="goal-box" :class="{ 'goal-box--summary': showGoalSummary }">
          <button
            v-if="showGoalSummary"
            type="button"
            class="goal-summary"
            @click="goalComposerOpen = true"
          >
            <span class="goal-summary__label">当前目标</span>
            <strong>{{ goal }}</strong>
            <span class="goal-summary__hint">点击修改并重新规划</span>
          </button>
          <template v-else>
            <textarea v-model="goal" rows="5" placeholder="描述你想完成的事情，输入 @ 关联项目" />
            <div class="goal-box__footer">
              <span class="project-pill"><FolderGit2 />supervisor-web-ui</span>
              <button class="primary" :disabled="planning" @click="mockPlan">
                <Sparkles />{{ planning ? "正在整理…" : "开始规划" }}
              </button>
            </div>
            <button
              v-if="drafts.length"
              type="button"
              class="goal-box__collapse plan-mobile-only"
              @click="goalComposerOpen = false"
            >
              收起
            </button>
          </template>
        </div>

        <div class="draft-head plan-desktop-only">
          <div>
            <strong>当前任务</strong><span>{{ drafts.length }}</span>
          </div>
        </div>
        <TodoSequenceDiagram class="plan-desktop-only" :agents="agents" @select="selectDraft" />

        <div v-if="drafts.length" class="mobile-plan-list" aria-label="规划任务列表">
          <div class="mobile-plan-section-label">待确认任务 · {{ drafts.length }}</div>
          <div class="mobile-plan-group">
            <button
              v-for="(task, index) in drafts"
              :key="task.id"
              type="button"
              class="mobile-plan-row"
              @click="selected = task"
            >
              <span class="mobile-plan-row__index">{{ index + 1 }}</span>
              <div class="mobile-plan-row__body">
                <strong>{{ task.title }}</strong>
                <p>{{ task.description }}</p>
                <small
                  >{{ task.project }} · {{ task.agent
                  }}<template v-if="task.dependencies.length">
                    · 依赖 {{ task.dependencies.length }} 项</template
                  ></small
                >
              </div>
              <ChevronRight class="mobile-plan-row__arrow" />
            </button>
          </div>
        </div>

        <div v-if="drafts.length" class="plan-actions">
          <button type="button" class="plan-actions__secondary">仅加入待办</button>
          <button type="button" class="primary plan-actions__main" @click="startPlanExecution">
            开始执行
          </button>
        </div>
      </section>
      <section class="run-pane" :class="{ 'mobile-hidden': mobileTab !== 'run' }">
        <div class="pane-title">
          <div>
            <h2>执行</h2>
            <span>{{ runningCount }} 个任务正在进行</span>
          </div>
          <div class="view-switch" aria-label="执行视图">
            <button
              :class="{ active: runView === 'list' }"
              title="列表"
              aria-label="列表"
              @click="runView = 'list'"
            >
              <List />
            </button>
            <button
              :class="{ active: runView === 'timeline' }"
              title="时间轴"
              aria-label="时间轴"
              @click="runView = 'timeline'"
            >
              <GanttChart />
            </button>
          </div>
        </div>
        <div class="run-controls">
          <nav v-if="runView === 'list'" class="filters" aria-label="任务状态筛选">
            <button
              v-for="filter in filters"
              :key="filter.id"
              :class="{ active: activeFilter === filter.id }"
              @click="activeFilter = filter.id"
            >
              {{ filter.label }} <span>{{ count(filter.id) }}</span>
            </button>
          </nav>
        </div>
        <div v-if="runView === 'list'" class="run-list">
          <TaskCard
            v-for="task in visibleTasks"
            :key="task.id"
            class="run-card"
            :class="`status-${task.status}`"
            :title="task.title"
            :description="task.description"
            :project-name="task.project"
            :agent-id="agentInfo(task.agent)?.id ?? task.agent"
            :agent-name="task.agent"
            :agent-avatar="agentInfo(task.agent)?.avatar"
            :status="task.status"
            :status-label="statusLabel(task.status)"
            :accent="task.status"
            interactive
            @select="openTask(task)"
          >
            <template v-if="task.dependencies.length" #meta>
              <span><Link2 />等待 {{ task.dependencies.length }} 项</span>
            </template>
          </TaskCard>
        </div>
        <div v-else class="execution-timeline">
          <article v-for="(task, index) in execution" :key="task.id" @click="openTask(task)">
            <div class="time">
              <strong>{{ taskEventTime(task.id, index) }}</strong
              ><span>今天</span>
            </div>
            <div class="rail"><i :data-status="task.status" /></div>
            <div class="event">
              <TaskCard
                :title="task.title"
                :description="task.description"
                :project-name="task.project"
                :agent-id="agentInfo(task.agent)?.id ?? task.agent"
                :agent-name="task.agent"
                :agent-avatar="agentInfo(task.agent)?.avatar"
                :status="task.status"
                :status-label="statusLabel(task.status)"
                density="compact"
              />
            </div>
          </article>
        </div>
      </section>
    </main>
    <ResponsiveDialog :open="selected != null" @close="selected = null">
      <div v-if="selected" class="task-detail">
        <small>Task {{ selected.id }}</small>
        <h3>{{ selected.title }}</h3>
        <p>{{ selected.description }}</p>
        <dl>
          <div>
            <dt>项目</dt>
            <dd>{{ selected.project }}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{{ selected.agent }}</dd>
          </div>
        </dl>
        <TaskDependencyGraph
          :key="selected.id"
          :current="selected"
          :dependencies="selectedDependencies"
          :dependents="selectedDependents"
          @select="selectTask"
        />
        <button
          v-if="selected.sessionId"
          class="primary wide"
          @click="viewSession(selected.sessionId)"
        >
          <Eye />查看
        </button>
      </div>
    </ResponsiveDialog>
    <ResponsiveDialog :open="goalHistoryOpen" title="规划历史" @close="goalHistoryOpen = false">
      <div class="goal-history">
        <article v-for="event in goalEvents" :key="event.id">
          <time>{{ formatGoalTime(event.createdAt) }}</time>
          <strong>{{ goalObjective(event) }}</strong>
        </article>
        <p v-if="!goalEvents.length" class="goal-history__empty">暂无规划历史</p>
      </div>
    </ResponsiveDialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  GanttChart,
  ChevronRight,
  Eye,
  FolderGit2,
  History,
  Link2,
  List,
  Sparkles,
} from "lucide-vue-next";
import TodoSequenceDiagram from "@/components/home/TodoSequenceDiagram.vue";
import TaskCard from "@/components/task/TaskCard.vue";
import TaskDependencyGraph from "@/components/task/TaskDependencyGraph.vue";
import ResponsiveDialog from "@/components/ui/ResponsiveDialog.vue";
import {
  listAgents,
  listTimelineEvents,
  recordGoalEvent,
  type Agent,
  type TimelineEvent,
} from "@/api";
type Status = "pending" | "running" | "blocked" | "done";
interface MockTask {
  id: number;
  title: string;
  description: string;
  project: string;
  agent: string;
  dependencies: number[];
  status: Status;
  sessionId?: string;
}
const emit = defineEmits<{ "open-session": [sessionId: string] }>();
const goal = ref("优化 Supervisor 的 Todo，让规划、依赖和执行状态更清晰");
const planning = ref(false);
const goalComposerOpen = ref(false);
const isNarrowUi = ref(false);
const mobileTab = ref<"plan" | "run">("plan");
const selected = ref<MockTask | null>(null);
const activeFilter = ref("all");
const runView = ref<"list" | "timeline">("list");
const agents = ref<Agent[]>([]);
const taskEvents = ref<TimelineEvent[]>([]);
const goalEvents = ref<TimelineEvent[]>([]);
const goalHistoryOpen = ref(false);
const drafts = ref<MockTask[]>([
  {
    id: 1,
    title: "梳理 Todo 数据模型",
    description: "检查现有 Todo 的存储与调度逻辑，整理单表任务模型及兼容迁移方案。",
    project: "supervisor",
    agent: "Codex",
    dependencies: [],
    status: "pending",
  },
  {
    id: 2,
    title: "重构任务接口",
    description: "调整 HTTP API 和调度器，支持草稿确认、批次执行和可关闭的自动调度。",
    project: "supervisor",
    agent: "Codex",
    dependencies: [],
    status: "pending",
  },
  {
    id: 3,
    title: "重做 Todo 交互",
    description: "实现规划区、执行区、任务详情与依赖关系的双向高亮。",
    project: "supervisor-web-ui",
    agent: "Claude Code",
    dependencies: [1],
    status: "pending",
  },
  {
    id: 4,
    title: "联调与响应式验证",
    description: "连接真实接口并验证任务状态同步、Session 跳转及窄屏体验。",
    project: "supervisor-web-ui",
    agent: "Codex",
    dependencies: [2],
    status: "pending",
  },
  {
    id: 5,
    title: "联调与验证",
    description: "连接接口与界面，验证依赖调度、Session 跳转和响应式布局。",
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
    description: "设置页只保留 featureModels.assistant，并完成旧配置兼容。",
    project: "supervisor-web-ui",
    agent: "Codex",
    dependencies: [],
    status: "running",
    sessionId: "128",
  },
  {
    id: 12,
    title: "Watson Runner 日志",
    description: "读取 agent home logs 并按时间倒序展示。",
    project: "supervisor",
    agent: "Codex",
    dependencies: [],
    status: "done",
    sessionId: "123",
  },
  {
    id: 13,
    title: "移动端 Session 详情",
    description: "调整移动端详情页信息密度和主要操作位置。",
    project: "supervisor-web-ui",
    agent: "Claude Code",
    dependencies: [11],
    status: "pending",
  },
  {
    id: 14,
    title: "项目脚本启动异常",
    description: "项目脚本已创建，但当前没有配置可用于该项目的 Agent。",
    project: "supervisor",
    agent: "未分配",
    dependencies: [],
    status: "blocked",
  },
  {
    id: 15,
    title: "迁移旧版模型配置",
    description: "把历史功能模型配置归并到统一助手模型，并保留安全回退。",
    project: "supervisor",
    agent: "Codex",
    dependencies: [11, 12],
    status: "pending",
  },
  {
    id: 16,
    title: "补充设置页回归测试",
    description: "覆盖模型读取、保存、旧配置迁移与异常提示。",
    project: "supervisor-web-ui",
    agent: "Claude Code",
    dependencies: [15],
    status: "pending",
  },
  {
    id: 17,
    title: "联调移动端任务详情",
    description: "验证详情弹层、Session 跳转与依赖任务切换。",
    project: "supervisor-web-ui",
    agent: "Codex",
    dependencies: [13, 15],
    status: "running",
    sessionId: "136",
  },
  {
    id: 18,
    title: "发布前验收",
    description: "汇总设置、日志与移动端改动，完成发布检查。",
    project: "supervisor-web-ui",
    agent: "Codex",
    dependencies: [14, 16, 17],
    status: "pending",
  },
]);
const selectedDependencies = computed(() =>
  selected.value ? allTasks().filter((task) => selected.value?.dependencies.includes(task.id)) : [],
);
const selectedDependents = computed(() =>
  selected.value ? allTasks().filter((task) => task.dependencies.includes(selected.value!.id)) : [],
);
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
const showGoalSummary = computed(
  () => isNarrowUi.value && drafts.value.length > 0 && !goalComposerOpen.value && !planning.value,
);
const planMobileTitle = computed(() => (drafts.value.length ? "确认规划" : "新建规划"));
const planMobileSubtitle = computed(() =>
  drafts.value.length ? `${drafts.value.length} 个任务待确认` : "写清目标，华生会拆成可执行任务",
);
function count(id: string) {
  return id === "all"
    ? execution.value.length
    : execution.value.filter((t) => t.status === id).length;
}
function taskEventTime(taskId: number, index: number) {
  const event = [...taskEvents.value].reverse().find((item) => Number(item.entityId) === taskId);
  if (event) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(event.createdAt));
  }
  return ["14:32", "13:10", "11:08", "09:45", "09:18", "08:52", "08:26", "07:40"][index];
}
function agentInfo(name: string): Agent | undefined {
  return agents.value.find((agent) => agent.name === name);
}
function statusLabel(s: Status) {
  return { pending: "待办", running: "进行中", blocked: "阻塞", done: "已完成" }[s];
}
function allTasks() {
  return [...drafts.value, ...execution.value];
}
function openTask(t: MockTask) {
  selected.value = t;
}
function selectDraft(id: number) {
  selected.value = drafts.value.find((task) => task.id === id) ?? null;
}
function selectTask(id: number) {
  selected.value = allTasks().find((task) => task.id === id) ?? selected.value;
}
function viewSession(sessionId: string) {
  selected.value = null;
  emit("open-session", sessionId);
}
async function mockPlan() {
  const objective = goal.value.trim();
  if (!objective) return;
  planning.value = true;
  goalComposerOpen.value = true;
  try {
    await recordGoalEvent({ objective, source: "mobile-todo-plan" });
    goalEvents.value = await listTimelineEvents({ type: "goal" }).catch(() => goalEvents.value);
  } finally {
    setTimeout(() => {
      planning.value = false;
      goalComposerOpen.value = false;
    }, 400);
  }
}
function startPlanExecution() {
  if (!drafts.value.length) return;
  mobileTab.value = "run";
}
async function openGoalHistory() {
  goalEvents.value = await listTimelineEvents({ type: "goal" }).catch(() => []);
  goalHistoryOpen.value = true;
}
function goalObjective(event: TimelineEvent) {
  return typeof event.data.objective === "string" ? event.data.objective : "未命名规划";
}
function formatGoalTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
onMounted(async () => {
  const media = window.matchMedia("(max-width: 720px)");
  const syncNarrow = () => {
    isNarrowUi.value = media.matches;
  };
  syncNarrow();
  media.addEventListener("change", syncNarrow);

  const [nextAgents, nextEvents, nextGoalEvents] = await Promise.all([
    listAgents().catch(() => []),
    listTimelineEvents({ type: "todo_task" }).catch(() => []),
    listTimelineEvents({ type: "goal" }).catch(() => []),
  ]);
  agents.value = nextAgents;
  taskEvents.value = nextEvents;
  goalEvents.value = nextGoalEvents;
});
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
  font-size: 1.0625rem;
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
  font-size: 1rem;
  font-weight: 650;
}
.pane-title span,
.draft-head span {
  color: var(--app-text-secondary);
  font-size: 0.75rem;
}
.quiet,
.primary,
.secondary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 0.8125rem;
}
.quiet {
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
.primary {
  color: #fff;
  background: #07c160;
}
.primary:disabled {
  opacity: 0.55;
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
  font-size: 0.875rem;
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
  font-size: 0.75rem;
}
.draft-head {
  margin: 18px 0 8px;
}
.draft-head > div {
  display: flex;
  gap: 7px;
  align-items: baseline;
}
.draft-head strong {
  font-size: 0.875rem;
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
  color: var(--app-text-body);
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
  justify-content: flex-end;
  gap: 8px;
  margin: 16px -18px -18px;
  padding: 12px 18px;
  border-top: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-settings-bg) 92%, transparent);
  backdrop-filter: blur(10px);
}
.plan-actions__secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 7px 12px;
  border-radius: 7px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
  font-size: 0.8125rem;
}
.plan-actions__main {
  min-width: 108px;
  justify-content: center;
}
.plan-mobile-toolbar,
.plan-mobile-only,
.goal-summary,
.goal-box__collapse {
  display: none;
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
  font-size: 0.75rem;
}
.view-switch button.active {
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  box-shadow: 0 1px 3px rgb(0 0 0/8%);
}
.execution-timeline {
  padding: 4px 4px 20px;
}
.execution-timeline > article {
  display: grid;
  grid-template-columns: 48px 24px minmax(0, 1fr);
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
  font-size: 0.75rem;
}
.execution-timeline .time span {
  color: var(--app-text-secondary);
  font-size: 0.6875rem;
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
.execution-timeline > article:last-child .rail:after {
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
  min-width: 0;
  margin-left: 5px;
  padding: 10px 11px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  background: var(--app-settings-card);
}
.execution-timeline .event :deep(.task-card-ui),
.execution-timeline .event :deep(.task-card-ui__body),
.execution-timeline .event :deep(.task-card-ui__heading) {
  width: 100%;
}
.execution-timeline .event > strong {
  display: block;
  margin: 7px 0 3px;
  font-size: 12px;
}
.execution-timeline .event > p {
  color: var(--app-text-body);
  font-size: 0.8125rem;
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
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--app-text-secondary);
  font-size: 0.8125rem;
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
.run-card :deep(.task-card-ui__meta > span) {
  font-size: 0.75rem;
}
.run-card > svg {
  align-self: center;
  width: 15px;
  color: var(--app-text-muted);
}
.mobile-tabs {
  display: none;
}
.mobile-plan-list {
  display: none;
}
.task-detail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 4px 4px 8px;
  gap: 2px;
}
.task-detail h3 {
  margin: 4px 0 8px;
  font-size: 16px;
}
.task-detail p {
  color: var(--app-text-body);
  font-size: 12px;
  line-height: 1.6;
}
.task-detail small {
  color: var(--app-text-muted);
}
.task-detail dl {
  margin: 14px 0;
}
.task-detail dl div {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  padding: 6px 0;
  border-top: 1px solid var(--app-border-subtle);
  font-size: 11px;
}
.task-detail dt {
  color: var(--app-text-muted);
}
.task-detail :deep(.task-dependency-graph) {
  margin: 4px 0 16px;
}
.goal-history {
  display: grid;
  gap: 8px;
}
.goal-history article {
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-bg);
}
.goal-history time {
  color: var(--app-text-muted);
  font-size: 11px;
}
.goal-history strong {
  font-size: 13px;
  line-height: 1.45;
}
.goal-history__empty {
  padding: 18px 0;
  color: var(--app-text-muted);
  text-align: center;
  font-size: 13px;
}
.wide {
  justify-content: center;
  width: 100%;
}
@media (max-width: 720px) {
  .todo-shell {
    background: var(--m-page-bg, var(--app-settings-bg));
  }
  .todo-head {
    height: auto;
    padding: 8px 16px;
    background: var(--m-header-bg, var(--app-settings-bg));
  }
  .todo-head h1 {
    display: none;
  }
  .mobile-tabs {
    display: grid;
    width: 100%;
    grid-template-columns: 1fr 1fr;
    padding: 3px;
    border-radius: 9px;
    background: var(--m-pressed, var(--app-hover));
  }
  .mobile-tabs button {
    min-height: 36px;
    padding: 6px 12px;
    border-radius: 7px;
    font-size: 14px;
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
    padding: 12px 16px 24px;
    border: 0;
    overscroll-behavior: contain;
  }
  .plan-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .mobile-hidden {
    display: none;
  }
  .plan-desktop-only {
    display: none !important;
  }
  .plan-mobile-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .plan-mobile-toolbar strong {
    display: block;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
  }
  .plan-mobile-toolbar span {
    display: block;
    margin-top: 2px;
    color: var(--m-text-secondary, var(--app-text-secondary));
    font-size: 12px;
  }
  .plan-icon-btn {
    display: grid;
    width: 44px;
    height: 44px;
    flex: none;
    place-items: center;
    margin: -4px -8px 0 0;
    border-radius: 999px;
    color: var(--m-text-secondary, var(--app-text-secondary));
  }
  .plan-icon-btn:active {
    background: var(--m-pressed, var(--app-hover));
  }
  .plan-icon-btn svg {
    width: 22px;
    height: 22px;
  }
  .goal-box {
    padding: 14px;
    border: 0;
    border-radius: 12px;
    background: var(--m-surface, var(--app-settings-card));
  }
  .goal-box--summary {
    padding: 0;
    background: transparent;
  }
  .goal-box textarea {
    min-height: 104px;
    font-size: 16px;
    line-height: 1.5;
  }
  .goal-box__footer {
    align-items: flex-end;
    margin-top: 12px;
  }
  .goal-box__footer .primary {
    min-height: 40px;
    padding-inline: 14px;
    font-size: 14px;
  }
  .goal-box__collapse {
    display: block;
    width: 100%;
    margin-top: 10px;
    padding: 10px 0 2px;
    color: var(--m-link, #576b95);
    font-size: 14px;
    text-align: center;
  }
  .goal-summary {
    display: grid;
    gap: 4px;
    width: 100%;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--m-surface, var(--app-settings-card));
    text-align: left;
  }
  .goal-summary:active {
    background: var(--m-pressed, var(--app-hover));
  }
  .goal-summary__label,
  .goal-summary__hint {
    color: var(--m-text-muted, var(--app-text-muted));
    font-size: 12px;
  }
  .goal-summary strong {
    display: -webkit-box;
    overflow: hidden;
    color: var(--m-text-primary, var(--app-text-primary));
    font-size: 15px;
    font-weight: 500;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .project-pill {
    max-width: 46%;
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-plan-list {
    display: grid;
    gap: 8px;
    margin-top: 4px;
  }
  .mobile-plan-section-label {
    padding: 0 4px;
    color: var(--m-text-secondary, var(--app-text-secondary));
    font-size: 13px;
  }
  .mobile-plan-group {
    overflow: hidden;
    border-radius: 12px;
    background: var(--m-surface, var(--app-settings-card));
  }
  .mobile-plan-row {
    display: flex;
    width: 100%;
    min-height: 72px;
    align-items: center;
    gap: 12px;
    padding: 14px 12px 14px 14px;
    border-top: 1px solid var(--m-divider, var(--app-border-subtle));
    color: inherit;
    text-align: left;
  }
  .mobile-plan-row:first-child {
    border-top: 0;
  }
  .mobile-plan-row:active {
    background: var(--m-pressed, var(--app-hover));
  }
  .mobile-plan-row__index {
    display: grid;
    width: 28px;
    height: 28px;
    flex: none;
    place-items: center;
    border-radius: 8px;
    background: color-mix(in srgb, #07c160 16%, transparent);
    color: #07c160;
    font-size: 13px;
    font-weight: 600;
  }
  .mobile-plan-row__body {
    min-width: 0;
    flex: 1;
  }
  .mobile-plan-row__body strong {
    display: block;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.35;
  }
  .mobile-plan-row__body p {
    display: -webkit-box;
    margin: 4px 0 0;
    overflow: hidden;
    color: var(--m-text-body, var(--app-text-body));
    font-size: 13px;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .mobile-plan-row__body small {
    display: block;
    margin-top: 6px;
    color: var(--m-text-muted, var(--app-text-muted));
    font-size: 12px;
  }
  .mobile-plan-row__arrow {
    width: 18px;
    height: 18px;
    flex: none;
    color: var(--m-text-muted, var(--app-text-muted));
  }
  .plan-actions {
    position: sticky;
    bottom: -24px;
    z-index: 6;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    margin: 8px -16px -24px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--m-divider, var(--app-border-subtle));
    background: color-mix(in srgb, var(--m-page-bg, var(--app-settings-bg)) 92%, transparent);
    backdrop-filter: blur(14px);
  }
  .plan-actions__secondary {
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    background: transparent;
    color: var(--m-link, #576b95);
    font-size: 15px;
  }
  .plan-actions__main {
    min-height: 44px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 500;
  }
  .run-toolbar .quiet {
    min-height: 40px;
    padding-inline: 12px;
    font-size: 13px;
  }
  .pane-title {
    margin-bottom: 10px;
  }
  .run-controls {
    position: sticky;
    z-index: 4;
    top: -14px;
    margin: 0 -16px 10px;
    padding: 6px 16px 1px;
    background: color-mix(in srgb, var(--m-page-bg, var(--app-settings-bg)) 94%, transparent);
    backdrop-filter: blur(12px);
  }
  .view-switch {
    display: flex;
    width: auto;
    margin: 0;
    padding: 2px;
  }
  .view-switch button {
    display: grid;
    width: 36px;
    height: 34px;
    padding: 0;
    place-items: center;
  }
  .view-switch button svg {
    width: 18px;
    height: 18px;
  }
  .filters {
    gap: 6px;
    margin: 0;
    padding: 0 0 9px;
    scrollbar-width: none;
  }
  .filters::-webkit-scrollbar {
    display: none;
  }
  .filters button {
    min-height: 34px;
    padding: 6px 11px;
    font-size: 12px;
  }
  .run-list {
    gap: 9px;
  }
  .execution-timeline {
    padding-inline: 0;
  }
  .execution-timeline > article {
    grid-template-columns: 50px 18px minmax(0, 1fr);
    min-width: 0;
  }
  .execution-timeline .rail:after {
    left: 9px;
  }
  .execution-timeline .rail i {
    left: 4px;
  }
  .execution-timeline .event {
    min-width: 0;
    margin-left: 4px;
    padding: 0;
    border: 0;
    background: transparent;
  }
  .execution-timeline .event :deep(.task-card-ui) {
    min-width: 0;
    min-height: 0;
  }
  .execution-timeline .event :deep(.task-card-ui__heading) {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .execution-timeline .event :deep(.task-card-ui__heading strong) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .task-card {
    min-height: 92px;
    padding: 13px 12px;
    border-radius: 11px;
  }
  .task-main strong {
    font-size: 14px;
  }
  .task-main p {
    margin-block: 5px 9px;
    font-size: 12px;
    line-height: 1.45;
  }
  .task-meta span {
    font-size: 10px;
  }
  .status-pill {
    flex: none;
    padding: 4px 7px;
    font-size: 10px !important;
  }
  .run-dependency {
    display: none;
  }
  .task-detail {
    padding: 2px 16px 12px;
  }
  .task-detail h3 {
    padding-right: 32px;
    font-size: 18px;
  }
  .task-detail p {
    font-size: 14px;
  }
  .task-detail dl {
    margin: 12px 0 10px;
  }
  .task-detail dl div {
    grid-template-columns: 70px minmax(0, 1fr);
    min-height: 40px;
    align-items: center;
    font-size: 13px;
  }
  .task-detail :deep(.task-dependency-graph) {
    height: min(42dvh, 360px);
    margin: 2px 0 12px;
  }
  .task-detail .wide {
    position: sticky;
    z-index: 2;
    bottom: 0;
    min-height: 44px;
    margin-top: 8px;
    box-shadow: 0 -10px 18px var(--m-surface, var(--app-settings-card));
  }
}
</style>
