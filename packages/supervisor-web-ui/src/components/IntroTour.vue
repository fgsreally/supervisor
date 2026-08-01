<template>
  <Teleport to="body">
    <div v-if="open" class="intro-layer" :class="{ 'intro-layer--mobile': isMobile }">
      <div class="intro-focus" :style="focusStyle" />
      <section
        class="intro-popover"
        :class="{ 'intro-popover--sheet': isMobile }"
        :style="popoverStyle"
      >
        <header>
          <span>{{ current.eyebrow }}</span>
          <button type="button" title="退出教程" aria-label="退出教程" @click="close">
            <X />
          </button>
        </header>
        <h3>{{ current.title }}</h3>
        <p>{{ current.content }}</p>

        <div v-if="current.kind === 'overview'" class="intro-modules">
          <div v-for="mod in overviewModules" :key="mod.label">
            <component :is="mod.icon" />
            <span>
              <strong>{{ mod.label }}</strong>
              <small>{{ mod.desc }}</small>
            </span>
          </div>
        </div>

        <div v-if="current.kind === 'nav'" class="intro-action-hint">
          <MousePointer2 />请点击高亮的“{{ current.navLabel }}”
        </div>
        <div v-else-if="current.kind === 'finish'" class="intro-finish-note">
          {{
            isMobile
              ? "以后可在「我的 → 使用教程」重新开始。"
              : "以后需要帮助时，点击侧栏蓝色教程图标即可重新开始。"
          }}
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
  Bot,
  Cloud,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  MousePointer2,
  Settings,
  UserRound,
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

const desktopStages: Stage[] = [
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
    content: "在左侧项目旁点击“+”选择 Agent。会话会保留消息、任务、Git 状态和子 Agent 运行过程。",
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
    title: "规划确认后再执行",
    content:
      "新建 Todo 后由华生拆成带依赖的工作项，你确认项目、Agent 与子 Agent 后，再进入任务面板按依赖并行/串行执行。",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="contacts"]',
    eyebrow: "第三步",
    title: "配置 Agent 能力",
    content: "Agent 决定由谁工作，以及它能使用哪些模型、工具和资源。",
    navLabel: "智能代理",
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

const mobileStages: Stage[] = [
  {
    kind: "overview",
    selector: "[data-tour-tabbar]",
    eyebrow: "欢迎使用 Supervisor",
    title: "底部四栏就是全部入口",
    content: "聊天、工作、智能代理、我的。一级只进列表，模型与资源等放在「我的」里。",
    nextLabel: "开始了解",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="chat"]',
    eyebrow: "第一步",
    title: "进入聊天",
    content: "日常工作从聊天开始：选项目、开会话、跟 Agent 协作。",
    navLabel: "聊天",
  },
  {
    kind: "feature",
    selector: '[data-tour-page="chat"]',
    eyebrow: "聊天",
    title: "会话列表与对话",
    content: "点进会话即可对话。右上角可从外部引入会话；项目旁的“+”可新建会话。",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="work"]',
    eyebrow: "第二步",
    title: "查看工作进度",
    content: "不必一直翻聊天记录，可在「工作」里看 Todo、计划与全局状态。",
    navLabel: "工作",
  },
  {
    kind: "feature",
    selector: '[data-tour-page="work"]',
    eyebrow: "工作",
    title: "任务与看板",
    content: "在这里切换 Todo / 计划与 Dashboard；规划确认后可在看板查看依赖执行进度。",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="agents"]',
    eyebrow: "第三步",
    title: "配置智能代理",
    content: "Agent 决定由谁工作，以及模型、工具和资源怎么组合。",
    navLabel: "智能代理",
  },
  {
    kind: "feature",
    selector: '[data-tour-page="contacts"]',
    eyebrow: "智能代理",
    title: "先选 Agent，再进详情",
    content: "一级只显示列表。点进某个 Agent 再配置模型、Skills 与扩展。",
  },
  {
    kind: "nav",
    selector: '[data-tour-nav="me"]',
    eyebrow: "第四步",
    title: "打开「我的」",
    content: "模型供应商、资源库、外观字号、服务设置和教程都在这里。",
    navLabel: "我的",
  },
  {
    kind: "feature",
    selector: '[data-tour-page="me"]',
    eyebrow: "我的",
    title: "能力与偏好",
    content: "需要改模型或资源时再进来即可，不必和聊天抢首屏。",
  },
  {
    kind: "finish",
    selector: "[data-tour-tutorial]",
    eyebrow: "教程完成",
    title: "可以开始第一条会话了",
    content: "回到「聊天」，选项目并创建会话。需要时再来「我的」调整设置。",
  },
];

const open = ref(false);
const index = ref(0);
const isMobile = ref(false);
const rect = ref({ left: 12, top: 12, width: 48, height: 48 });

const stages = computed(() => (isMobile.value ? mobileStages : desktopStages));
const current = computed(() => stages.value[index.value]!);

const overviewModules = computed(() =>
  isMobile.value
    ? [
        { icon: MessageSquare, label: "聊天", desc: "日常协作入口" },
        { icon: ListTodo, label: "工作", desc: "任务与看板" },
        { icon: Bot, label: "智能代理", desc: "角色与能力" },
        { icon: UserRound, label: "我的", desc: "模型、资源与设置" },
      ]
    : [
        { icon: MessageSquare, label: "聊天", desc: "日常工作的核心入口" },
        { icon: ListTodo, label: "Todo / 计划", desc: "管理目标和执行进度" },
        { icon: LayoutDashboard, label: "Dashboard", desc: "查看全局工作状态" },
        { icon: Users, label: "Agent", desc: "配置角色、模型和工具" },
        { icon: Cloud, label: "模型", desc: "维护供应商与可用模型" },
        { icon: FolderOpen, label: "资源", desc: "管理扩展、技能和模板" },
        { icon: Settings, label: "设置", desc: "服务与偏好" },
      ],
);

const focusStyle = computed(() => ({
  left: `${rect.value.left}px`,
  top: `${rect.value.top}px`,
  width: `${rect.value.width}px`,
  height: `${rect.value.height}px`,
}));

const popoverStyle = computed(() => {
  if (isMobile.value) return {};
  const width = current.value.kind === "overview" ? 360 : 320;
  const rightSide = rect.value.left < window.innerWidth / 2;
  const left = rightSide
    ? Math.min(window.innerWidth - width - 16, rect.value.left + rect.value.width + 14)
    : Math.max(16, rect.value.left - width - 14);
  const top = Math.max(16, Math.min(window.innerHeight - 420, rect.value.top));
  return { left: `${left}px`, top: `${top}px`, width: `${width}px` };
});

function refreshMobileFlag() {
  isMobile.value = window.matchMedia("(max-width: 767px)").matches;
}

async function locate() {
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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

function start() {
  refreshMobileFlag();
  index.value = 0;
  open.value = true;
  document.addEventListener("click", onDocumentClick, true);
  window.addEventListener("resize", onViewportChange);
  window.visualViewport?.addEventListener("resize", onViewportChange);
  void locate();
}

function close() {
  open.value = false;
  document.removeEventListener("click", onDocumentClick, true);
  window.removeEventListener("resize", onViewportChange);
  window.visualViewport?.removeEventListener("resize", onViewportChange);
}

function next() {
  if (index.value >= stages.value.length - 1) return close();
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
</style>
