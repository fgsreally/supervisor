<template>
  <div class="todo-shell">
    <header class="todo-head">
      <div class="todo-head__brand plan-desktop-only">
        <h1>Todo</h1>
        <span>{{ headStatus }}</span>
      </div>
      <div class="todo-mode-switch plan-desktop-only" role="tablist" :aria-label="t('todo.mode')">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'plan'"
          :class="{ active: activeTab === 'plan' }"
          @click="activeTab = 'plan'"
        >
          {{ t("todo.plan") }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'run'"
          :class="{ active: activeTab === 'run' }"
          @click="activeTab = 'run'"
        >
          {{ t("todo.run") }}
        </button>
      </div>
      <div class="todo-head__actions plan-desktop-only">
        <button v-if="activeTab === 'plan'" type="button" class="quiet" @click="openGoalHistory">
          <History />{{ t("todo.history") }}
        </button>
        <div v-else class="view-switch" :aria-label="t('todo.runView')">
          <button
            type="button"
            :class="{ active: runView === 'graph' }"
            :title="t('todo.graph')"
            :aria-label="t('todo.graph')"
            @click="runView = 'graph'"
          >
            <Waypoints />
          </button>
          <button
            type="button"
            :class="{ active: runView === 'timeline' }"
            :title="t('todo.timeline')"
            :aria-label="t('todo.timeline')"
            @click="runView = 'timeline'"
          >
            <GanttChart />
          </button>
        </div>
      </div>
      <div class="mobile-tabs">
        <button type="button" :class="{ active: activeTab === 'plan' }" @click="activeTab = 'plan'">
          {{ t("todo.plan") }}
        </button>
        <button type="button" :class="{ active: activeTab === 'run' }" @click="activeTab = 'run'">
          {{ t("todo.run") }}
        </button>
      </div>
    </header>

    <!-- PC：左轨 + 右舞台 -->
    <main class="todo-studio plan-desktop-only">
      <aside v-show="activeTab === 'plan'" class="todo-rail">
        <div class="todo-rail__scroll">
          <div class="rail-label">{{ t("todo.goal") }}</div>
          <div class="goal-box">
            <textarea v-model="goal" rows="5" :placeholder="t('todo.goalPlaceholder')" />
            <div class="goal-box__footer">
              <span class="project-pill"><FolderGit2 />supervisor-web-ui</span>
              <button type="button" class="primary" :disabled="planning" @click="mockPlan">
                <Sparkles />{{ planning ? t("todo.planning") : t("todo.startPlanning") }}
              </button>
            </div>
          </div>

          <div class="rail-label">
            <span>{{ t("todo.drafts") }}</span>
            <em>{{ drafts.length }}</em>
          </div>
          <div v-if="drafts.length" class="desktop-plan-list">
            <button
              v-for="(task, index) in drafts"
              :key="task.id"
              type="button"
              class="desktop-plan-row"
              :class="{ active: focusId === task.id }"
              @click="focusDraft(task)"
              @dblclick="openTask(task)"
            >
              <span class="desktop-plan-row__index">{{ index + 1 }}</span>
              <div class="desktop-plan-row__body">
                <strong>{{ task.title }}</strong>
                <small>{{ task.project }} · {{ task.agent }}</small>
              </div>
            </button>
          </div>
          <p v-else class="rail-empty">{{ t("todo.emptyDrafts") }}</p>
        </div>
        <div v-if="drafts.length" class="plan-actions plan-actions--rail">
          <button type="button" class="plan-actions__secondary">{{ t("todo.addOnly") }}</button>
          <button type="button" class="primary plan-actions__main" @click="startPlanExecution">
            {{ t("todo.startRun") }}
          </button>
        </div>
      </aside>

      <aside v-show="activeTab === 'run'" class="todo-rail todo-rail--run">
        <div class="todo-rail__scroll">
          <section class="run-summary" :aria-label="t('todo.runOverview')">
            <div class="run-summary__top">
              <div>
                <strong>{{ runPulseTitle }}</strong>
                <p>{{ runPulseSubtitle }}</p>
              </div>
              <span class="run-summary__pct">{{ runProgress }}%</span>
            </div>
            <div class="run-summary__bar" aria-hidden="true">
              <i :style="{ width: `${runProgress}%` }" />
            </div>
            <div class="run-summary__stats">
              <span><i data-tone="running" />{{ count("running") }} {{ t("todo.running") }}</span>
              <span><i data-tone="blocked" />{{ count("blocked") }} {{ t("todo.blocked") }}</span>
              <span><i data-tone="pending" />{{ count("pending") }} {{ t("todo.pending") }}</span>
              <span><i data-tone="done" />{{ count("done") }} {{ t("todo.done") }}</span>
            </div>
          </section>

          <nav class="run-filter-bar" :aria-label="t('todo.statusFilter')">
            <button
              v-for="filter in runChipFilters"
              :key="filter.id"
              type="button"
              :class="{ active: activeFilter === filter.id }"
              @click="activeFilter = filter.id"
            >
              {{ filter.label }}
              <em>{{ count(filter.id) }}</em>
            </button>
          </nav>

          <template v-for="group in runRailGroups" :key="group.id">
            <section v-if="group.tasks.length" class="run-section">
              <div class="run-section__label">{{ group.label }} · {{ group.tasks.length }}</div>
              <div class="run-section__list">
                <button
                  v-for="task in group.tasks"
                  :key="task.id"
                  type="button"
                  class="run-cell"
                  :class="{ active: focusId === task.id }"
                  :data-status="task.status"
                  @click="openTask(task)"
                >
                  <span class="run-cell__dot" aria-hidden="true" />
                  <div class="run-cell__main">
                    <strong>{{ task.title }}</strong>
                    <small>{{ task.agent }} · {{ task.project }}</small>
                  </div>
                  <span class="run-cell__status">{{ statusLabel(task.status) }}</span>
                  <ChevronRight class="run-cell__arrow" aria-hidden="true" />
                </button>
              </div>
            </section>
          </template>
          <p v-if="!visibleTasks.length" class="rail-empty">{{ t("todo.noTasksForStatus") }}</p>
        </div>
      </aside>

      <section class="todo-canvas">
        <TodoSequenceDiagram
          v-if="activeTab === 'plan'"
          bare
          fill
          title="顺序图"
          :tasks="drafts"
          :selected-id="focusId"
          :agents="agents"
          empty-text="写好目标并开始规划后，顺序关系会显示在这里"
          @select="selectDraft"
        />
        <TodoSequenceDiagram
          v-else-if="runView === 'graph'"
          bare
          fill
          title="执行关系"
          :tasks="execution"
          :selected-id="focusId"
          :agents="agents"
          empty-text="暂无执行中的任务"
          @select="selectExecution"
        />
        <div v-else class="canvas-timeline">
          <header class="canvas-timeline__head">
            <strong>时间轴</strong>
            <span>{{ execution.length }} 个任务</span>
          </header>
          <div class="execution-timeline">
            <article v-for="(task, index) in execution" :key="task.id" @click="openTask(task)">
              <div class="time">
                <strong>{{ taskEventTime(task.id, index) }}</strong>
                <span>今天</span>
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
        </div>
      </section>
    </main>

    <!-- 移动端：保持原有结构 -->
    <main class="todo-stage plan-mobile-only">
      <section
        class="plan-pane"
        :class="{
          'mobile-hidden': activeTab !== 'plan',
          'plan-pane--ready': drafts.length > 0,
        }"
      >
        <div class="plan-mobile-toolbar">
          <div>
            <strong>{{ planMobileTitle }}</strong>
            <span>{{ planMobileSubtitle }}</span>
          </div>
          <button
            type="button"
            class="plan-icon-btn"
            :title="t('todo.historyTitle')"
            :aria-label="t('todo.historyTitle')"
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
            :aria-label="t('todo.modifyPlan')"
            @click="goalComposerOpen = true"
          >
            <div class="goal-summary__main">
              <span class="goal-summary__label">{{ t("todo.currentGoal") }}</span>
              <strong>{{ goal }}</strong>
            </div>
            <span class="goal-summary__edit" aria-hidden="true">
              <Pencil />
            </span>
          </button>
          <template v-else>
            <textarea v-model="goal" rows="5" :placeholder="t('todo.goalPlaceholder')" />
            <div class="goal-box__footer">
              <span class="project-pill"><FolderGit2 />supervisor-web-ui</span>
              <button type="button" class="primary" :disabled="planning" @click="mockPlan">
                <Sparkles />{{ planning ? "正在整理…" : "开始规划" }}
              </button>
            </div>
            <button
              v-if="drafts.length"
              type="button"
              class="goal-box__collapse"
              @click="goalComposerOpen = false"
            >
              收起
            </button>
          </template>
        </div>

        <div v-if="drafts.length" class="mobile-plan-list" aria-label="规划任务列表">
          <div class="mobile-plan-section-label">{{ t("todo.confirmedTasks", { count: drafts.length }) }}</div>
          <div class="mobile-plan-group">
            <button
              v-for="(task, index) in drafts"
              :key="task.id"
              type="button"
              class="mobile-plan-row"
              @click="openTask(task)"
            >
              <span class="mobile-plan-row__index">{{ index + 1 }}</span>
              <div class="mobile-plan-row__body">
                <strong>{{ task.title }}</strong>
                <p>{{ task.description }}</p>
                <small>{{ task.project }} · {{ task.agent }}</small>
              </div>
              <ChevronRight class="mobile-plan-row__arrow" />
            </button>
          </div>
        </div>

        <div v-if="drafts.length" class="plan-actions">
          <button type="button" class="plan-actions__secondary">{{ t("todo.addOnly") }}</button>
          <button type="button" class="primary plan-actions__main" @click="startPlanExecution">
            {{ t("todo.startRun") }}
          </button>
        </div>
      </section>

      <section class="run-pane" :class="{ 'mobile-hidden': activeTab !== 'run' }">
        <div class="pane-title">
          <div>
            <h2>{{ t("todo.execution") }}</h2>
            <span>{{ t("todo.runningTaskCount", { count: runningCount }) }}</span>
          </div>
          <div class="view-switch" aria-label="执行视图">
            <button
              type="button"
              :class="{ active: mobileRunView === 'list' }"
              :title="t('todo.list')"
              :aria-label="t('todo.list')"
              @click="mobileRunView = 'list'"
            >
              <List />
            </button>
            <button
              type="button"
              :class="{ active: mobileRunView === 'timeline' }"
              :title="t('todo.timeline')"
              :aria-label="t('todo.timeline')"
              @click="mobileRunView = 'timeline'"
            >
              <GanttChart />
            </button>
          </div>
        </div>
        <div class="run-controls">
          <nav v-if="mobileRunView === 'list'" class="filters" :aria-label="t('todo.statusFilter')">
            <button
              v-for="filter in filters"
              :key="filter.id"
              type="button"
              :class="{ active: activeFilter === filter.id }"
              @click="activeFilter = filter.id"
            >
              {{ filter.label }} <span>{{ count(filter.id) }}</span>
            </button>
          </nav>
        </div>
        <div v-if="mobileRunView === 'list'" class="run-list">
          <TaskCard
            v-for="task in visibleTasks"
            :key="task.id"
            class="run-card"
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
              <span><Link2 />{{ t("todo.dependencies", { count: task.dependencies.length }) }}</span>
            </template>
          </TaskCard>
        </div>
        <div v-else class="execution-timeline">
          <article v-for="(task, index) in execution" :key="task.id" @click="openTask(task)">
            <div class="time">
              <strong>{{ taskEventTime(task.id, index) }}</strong>
              <span>今天</span>
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

    <ResponsiveDialog
      :open="selected != null"
      :title="selected ? `Task ${selected.id}` : t('todo.taskDetails')"
      panel-class="todo-task-dialog"
      @close="selected = null"
    >
      <div v-if="selected" class="task-detail">
        <h3>{{ selected.title }}</h3>
        <p>{{ selected.description }}</p>
        <dl>
          <div>
            <dt>{{ t("todo.project") }}</dt>
            <dd>{{ selected.project }}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{{ selected.agent }}</dd>
          </div>
        </dl>
        <button
          v-if="selected.sessionId"
          type="button"
          class="primary wide"
          @click="viewSession(selected.sessionId)"
        >
          <Eye />{{ t("todo.viewSession") }}
        </button>
      </div>
    </ResponsiveDialog>
    <ResponsiveDialog :open="goalHistoryOpen" :title="t('todo.historyTitle')" @close="goalHistoryOpen = false">
      <div class="goal-history">
        <article v-for="event in goalEvents" :key="event.id">
          <time>{{ formatGoalTime(event.createdAt) }}</time>
          <strong>{{ goalObjective(event) }}</strong>
        </article>
        <p v-if="!goalEvents.length" class="goal-history__empty">{{ t("todo.noHistory") }}</p>
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
  Pencil,
  Sparkles,
  Waypoints,
} from "lucide-vue-next";
import TodoSequenceDiagram from "@/components/home/TodoSequenceDiagram.vue";
import TaskCard from "@/components/task/TaskCard.vue";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import { useI18n } from "@/i18n";
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
const { t } = useI18n();
const goal = ref("优化 Supervisor 的 Todo，让规划、依赖和执行状态更清晰");
const planning = ref(false);
const goalComposerOpen = ref(false);
const isNarrowUi = ref(false);
const activeTab = ref<"plan" | "run">("plan");
const focusId = ref<number | null>(null);
const selected = ref<MockTask | null>(null);
const activeFilter = ref("all");
const runView = ref<"graph" | "timeline">("graph");
const mobileRunView = ref<"list" | "timeline">("list");
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

const filters = computed(() => [
  { id: "all", label: t("todo.all") },
  { id: "pending", label: t("todo.pending") },
  { id: "running", label: t("todo.running") },
  { id: "blocked", label: t("todo.blocked") },
  { id: "done", label: t("todo.done") },
]);
const visibleTasks = computed(() =>
  activeFilter.value === "all"
    ? execution.value
    : execution.value.filter((t) => t.status === activeFilter.value),
);
const runningCount = computed(() => execution.value.filter((t) => t.status === "running").length);
const runProgress = computed(() => {
  const total = execution.value.length;
  if (!total) return 0;
  return Math.round((execution.value.filter((t) => t.status === "done").length / total) * 100);
});
const runPulseTitle = computed(() => {
  if (runningCount.value) return t("todo.running");
  if (execution.value.some((t) => t.status === "blocked")) return t("todo.hasBlocked");
  if (execution.value.some((t) => t.status === "pending")) return t("todo.notStarted");
  return t("todo.done");
});
const runPulseSubtitle = computed(() => {
  const focus =
    execution.value.find((t) => t.id === focusId.value) ??
    execution.value.find((t) => t.status === "running") ??
    execution.value.find((t) => t.status === "blocked");
  if (focus) return focus.title;
  return t("todo.taskCount", { count: execution.value.length });
});
const runChipFilters = computed(() => [
  { id: "all", label: t("todo.all") },
  { id: "running", label: t("todo.runningShort") },
  { id: "blocked", label: t("todo.blocked") },
  { id: "pending", label: t("todo.queued") },
  { id: "done", label: t("todo.doneShort") },
]);
const runRailGroups = computed(() => {
  const tasks = visibleTasks.value;
  if (activeFilter.value !== "all") {
    return [{ id: "filtered", label: t("todo.taskDetails"), tasks }];
  }
  return [
    {
      id: "now",
      label: t("todo.running"),
      tasks: tasks.filter((t) => t.status === "running" || t.status === "blocked"),
    },
    {
      id: "queue",
      label: t("todo.queued"),
      tasks: tasks.filter((t) => t.status === "pending"),
    },
    {
      id: "done",
      label: t("todo.done"),
      tasks: tasks.filter((t) => t.status === "done"),
    },
  ];
});
const headStatus = computed(() => {
  if (activeTab.value === "plan") {
    return drafts.value.length ? t("todo.draftsCount", { count: drafts.value.length }) : t("todo.organizeIdea");
  }
  return runningCount.value ? t("todo.runningCount", { count: runningCount.value }) : t("todo.noRunning");
});
const showGoalSummary = computed(
  () => isNarrowUi.value && drafts.value.length > 0 && !goalComposerOpen.value && !planning.value,
);
const planMobileTitle = computed(() => (drafts.value.length ? t("todo.confirmPlan") : t("todo.newPlan")));
const planMobileSubtitle = computed(() =>
  drafts.value.length ? t("todo.draftsCount", { count: drafts.value.length }) : t("todo.watsonPlanHint"),
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
  return {
    pending: t("todo.pending"),
    running: t("todo.running"),
    blocked: t("todo.blocked"),
    done: t("todo.done"),
  }[s];
}
function focusDraft(task: MockTask) {
  focusId.value = task.id;
}
function openTask(task: MockTask) {
  focusId.value = task.id;
  selected.value = task;
}
function selectDraft(id: number) {
  const task = drafts.value.find((item) => item.id === id) ?? null;
  focusId.value = id;
  selected.value = task;
}
function selectExecution(id: number) {
  const task = execution.value.find((item) => item.id === id) ?? null;
  focusId.value = id;
  selected.value = task;
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
  activeTab.value = "run";
  focusId.value = execution.value[0]?.id ?? null;
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
  if (!focusId.value && drafts.value.length) focusId.value = drafts.value[0]!.id;
});
</script>

<style scoped>
.todo-shell {
  display: flex;
  height: 100%;
  flex-direction: column;
  background: var(--app-list-section-bg, var(--app-shell-bg));
  color: var(--app-text-primary);
}

.todo-head {
  z-index: 2;
  display: grid;
  height: 56px;
  flex: none;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-list-header-bg, var(--app-list-section-bg, var(--app-shell-bg)));
}

.todo-head__brand {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 10px;
}

.todo-head__brand h1 {
  font-size: var(--app-font-page-title);
  font-weight: var(--app-font-weight-semibold);
  letter-spacing: 0.01em;
}

.todo-head__brand span {
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: var(--app-font-control);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-mode-switch {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: var(--app-hover);
}

.todo-mode-switch button {
  min-width: 72px;
  padding: 6px 14px;
  border-radius: 7px;
  color: var(--app-text-muted);
  font-size: var(--app-font-control);
  font-weight: 500;
}

.todo-mode-switch button.active {
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}

.todo-head__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.todo-studio {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 360px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.todo-rail {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--app-border-subtle);
  background: transparent;
}

.todo-rail__scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 18px 16px 16px;
}

.todo-canvas {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: transparent;
}

.todo-canvas > * {
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.rail-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.rail-label em {
  color: var(--app-text-muted);
  font-style: normal;
  font-weight: 500;
}

.rail-empty {
  margin: 8px 2px 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-control);
  line-height: 1.5;
}

.quiet,
.primary,
.secondary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 8px;
  padding: 7px 12px;
  font-size: var(--app-font-control);
}

.quiet {
  color: var(--app-text-secondary);
  background: var(--app-settings-card);
}

.primary {
  color: #fff;
  background: #07c160;
}

.primary:disabled {
  opacity: 0.55;
}

button svg {
  width: 14px;
  height: 14px;
}

.goal-box {
  padding: 14px;
  border: 0;
  border-radius: 10px;
  background: var(--app-settings-card);
}

.goal-box textarea {
  width: 100%;
  min-height: 110px;
  resize: none;
  background: transparent;
  font-size: var(--app-font-body);
  line-height: 1.6;
  outline: none;
}

.goal-box__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.project-pill {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  color: #078f49;
  font-size: var(--app-font-caption);
}

.desktop-plan-list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  background: var(--app-settings-card);
}

.desktop-plan-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 12px 14px;
  border-top: 1px solid var(--app-border-subtle);
  color: var(--app-text-primary);
  text-align: left;
  transition: background 0.14s ease;
}

.desktop-plan-row:first-child {
  border-top: 0;
}

.desktop-plan-row:hover {
  background: var(--app-hover);
}

.desktop-plan-row.active {
  background: color-mix(in srgb, #07c160 10%, var(--app-settings-card));
}

.desktop-plan-row__index {
  display: grid;
  width: 26px;
  height: 26px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, #07c160 14%, transparent);
  color: #07c160;
  font-size: var(--app-font-caption);
  font-weight: 650;
}

.desktop-plan-row__body {
  min-width: 0;
  flex: 1;
}

.desktop-plan-row__body strong {
  display: block;
  overflow: hidden;
  color: var(--app-text-primary);
  font-size: var(--app-font-body);
  font-weight: 560;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-plan-row__body small {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.plan-actions--rail {
  flex: none;
  justify-content: stretch;
  gap: 10px;
  margin: 0;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--app-border-subtle);
  background: var(--app-list-section-bg, var(--app-shell-bg));
}

.plan-actions--rail .plan-actions__secondary,
.plan-actions--rail .plan-actions__main {
  flex: 1;
}

.plan-actions__secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 7px 12px;
  border-radius: 8px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
  font-size: var(--app-font-control);
}

.plan-actions__main {
  min-height: 36px;
  justify-content: center;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filters button {
  flex: none;
  padding: 6px 10px;
  border-radius: 999px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-control);
}

.filters button.active {
  color: #078f49;
  background: color-mix(in srgb, #07c160 12%, transparent);
}

.filters span {
  margin-left: 3px;
}

.run-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-rail--run .todo-rail__scroll {
  gap: 12px;
}

.run-summary {
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--app-settings-card);
}

.run-summary__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.run-summary__top strong {
  display: block;
  color: var(--app-text-primary);
  font-size: var(--app-font-body-strong);
  font-weight: 600;
}

.run-summary__top p {
  margin-top: 4px;
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: var(--app-font-control);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-summary__pct {
  flex: none;
  color: #07c160;
  font-size: 1.125rem;
  font-weight: var(--app-font-weight-bold);
  line-height: 1.1;
}

.run-summary__bar {
  height: 4px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--app-hover);
}

.run-summary__bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #07c160;
}

.run-summary__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 12px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
}

.run-summary__stats span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.run-summary__stats i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #b2b2b2;
}

.run-summary__stats i[data-tone="running"] {
  background: #10aeff;
}

.run-summary__stats i[data-tone="blocked"] {
  background: #fa5151;
}

.run-summary__stats i[data-tone="pending"] {
  background: #ffc300;
}

.run-summary__stats i[data-tone="done"] {
  background: #07c160;
}

.run-filter-bar {
  display: flex;
  gap: 0;
  overflow: hidden;
  border-radius: 8px;
  background: var(--app-settings-card);
}

.run-filter-bar button {
  display: inline-flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 9px 4px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
}

.run-filter-bar button + button {
  border-left: 1px solid var(--app-border-subtle);
}

.run-filter-bar button.active {
  color: #07c160;
  font-weight: 600;
  background: color-mix(in srgb, #07c160 12%, var(--app-settings-card));
}

.run-filter-bar em {
  font-style: normal;
  font-weight: 600;
}

.run-section {
  display: grid;
  gap: 6px;
}

.run-section__label {
  padding: 2px 4px;
  color: var(--app-text-muted);
  font-size: var(--app-font-caption);
}

.run-section__list {
  overflow: hidden;
  border-radius: 10px;
  background: var(--app-settings-card);
}

.run-cell {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto 14px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 12px 12px 12px 14px;
  border-top: 1px solid var(--app-border-subtle);
  color: var(--app-text-primary);
  text-align: left;
}

.run-cell:first-child {
  border-top: 0;
}

.run-cell:active,
.run-cell.active {
  background: var(--app-hover);
}

.run-cell__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b2b2b2;
}

.run-cell[data-status="running"] .run-cell__dot {
  background: #10aeff;
}

.run-cell[data-status="blocked"] .run-cell__dot {
  background: #fa5151;
}

.run-cell[data-status="pending"] .run-cell__dot {
  background: #ffc300;
}

.run-cell[data-status="done"] .run-cell__dot {
  background: #07c160;
}

.run-cell__main {
  min-width: 0;
}

.run-cell__main strong {
  display: block;
  overflow: hidden;
  color: var(--app-text-primary);
  font-size: var(--app-font-body-strong);
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-cell__main small {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-cell__status {
  color: var(--app-text-muted);
  font-size: var(--app-font-caption);
}

.run-cell[data-status="running"] .run-cell__status {
  color: #10aeff;
}

.run-cell[data-status="blocked"] .run-cell__status {
  color: #fa5151;
}

.run-cell__arrow {
  width: 14px;
  height: 14px;
  color: var(--app-text-muted);
}

.view-switch {
  display: flex;
  gap: 3px;
  width: max-content;
  padding: 3px;
  border-radius: 8px;
  background: var(--app-hover);
}

.view-switch button {
  display: grid;
  width: 32px;
  height: 30px;
  place-items: center;
  border-radius: 6px;
  color: var(--app-text-muted);
}

.view-switch button.active {
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}

.view-switch button svg {
  width: 15px;
  height: 15px;
}

.canvas-timeline {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.canvas-timeline__head {
  display: flex;
  flex: none;
  align-items: baseline;
  gap: 8px;
  padding: 14px 18px 10px;
}

.canvas-timeline__head strong {
  font-size: var(--app-font-body);
}

.canvas-timeline__head span {
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
}

.canvas-timeline .execution-timeline {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 4px 18px 24px;
}

.execution-timeline > article {
  display: grid;
  grid-template-columns: 52px 24px minmax(0, 1fr);
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
  font-size: var(--app-font-control);
}

.execution-timeline .time span {
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
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
}

.execution-timeline .event :deep(.task-card-ui) {
  width: 100%;
}

.mobile-tabs,
.plan-mobile-only,
.goal-summary,
.goal-box__collapse,
.mobile-plan-list {
  display: none;
}

.todo-stage {
  display: none;
}

.pane-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.pane-title h2 {
  font-size: var(--app-font-title);
  font-weight: 650;
}

.pane-title span {
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
}

.task-detail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0 4px;
}

.task-detail h3 {
  margin: 0 0 8px;
  color: var(--app-text-primary);
  font-size: var(--app-font-page-title);
}

.task-detail p {
  color: var(--app-text-body);
  font-size: var(--app-font-body);
  line-height: 1.6;
}

.task-detail dl {
  margin: 14px 0;
}

.task-detail dl div {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  padding: 8px 0;
  border-top: 1px solid var(--app-border-subtle);
  font-size: var(--app-font-control);
}

.task-detail dt {
  color: var(--app-text-muted);
}

:global(.m-drawer.todo-task-dialog.m-drawer--modal) {
  width: min(420px, calc(100vw - 32px));
  max-height: min(72dvh, 520px);
}

:global(.m-drawer.todo-task-dialog .m-drawer__header) {
  padding: 10px 8px 10px 16px;
}

:global(.m-drawer.todo-task-dialog .m-drawer__title) {
  color: var(--app-text-muted);
  font-size: var(--app-font-control);
  font-weight: 500;
}

:global(.m-drawer.todo-task-dialog .m-drawer__body) {
  padding: 0 16px 16px;
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
  font-size: var(--app-font-caption);
}

.goal-history strong {
  font-size: var(--app-font-body);
  line-height: 1.45;
}

.goal-history__empty {
  padding: 18px 0;
  color: var(--app-text-muted);
  text-align: center;
  font-size: var(--app-font-body);
}

.wide {
  width: 100%;
  justify-content: center;
}

@media (max-width: 720px) {
  .todo-shell {
    background: var(--m-page-bg, var(--app-settings-bg));
  }

  .todo-head {
    display: flex;
    height: auto;
    padding: 8px 16px;
    background: var(--m-header-bg, var(--app-settings-bg));
  }

  .plan-desktop-only {
    display: none !important;
  }

  .plan-mobile-only,
  .todo-stage {
    display: block;
  }

  .todo-stage {
    min-height: 0;
    flex: 1;
    overflow: hidden;
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
    color: var(--app-text-muted);
    font-size: var(--m-font-list-primary, 15px);
  }

  .mobile-tabs button.active {
    background: var(--app-settings-card);
    color: var(--app-text-primary);
    box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
  }

  .plan-pane,
  .run-pane {
    height: 100%;
    overflow: auto;
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

  .plan-mobile-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .plan-mobile-toolbar strong {
    display: block;
    font-size: var(--m-font-page-title, 18px);
    font-weight: 600;
    line-height: 1.3;
  }

  .plan-mobile-toolbar span {
    display: block;
    margin-top: 2px;
    color: var(--m-text-secondary, var(--app-text-secondary));
    font-size: var(--m-font-list-secondary, 13px);
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
    box-shadow: none;
  }

  .goal-box--summary {
    padding: 0;
    background: transparent;
  }

  .goal-box textarea {
    min-height: 104px;
    font-size: var(--m-font-list-primary, 15px);
    line-height: 1.5;
  }

  .goal-box__footer {
    align-items: flex-end;
    margin-top: 12px;
  }

  .goal-box__footer .primary {
    min-height: 40px;
    padding-inline: 14px;
    font-size: var(--m-font-list-primary, 15px);
  }

  .goal-box__collapse {
    display: block;
    width: 100%;
    margin-top: 10px;
    padding: 10px 0 2px;
    color: var(--m-link, #576b95);
    font-size: var(--m-font-list-primary, 15px);
    text-align: center;
  }

  .goal-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 12px 14px 16px;
    border-radius: 12px;
    background: var(--m-surface, var(--app-settings-card));
    text-align: left;
  }

  .goal-summary:active {
    background: var(--m-pressed, var(--app-hover));
  }

  .goal-summary__main {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 4px;
  }

  .goal-summary__label {
    color: var(--m-text-muted, var(--app-text-muted));
    font-size: var(--m-font-section, 12px);
  }

  .goal-summary__edit {
    display: grid;
    width: 36px;
    height: 36px;
    flex: none;
    place-items: center;
    border-radius: 999px;
    color: var(--m-link, #576b95);
  }

  .goal-summary__edit svg {
    width: 18px;
    height: 18px;
  }

  .goal-summary strong {
    display: -webkit-box;
    overflow: hidden;
    color: var(--m-text-primary, var(--app-text-primary));
    font-size: var(--m-font-list-primary, 15px);
    font-weight: 500;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .project-pill {
    max-width: 46%;
    overflow: hidden;
    font-size: var(--m-font-section, 12px);
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
    font-size: var(--m-font-list-secondary, 13px);
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
    font-size: var(--m-font-list-secondary, 13px);
    font-weight: 600;
  }

  .mobile-plan-row__body {
    min-width: 0;
    flex: 1;
  }

  .mobile-plan-row__body strong {
    display: block;
    font-size: var(--m-font-list-primary, 15px);
    font-weight: 500;
    line-height: 1.35;
  }

  .mobile-plan-row__body p {
    display: -webkit-box;
    margin: 4px 0 0;
    overflow: hidden;
    color: var(--m-text-body, var(--app-text-body));
    font-size: var(--m-font-list-secondary, 13px);
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .mobile-plan-row__body small {
    display: block;
    margin-top: 6px;
    color: var(--m-text-muted, var(--app-text-muted));
    font-size: var(--m-font-section, 12px);
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
    font-size: var(--m-font-list-primary, 15px);
  }

  .plan-actions__main {
    min-height: 44px;
    border-radius: 10px;
    font-size: var(--m-font-list-primary, 15px);
    font-weight: 500;
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
    overflow: auto;
    scrollbar-width: none;
  }

  .filters::-webkit-scrollbar {
    display: none;
  }

  .filters button {
    min-height: 34px;
    padding: 6px 11px;
    border-radius: 6px;
    font-size: var(--m-font-section, 12px);
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

  .task-detail h3 {
    font-size: var(--m-font-page-title, 18px);
  }

  .task-detail p {
    font-size: var(--m-font-list-primary, 15px);
  }

  .task-detail dl {
    margin: 12px 0 10px;
  }

  .task-detail dl div {
    grid-template-columns: 70px minmax(0, 1fr);
    min-height: 40px;
    align-items: center;
    font-size: var(--m-font-list-secondary, 13px);
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
