import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Pi Supervisor Docs",
  description: "Standalone pi-supervisor + web-ui 文档",
  lang: "zh-CN",
  lastUpdated: true,
  cleanUrls: true,
  head: [["meta", { name: "theme-color", content: "#3c8cff" }]],
  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/getting-started" },
      { text: "Supervisor", link: "/supervisor/overview" },
      { text: "Web UI", link: "/web-ui/overview" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "开始",
          items: [
            { text: "快速开始", link: "/guide/getting-started" },
            { text: "架构总览", link: "/guide/architecture" },
            { text: "CLI 命令", link: "/guide/cli" },
          ],
        },
      ],
      "/supervisor/": [
        {
          text: "Supervisor 后端",
          items: [
            { text: "概览", link: "/supervisor/overview" },
            { text: "会话管理", link: "/supervisor/session" },
            { text: "Job", link: "/supervisor/jobs" },
            { text: "工作流", link: "/supervisor/workflow" },
            { text: "子代理", link: "/supervisor/subagents" },
            { text: "Shadow", link: "/supervisor/shadow" },
            { text: "外部 Agent", link: "/supervisor/external-agents" },
            { text: "HTTP API", link: "/supervisor/http-api" },
            { text: "扩展框架", link: "/supervisor/extensions" },
            { text: "仓库扩展", link: "/supervisor/shipped-extensions" },
            { text: "打包工具", link: "/supervisor/builtin-tools" },
            { text: "MCP 集成", link: "/supervisor/mcp" },
            { text: "上下文压缩", link: "/supervisor/compaction" },
            { text: "AI 效果测试", link: "/supervisor/ai-testing" },
          ],
        },
      ],
      "/web-ui/": [
        {
          text: "Web UI 前端",
          items: [
            { text: "概览", link: "/web-ui/overview" },
            { text: "路由", link: "/web-ui/routes" },
            { text: "Chat 子系统", link: "/web-ui/chat" },
            { text: "Agent 配置", link: "/web-ui/agents" },
            { text: "Provider 配置", link: "/web-ui/providers" },
            { text: "资源管理", link: "/web-ui/resources" },
            { text: "Pinia Stores", link: "/web-ui/stores" },
            { text: "已知缺口", link: "/web-ui/known-gaps" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/" }],
    footer: {
      message: "MIT License",
    },
    outline: { level: [2, 3] },
    search: { provider: "local" },
    docFooter: { prev: "上一页", next: "下一页" },
    darkModeSwitchLabel: "主题",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "回到顶部",
  },
});
