<template>
  <div class="dashboard">
    <header>
      <div>
        <h1>Dashboard</h1>
        <p>项目与工作动态</p>
      </div>
      <div class="range"><button class="active">7 天</button><button>30 天</button></div>
    </header>
    <main class="custom-scrollbar">
      <section class="overview">
        <article>
          <span>进行中的 Session</span><strong>3</strong><small>涉及 2 个项目</small>
        </article>
        <article>
          <span>本周完成任务</span><strong>12</strong><small class="good">较上周 +4</small>
        </article>
        <article><span>本周提交</span><strong>27</strong><small>6 个活跃分支</small></article>
      </section>
      <section class="timeline">
        <div class="timeline-head">
          <div>
            <h2>工作时间线</h2>
            <p>Session、任务和代码变更</p>
          </div>
          <button><Filter />筛选</button>
        </div>
        <div v-for="group in groups" :key="group.day" class="day-group">
          <div class="day-label">
            <strong>{{ group.day }}</strong
            ><span>{{ group.date }}</span>
          </div>
          <ol>
            <li v-for="event in group.events" :key="event.id" :class="`kind-${event.kind}`">
              <span class="rail-icon"
                ><GitCommitHorizontal v-if="event.kind === 'commit'" /><PlayCircle
                  v-else-if="event.kind === 'session'" /><CheckCircle2 v-else
              /></span>
              <article @click="event.sessionId && emit('open-session', event.sessionId)">
                <div class="event-top">
                  <div>
                    <strong>{{ event.title }}</strong
                    ><span>{{ event.time }}</span>
                  </div>
                  <span class="project"><FolderGit2 />{{ event.project }}</span>
                </div>
                <p>{{ event.detail }}</p>
                <div v-if="event.commits" class="commits">
                  <code v-for="commit in event.commits" :key="commit.hash"
                    ><b>{{ commit.hash }}</b
                    >{{ commit.subject }}</code
                  >
                </div>
                <footer>
                  <span v-if="event.agent"><Bot />{{ event.agent }}</span
                  ><span v-if="event.sessionId"
                    ><MessagesSquare />Session {{ event.sessionId }}</span
                  ><button v-if="event.sessionId">打开会话 <ChevronRight /></button>
                </footer>
              </article>
            </li>
          </ol>
        </div>
      </section>
    </main>
  </div>
</template>
<script setup lang="ts">
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  PlayCircle,
  Filter,
  FolderGit2,
  GitCommitHorizontal,
  MessagesSquare,
} from "lucide-vue-next";
const emit = defineEmits<{ "open-session": [sessionId: string] }>();
const groups = [
  {
    day: "今天",
    date: "8 月 3 日",
    events: [
      {
        id: 1,
        kind: "commit",
        time: "14:32",
        title: "完成 Todo 交互原型",
        project: "supervisor-web-ui",
        detail: "Session 完成后产生 3 条提交，包含 PC 双栏、移动端布局和依赖高亮。",
        agent: "Codex",
        sessionId: "128",
        commits: [
          { hash: "8a24c1e", subject: "feat: redesign todo workspace" },
          { hash: "44be719", subject: "feat: add dependency interactions" },
          { hash: "2dc80aa", subject: "test: cover responsive todo view" },
        ],
      },
      {
        id: 2,
        kind: "session",
        time: "11:08",
        title: "移动端 Session 详情开始执行",
        project: "supervisor-web-ui",
        detail: "Claude Code 正在调整移动端详情页的信息密度。",
        agent: "Claude Code",
        sessionId: "126",
      },
      {
        id: 3,
        kind: "task",
        time: "09:45",
        title: "助手模型设置已完成",
        project: "supervisor",
        detail: "统一助手模型配置已完成，相关后续任务可以开始。",
        agent: "Codex",
        sessionId: "123",
      },
    ],
  },
  {
    day: "昨天",
    date: "8 月 2 日",
    events: [
      {
        id: 4,
        kind: "commit",
        time: "18:20",
        title: "Supervisor 后端日结",
        project: "supervisor",
        detail: "完成 Watson runner、项目脚本和任务调度调整。",
        agent: "Codex",
        sessionId: "119",
        commits: [
          { hash: "4b612d0", subject: "refactor: use internal watson runner" },
          { hash: "9074af1", subject: "feat: start project scripts as jobs" },
        ],
      },
      {
        id: 5,
        kind: "task",
        time: "15:40",
        title: "项目脚本启动被阻塞",
        project: "supervisor",
        detail: "当前项目尚未配置可用执行 Agent，需要用户处理。",
        agent: "未分配",
      },
    ],
  },
];
</script>
<style scoped>
.dashboard {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--app-settings-bg);
  color: var(--app-text-primary);
}
.dashboard > header {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 18px;
  border-bottom: 1px solid var(--app-border);
}
h1 {
  font-size: 17px;
  font-weight: 680;
}
.dashboard > header p,
.timeline-head p {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.range {
  display: flex;
  padding: 3px;
  border-radius: 7px;
  background: var(--app-hover);
}
.range button {
  padding: 4px 8px;
  border-radius: 5px;
  color: var(--app-text-muted);
  font-size: 10px;
}
.range .active {
  background: var(--app-settings-card);
  color: var(--app-text-primary);
}
main {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 16px;
}
.overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  max-width: 1050px;
  margin: 0 auto 14px;
}
.overview article {
  display: grid;
  gap: 3px;
  padding: 13px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card);
}
.overview span {
  color: var(--app-text-secondary);
  font-size: 10px;
}
.overview strong {
  font-size: 22px;
}
.overview small {
  color: var(--app-text-muted);
  font-size: 9px;
}
.overview .good {
  color: #07964c;
}
.timeline {
  max-width: 1050px;
  margin: auto;
  padding: 15px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 11px;
  background: var(--app-settings-card);
}
.timeline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.timeline-head h2 {
  font-size: 14px;
  font-weight: 650;
}
.timeline-head button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  font-size: 10px;
}
.timeline svg {
  width: 13px;
}
.day-group {
  display: grid;
  grid-template-columns: 90px 1fr;
}
.day-group + .day-group {
  margin-top: 16px;
}
.day-label strong,
.day-label span {
  display: block;
}
.day-label strong {
  font-size: 12px;
}
.day-label span {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 9px;
}
ol {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  position: relative;
  display: grid;
  grid-template-columns: 28px 1fr;
  padding-bottom: 10px;
}
li:not(:last-child):before {
  content: "";
  position: absolute;
  left: 13px;
  top: 25px;
  bottom: -5px;
  width: 1px;
  background: var(--app-border);
}
.rail-icon {
  z-index: 1;
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 4px solid var(--app-settings-card);
  border-radius: 50%;
  background: #eaf2ff;
  color: #3b82f6;
}
.kind-commit .rail-icon {
  background: #e8f8ef;
  color: #07a65a;
}
.kind-task .rail-icon {
  background: #f4f1ff;
  color: #7c3aed;
}
li > article {
  margin-left: 8px;
  padding: 11px 12px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 9px;
  background: var(--app-settings-bg);
  cursor: default;
}
li > article:hover {
  border-color: color-mix(in srgb, #07c160 30%, var(--app-border));
  box-shadow: 0 3px 12px rgb(0 0 0/5%);
}
.event-top,
.event-top > div,
footer,
footer span,
.project {
  display: flex;
  align-items: center;
}
.event-top {
  justify-content: space-between;
  gap: 8px;
}
.event-top > div {
  gap: 8px;
}
.event-top strong {
  font-size: 12px;
}
.event-top > div span {
  color: var(--app-text-muted);
  font-size: 9px;
}
.project,
footer span {
  gap: 3px;
}
.project {
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  font-size: 9px;
}
li p {
  margin: 5px 0 8px;
  color: var(--app-text-secondary);
  font-size: 10px;
  line-height: 1.5;
}
.commits {
  display: grid;
  gap: 3px;
  margin: 7px 0;
  padding: 7px;
  border-radius: 6px;
  background: var(--app-settings-card);
}
.commits code {
  color: var(--app-text-secondary);
  font-size: 9px;
}
.commits b {
  margin-right: 8px;
  color: #078f49;
  font-weight: 500;
}
footer {
  gap: 12px;
  color: var(--app-text-muted);
  font-size: 9px;
}
footer button {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  color: #078f49;
  font-size: 9px;
}
@media (max-width: 640px) {
  .dashboard > header {
    min-height: 48px;
    padding: 7px 12px;
  }
  .dashboard > header p {
    display: none;
  }
  main {
    padding: 10px;
  }
  .overview {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .overview article {
    padding: 9px;
  }
  .overview strong {
    font-size: 18px;
  }
  .overview small {
    display: none;
  }
  .timeline {
    padding: 11px;
  }
  .day-group {
    display: block;
  }
  .day-label {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin: 12px 0 8px;
  }
  .day-label span {
    margin: 0;
  }
  .event-top {
    align-items: flex-start;
  }
  .project {
    display: none;
  }
  li > article {
    margin-left: 5px;
  }
  .commits code:nth-child(n + 3) {
    display: none;
  }
}
</style>
