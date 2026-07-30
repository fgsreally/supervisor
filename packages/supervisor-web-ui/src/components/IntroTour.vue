<template>
  <Teleport to="body">
    <div v-if="open" class="intro-layer">
      <div class="intro-focus" :style="focusStyle" />
      <section class="intro-popover" :style="popoverStyle">
        <header>
          <span>{{ current.eyebrow }}</span>
          <button type="button" title="退出教程" @click="close"><X /></button>
        </header>
        <h3>{{ current.title }}</h3>
        <p>{{ current.content }}</p>

        <div v-if="current.kind === 'overview'" class="intro-modules">
          <div>
            <MessageSquare /><span><strong>聊天</strong><small>日常工作的核心入口</small></span>
          </div>
          <div>
            <ListTodo /><span><strong>Todo / 计划</strong><small>管理目标和执行进度</small></span>
          </div>
          <div>
            <LayoutDashboard /><span
              ><strong>Dashboard</strong><small>查看全局工作状态</small></span
            >
          </div>
          <div>
            <Users /><span><strong>Agent</strong><small>配置角色、模型和工具</small></span>
          </div>
          <div>
            <Cloud /><span><strong>模型</strong><small>维护供应商与可用模型</small></span>
          </div>
          <div>
            <FolderOpen /><span><strong>资源</strong><small>管理扩展、技能和模板</small></span>
          </div>
        </div>

        <div v-if="current.kind === 'nav'" class="intro-action-hint">
          <MousePointer2 />请点击高亮的“{{ current.navLabel }}”图标
        </div>
        <div v-else-if="current.kind === 'finish'" class="intro-finish-note">
          以后需要帮助时，点击这个蓝色图标即可重新开始。
        </div>

        <footer v-if="current.kind !== 'nav'">
          <button v-if="current.kind !== 'finish'" type="button" class="intro-skip" @click="close">
            暂时跳过
          </button>
          <button type="button" class="intro-next" @click="next">
            {{ current.kind === "finish" ? "完成" : current.nextLabel || "下一步" }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import {
  Cloud,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  MousePointer2,
  Users,
  X,
} from "lucide-vue-next";

type Stage = {
  kind: "overview" | "nav" | "feature" | "finish";
  selector: string;
  eyebrow: string;
  title: string;
  content: string;
  navLabel?: string;
  nextLabel?: string;
};

const stages: Stage[] = [
  {
    kind: "overview",
    selector: "[data-tour-sidebar]",
    eyebrow: "欢迎使用 Supervisor",
    title: "先认识你的工作区",
    content: "左侧是全局导航。你不需要逐个配置页面，日常工作主要从聊天开始。",
    nextLabel: "开始核心流程",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="chat"]',
    eyebrow: "第一步",
    title: "进入聊天",
    content: "聊天连接项目、Agent 和实际执行过程，是最常用的入口。",
    navLabel: "聊天",
  },
  {
    kind: "feature",
    selector: '[data-tour-page="chat"]',
    eyebrow: "核心功能 · 会话",
    title: "从项目开始一次工作",
    content: "在左侧项目旁点击“+”选择 Agent。会话会保留消息、Todo、Git 状态和子 Agent 运行过程。",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="todo"]',
    eyebrow: "第二步",
    title: "理解任务管理",
    content: "复杂工作不必一直盯着聊天记录，可以进入 Todo / 计划集中查看。",
    navLabel: "Todo / 计划",
  },
  {
    kind: "feature",
    selector: '[data-tour-page="todo"]',
    eyebrow: "核心功能 · 任务",
    title: "目标、计划和 Todo 各司其职",
    content:
      "Goal 表示最终目标，Plan 先讨论方案再执行，Todo 记录当前要完成的具体事项。它们最终都会在这里呈现执行进度。",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="contacts"]',
    eyebrow: "第三步",
    title: "配置 Agent 能力",
    content: "Agent 决定由谁工作，以及它能使用哪些模型、工具和资源。",
    navLabel: "Agent",
  },
  {
    kind: "feature",
    selector: '[data-tour-page="contacts"]',
    eyebrow: "核心功能 · Agent",
    title: "模型只是 Agent 的一部分",
    content:
      "为 Agent 选择模型、权限、Skills 和 Extensions。工具的运行时可见性由扩展根据工作流控制。",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="resources"]',
    eyebrow: "第四步",
    title: "复用公共能力",
    content: "资源库用于维护可重复绑定给 Agent 的能力，不需要在每个 Agent 中重新创建。",
    navLabel: "资源",
  },
  {
    kind: "feature",
    selector: '[data-tour-page="resources"]',
    eyebrow: "核心功能 · 资源",
    title: "按用途选择资源类型",
    content:
      "Skills 提供方法，Extensions 提供工作流与工具，Template 提供可带参数复用的提示，MCP 连接外部服务。",
  },
  {
    kind: "finish",
    selector: "[data-tour-tutorial]",
    eyebrow: "教程完成",
    title: "现在可以从聊天开始了",
    content: "先选择一个项目和 Agent，创建你的第一个会话。其他设置可以在真正需要时再配置。",
  },
];

const open = ref(false);
const index = ref(0);
const rect = ref({ left: 12, top: 12, width: 48, height: 48 });
const current = computed(() => stages[index.value]!);
const focusStyle = computed(() => ({
  left: `${rect.value.left}px`,
  top: `${rect.value.top}px`,
  width: `${rect.value.width}px`,
  height: `${rect.value.height}px`,
}));
const popoverStyle = computed(() => {
  const width = current.value.kind === "overview" ? 360 : 320;
  const rightSide = rect.value.left < window.innerWidth / 2;
  const left = rightSide
    ? Math.min(window.innerWidth - width - 16, rect.value.left + rect.value.width + 14)
    : Math.max(16, rect.value.left - width - 14);
  const top = Math.max(16, Math.min(window.innerHeight - 500, rect.value.top));
  return { left: `${left}px`, top: `${top}px`, width: `${width}px` };
});

async function locate() {
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const target = document.querySelector(current.value.selector)?.getBoundingClientRect();
  if (!target) return;
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
function start() {
  index.value = 0;
  open.value = true;
  document.addEventListener("click", onDocumentClick, true);
  window.addEventListener("resize", locate);
  void locate();
}
function close() {
  open.value = false;
  document.removeEventListener("click", onDocumentClick, true);
  window.removeEventListener("resize", locate);
}
function next() {
  if (index.value >= stages.length - 1) return close();
  index.value += 1;
  void locate();
}
onBeforeUnmount(close);
defineExpose({ start });
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
  width: 25px;
  height: 25px;
  place-items: center;
  border-radius: 5px;
  color: var(--app-text-muted);
}
.intro-popover header button:hover {
  background: var(--app-hover);
}
.intro-popover header svg {
  width: 14px;
  height: 14px;
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
.intro-modules {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin-top: 14px;
}
.intro-modules > div {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border-radius: 7px;
  background: var(--app-hover);
}
.intro-modules svg {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--app-text-secondary);
}
.intro-modules span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.intro-modules strong {
  font-size: 12px;
  font-weight: 550;
}
.intro-modules small {
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
}
.intro-finish-note {
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px solid var(--app-border-subtle);
  color: var(--app-text-secondary);
  font-size: 12px;
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
</style>
