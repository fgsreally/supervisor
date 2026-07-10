# Supervisor Web UI 测试文档

## 测试结构

### 1. 单元测试 (Vitest + @vue/test-utils)

```
src/
├── store/__tests__/store.test.ts     # Store 单元测试
├── api/__tests__/api.integration.test.ts  # API 集成测试
└── utils/test-utils.ts               # 测试工具
```

运行单元测试:
```bash
npm test              # 运行一次
npm run test:watch    # 监听模式
```

### 2. E2E 测试 (Playwright)

```
e2e/
└── supervisor.spec.ts    # 端到端测试
```

运行 E2E 测试:
```bash
npm run test:e2e      # 运行 E2E 测试
```

## 测试覆盖率

### Store 测试 (12 个测试)

✅ Session Store
- fetchSessions - 获取会话列表
- fetchSession - 获取单个会话
- createSession - 创建会话
- deleteSession - 删除会话
- updateSessionMeta - 更新会话元数据

✅ Agent Store
- fetchAgents - 获取 Agent 列表
- fetchAgentResources - 获取 Agent 资源
- updateAgentSystemMd - 更新系统提示词

✅ Provider Store
- fetchProviders - 获取 Provider 列表（带 activeModelId 映射）
- createProvider - 创建 Provider
- deleteProvider - 删除 Provider
- manageModels - 模型管理

### API 集成测试

- healthCheck - 健康检查
- listSessions - 会话列表
- createAndDeleteSession - 创建和删除会话
- listAgents - Agent 列表
- listProviders - Provider 列表（验证 apiKey 被剥离）
- getGlobalResources - 全局资源

### E2E 测试

- Session Management - 会话管理
- Agent Management - Agent 管理
- Provider Management - Provider 管理
- Resource Management - 资源管理
- API Integration - API 集成验证

## 测试数据

使用 `createMock*` 工厂函数创建测试数据:

```typescript
import { createMockSession, createMockAgent, createMockProvider } from '@/utils/test-utils'

const session = createMockSession({ status: 'running' })
const agent = createMockAgent({ name: 'Test Agent' })
const provider = createMockProvider({ apiType: 'openai-compatible' })
```

## Mock API

使用 `vi.mock` 模拟 API 调用:

```typescript
vi.mock('@/api', () => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
  // ...
}))

vi.mocked(api.listSessions).mockResolvedValue([mockSession])
```

## E2E 测试环境

启动测试环境:
```bash
# 1. 启动 Supervisor 后端
cd packages/supervisor
npm run dev

# 2. 启动 Web UI 开发服务器
cd packages/supervisor-web-ui
npm run dev

# 3. 运行 E2E 测试
npm run test:e2e
```

## 持续集成

建议在 CI 中运行:
```bash
npm run check    # TypeScript 类型检查
npm test         # 单元测试
npm run build    # 生产构建
```

E2E 测试需要在后台服务运行时执行。
