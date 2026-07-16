export interface MockAgent {
  id: string;
  name: string;
  description: string;
  providerId: string;
  modelId: string;
  toolsPreset: "coding" | "readonly" | "none";
  homeDir: string;
  systemMd: string;
  category: string;
}

export const mockAgents: MockAgent[] = [
  {
    id: "frontend-dev",
    name: "Frontend Developer",
    description: "Vue 3 / React 组件开发，负责 UI 实现与迁移",
    providerId: "anthropic",
    modelId: "claude-sonnet-4-6",
    toolsPreset: "coding",
    homeDir: "~/.pi/supervisor/agents/frontend-dev",
    systemMd:
      "你是一名专注于现代前端开发的工程师。使用 Vue 3 Composition API 和 TypeScript。\n\n优先复用现有组件，保持与 supervisor-web-ui example 的微信风格一致。",
    category: "frontend",
  },
  {
    id: "css-specialist",
    name: "CSS Specialist",
    description: "Tailwind CSS 样式专家，负责视觉一致性",
    providerId: "anthropic",
    modelId: "claude-sonnet-4-6",
    toolsPreset: "coding",
    homeDir: "~/.pi/supervisor/agents/css-specialist",
    systemMd: "你专注于 Tailwind CSS 样式系统，确保组件与设计规范保持一致。",
    category: "frontend",
  },
  {
    id: "api-integrator",
    name: "API Integrator",
    description: "后端 HTTP 接口对接与 mock 数据替换",
    providerId: "openai",
    modelId: "gpt-4o",
    toolsPreset: "coding",
    homeDir: "~/.pi/supervisor/agents/api-integrator",
    systemMd: "你负责将 mock 数据替换为真实 API 调用，处理 SSE 流和错误状态。",
    category: "backend",
  },
  {
    id: "test-runner",
    name: "Test Runner",
    description: "运行 vitest / playwright 测试并修复失败用例",
    providerId: "deepseek",
    modelId: "deepseek-chat",
    toolsPreset: "coding",
    homeDir: "~/.pi/supervisor/agents/test-runner",
    systemMd: "你只运行测试、分析失败原因，并最小化改动修复测试，不做无关重构。",
    category: "qa",
  },
  {
    id: "backend-architect",
    name: "Backend Architect",
    description: "数据库 schema 设计、API 路由与迁移",
    providerId: "anthropic",
    modelId: "claude-sonnet-4-6",
    toolsPreset: "coding",
    homeDir: "~/.pi/supervisor/agents/backend-architect",
    systemMd: "你是后端架构师，负责 SQLite schema 设计、Hono 路由实现和数据迁移。",
    category: "backend",
  },
  {
    id: "general-assistant",
    name: "General Assistant",
    description: "通用问答和代码解释",
    providerId: "openrouter",
    modelId: "anthropic/claude-3.5-sonnet",
    toolsPreset: "readonly",
    homeDir: "~/.pi/supervisor/agents/general-assistant",
    systemMd: "你是一个通用助手，回答技术问题，解释代码，不做文件修改。",
    category: "general",
  },
];

export const agentCategories: Record<string, string> = {
  frontend: "前端",
  backend: "后端",
  qa: "测试",
  general: "通用",
};

export {
  mockStore,
  getAgentById,
  getAgentsByCategory,
  updateAgent,
  addAgent,
  getLinkedResourcesForAgent,
} from "./store";

import { getLinkedResourcesForAgent } from "./store";

export function getAgentResourceCount(agentId: string): number {
  return getLinkedResourcesForAgent(agentId).length;
}
