/** Flat session row — one row per session.
 * Chat panel uses `parentId` for nested trees (root → child → grandchild). */

import type { SessionBranchType } from '../utils/session-branch'

/** Align with `packages/supervisor` SessionStatus. */
export type SessionStatus = 'starting' | 'running' | 'idle' | 'error' | 'stopped'

export type { SessionBranchType }

export interface MockSession {
  id: string
  workspaceId: string
  /** Undefined = main session. */
  parentId?: string
  /** Built-in: spawn / fork / clone. */
  branchType?: SessionBranchType
  /** Agent definition this session was created from. */
  agentId?: string
  status: SessionStatus
  lastActiveAt: string
  meta: {
    name: string
    description?: string
  }
  /** Chat list preview */
  lastMessagePreview: string
  pinned?: boolean
  muted?: boolean
  unread?: number
}

export interface MockWorkspace {
  id: string
  name: string
}

export const mockWorkspaces: MockWorkspace[] = [
  { id: 'ws-pi', name: 'pi-mono' },
  { id: 'ws-my', name: 'my-project' },
]

export const mockSessions: MockSession[] = [
  {
    id: 'session-1',
    workspaceId: 'ws-pi',
    agentId: 'frontend-dev',
    status: 'running',
    lastActiveAt: new Date().toISOString(),
    meta: { name: 'Frontend Developer', description: '爷会话 · Vue 3 迁移主代理' },
    lastMessagePreview: '主代理任务结束。已 spawn API Integrator…',
    pinned: true,
    unread: 2,
  },
  {
    id: 'session-1-1',
    workspaceId: 'ws-pi',
    parentId: 'session-1',
    branchType: 'spawn',
    agentId: 'css-specialist',
    status: 'idle',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    meta: {
      name: 'CSS Specialist',
      description: 'spawn 子代理 · 无继承消息',
    },
    lastMessagePreview: '样式已更新，与主会话中的微信绿色气泡一致。',
  },
  {
    id: 'session-1-2',
    workspaceId: 'ws-pi',
    parentId: 'session-1',
    branchType: 'spawn',
    agentId: 'api-integrator',
    status: 'running',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    meta: {
      name: 'API Integrator',
      description: 'spawn 子代理',
    },
    lastMessagePreview: '已 spawn Test Runner 子代理…',
  },
  {
    id: 'session-1-2-1',
    workspaceId: 'ws-pi',
    parentId: 'session-1-2',
    branchType: 'spawn',
    agentId: 'test-runner',
    status: 'running',
    lastActiveAt: new Date(Date.now() - 1000 * 45).toISOString(),
    meta: {
      name: 'Test Runner',
      description: 'spawn 孙代理',
    },
    lastMessagePreview: 'npm test: 12 passed, 0 failed',
  },
  {
    id: 'session-1-fork',
    workspaceId: 'ws-pi',
    parentId: 'session-1',
    branchType: 'fork',
    agentId: 'frontend-dev',
    status: 'idle',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    meta: {
      name: 'Vue Fork (纯 CSS)',
      description: 'fork · 继承至 edit 完成',
    },
    lastMessagePreview: '已改用手写 CSS，放弃 Tailwind。',
  },
  {
    id: 'session-1-clone',
    workspaceId: 'ws-pi',
    parentId: 'session-1',
    branchType: 'clone',
    agentId: 'frontend-dev',
    status: 'idle',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    meta: {
      name: 'Frontend Clone',
      description: 'clone · 全量继承 + 新追问',
    },
    lastMessagePreview: '（克隆会话）能否把 Button 抽成通用 BaseButton？',
  },
  {
    id: 'session-2',
    workspaceId: 'ws-pi',
    agentId: 'backend-architect',
    status: 'stopped',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    meta: { name: 'Backend Architect', description: '数据库 schema · 迁移' },
    lastMessagePreview: 'Tests: 12 passed',
  },
  {
    id: 'session-stream',
    workspaceId: 'ws-pi',
    agentId: 'frontend-dev',
    status: 'running',
    lastActiveAt: new Date().toISOString(),
    meta: { name: 'Streaming Demo', description: '流式 SSE · bash/read/edit/write' },
    lastMessagePreview: '发送消息：流式文本 + 工具调用逐步出现',
    pinned: true,
  },
  {
    id: 'session-4',
    workspaceId: 'ws-pi',
    status: 'idle',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    meta: { name: 'Long Session', description: '长对话 · 上下文压缩' },
    lastMessagePreview: '已添加 session-4 compaction 示例。',
  },
  {
    id: 'session-3',
    workspaceId: 'ws-my',
    agentId: 'general-assistant',
    status: 'idle',
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    meta: { name: 'General Assistant', description: '问答' },
    lastMessagePreview: 'Supervisor 默认工具集与 pi 相同：read / write / edit / bash',
  },
]

export {
	mockStore,
	getSessionById,
	getSessionsByAgentId,
	getWorkspaceName,
	groupSessionsByWorkspace,
	updateSession,
	updateSessionMeta,
	addSession,
	getSessionMessages,
	appendSessionMessage,
	updateSessionPreview,
} from './store'

