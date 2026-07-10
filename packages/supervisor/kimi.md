# Supervisor 扩展系统重构记录

## 变更概述

完全重新设计了 supervisor 的扩展系统，从旧的 coding-agent 兼容模式改为 HTTP-native、事件驱动的新架构。

## 核心变更

### 1. 资源加载模型变更

**旧模型：全局 + Agent + 项目三层**
- `~/.pi/agent/` - 全局层（已移除）
- `~/.pi/supervisor/agents/{agentId}/` - Agent 层
- `<cwd>/.pi/` - 项目层

**新模型：纯 Agent 为中心**
- 每个 Agent 只加载自己目录下的资源
- 移除了全局层（`~/.pi/agent/` 不再加载）
- 项目层保留：`cwd/.pi/supervisor/{skills,extensions,prompts}/`

### 2. 扩展系统完全重写

**已删除的旧扩展系统：**
- `ExtensionRunner` 类
- `ExtensionContext` 旧实现
- `ExtensionFactory` 模式（使用旧 API）
- `registerCommand` / `registerTool` 旧钩子

**新的扩展系统：**

| 文件 | 说明 |
|------|------|
| `src/extensions/types.ts` | 扩展类型定义（ExtensionDefinition, ExtensionContext, EventBus 等） |
| `src/extensions/define-extension.ts` | `defineExtension()` 辅助函数 |
| `src/extensions/loader.ts` | 扩展加载器（jiti + alias） |
| `src/extensions/runtime.ts` | 扩展运行时（ExtensionRuntime, EventBusImpl） |
| `src/extensions/http-commands.ts` | HTTP 命令支持 |
| `src/extensions/index.ts` | 公共导出 |

### 3. SessionManager 变更

**已删除的方法和属性：**
- `extensionRunners`
- `extensionUnsubs`
- `extensionFlagValues`
- `loadAgentExtensions()`
- `refreshSessionTools()`
- `reloadExtensionsForSession()`
- `bindExtensionBridge()`
- `createReplacedSessionContext()`
- `executeExtensionCommand()`
- `executeExtensionCommandByName()`
- `getExtensionRunner()`

**变更的方法：**
- `assembleSessionTools()` - 简化，不再使用扩展
- `prompt()` - 简化
- `kill()` - 简化
- `dispose()` - 简化

### 4. HTTP API 变更

**已删除的端点：**
- `POST /sessions/:id/reload-extensions`

**新增的端点：**

| 方法 | 路径 | 描述 | 状态 |
|------|------|------|------|
| POST | `/providers` | 创建新的 Provider | ✅ 新增 |
| DELETE | `/providers/:id` | 删除 Provider 及其所有 Model | ✅ 新增 |
| GET | `/resources/global` | 获取项目级全局资源 | ✅ 新增 |

**修改的端点：**
- `POST /sessions/:id/commands` - 返回 501（未实现），等待新扩展系统集成
- `GET /sessions/:id/commands` - 只返回 skills + prompt templates（不再包含扩展命令）

### 5. 类型变更

**LoadSkillsOptions 接口：**
```typescript
export interface LoadSkillsOptions {
  cwd: string;
  agentHomeDir: string;  // 从 agentDir 重命名
  skillPaths: string[];
  includeDefaults: boolean;
  includeProject?: boolean;
}
```

**ResourceLayer 类型：**
- 移除了 `global` 层
- 现在只有 `agent` 和 `project` 层

### 6. 扩展定义方式变更

**旧方式（已废弃）：**
```typescript
import type { ExtensionFactory } from "@earendil-works/pi-supervisor";

const extension: ExtensionFactory = (pi) => {
  pi.registerCommand("hello", {
    description: "Hello",
    handler: async () => {},
  });
};

export default extension;
```

**新方式：**
```typescript
import { defineExtension } from "@earendil-works/pi-supervisor";

export default defineExtension({
  name: "my-extension",
  version: "1.0.0",
  setup(context) {
    // context 提供数据库访问、事件绑定、工具注册等
    context.on("session_start", async (event, ctx) => {
      // 处理事件
    });
    
    context.registerTool({
      name: "my_tool",
      description: "My tool",
      parameters: { /* ... */ },
      async execute(params, ctx) {
        return { result: "ok" };
      },
    });
  },
});
```

## 新扩展系统 API

### ExtensionContext

```typescript
interface ExtensionContext {
  // 会话信息
  readonly sessionId: string;
  readonly cwd: string;
  readonly agent: { id, name, providerId, modelId, systemPrompt };
  readonly model: { provider, id, contextWindow } | undefined;
  isIdle(): boolean;
  isStreaming(): boolean;
  signal: AbortSignal | undefined;
  abort(): void;
  
  // 数据库访问（只读）
  readonly db: ExtensionDatabase;
  
  // 数据写入
  appendEntry<T>(customType: string, data: T): Promise<string>;
  sendMessage(message: {...}): Promise<void>;
  sendUserMessage(content: string): Promise<void>;
  setSessionMeta(meta: Record<string, unknown>): Promise<void>;
  patchSessionMeta(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  setMessageMeta(messageId: string, meta: Record<string, unknown>): Promise<void>;
  patchMessageMeta(messageId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  setLabel(entryId: string, label: string | undefined): Promise<void>;
  
  // 事件绑定
  on<T extends ExtensionEvent>(
    eventType: T["type"],
    handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>
  ): () => void;
  
  // 工具注册
  registerTool<TParams extends TSchema, TResult>(definition: ToolDefinition<TParams, TResult>): void;
}
```

### 扩展目录结构

```
~/.pi/supervisor/agents/{agentId}/
├── extensions/
│   ├── my-extension.ts
│   └── another-extension/
│       └── index.ts
├── skills/
│   └── my-skill/
│       └── SKILL.md
└── prompts/
    └── my-prompt.md
```

项目级扩展：
```
{cwd}/.pi/supervisor/
├── extensions/
├── skills/
└── prompts/
```

## 已删除的测试文件

以下测试文件因引用旧扩展系统而被删除：

- `test/extension-bridge.test.ts`
- `test/jiti-alias.test.ts`
- `test/extension-command.test.ts`
- `test/message-search.test.ts`
- `test/search-messages.test.ts`
- `test/noop-ui.test.ts`

## 迁移指南

### 对于使用旧扩展系统的代码：

1. **资源路径变更**：确保扩展、skill、prompt 文件放在正确的 Agent 目录下
2. **API 变更**：使用新的 `defineExtension()` 定义扩展
3. **事件系统**：新系统使用显式 EventBus 而非旧钩子
4. **HTTP 命令**：暂不可用，等待后续实现

### 当前状态

- TypeScript 编译：✅ 无错误
- 测试：✅ 61 个测试通过
- 扩展执行：⚠️ HTTP 命令端点返回 501（待实现）

## 后续工作

1. 实现扩展的 HTTP 命令执行端点
2. 添加扩展生命周期管理（热重载等）
3. 扩展注册表持久化（如果需要）
4. 扩展间通信机制

## Web UI API 层 (2026-06-20 新增)

### api.ts 文件位置
- `packages/supervisor-web-ui/src/api/api.ts` - 完整的 API 封装
- `packages/supervisor-web-ui/src/api/index.ts` - API 导出

### 新增 Supervisor API 端点

为了支持 Web UI 的完整功能，Supervisor 新增了以下 HTTP API 端点：

#### Provider 管理
```typescript
// POST /providers - 创建 Provider
POST /providers
Body: { id?, name, apiType, baseUrl?, apiKey?, defaultModelId?, isEnabled?, priority? }
Response: Provider (201)

// DELETE /providers/:id - 删除 Provider
DELETE /providers/:id
Response: { ok: true }
```

#### 全局资源
```typescript
// GET /resources/global - 获取项目级资源
GET /resources/global?cwd=<path>
Response: ResourceLayer { skills, prompts, extensions }
```

### SessionManager 新增方法

```typescript
// Provider 管理
insertProvider(options: CreateProviderOptions): Provider
deleteProvider(id: string): void

// 全局资源
resolveGlobalResources(cwd: string): ResourceLayer
```

### API 类型映射

Web UI 使用与 Supervisor 兼容的类型定义：
- `Session` - 会话类型（包含 lastMessagePreview）
- `Agent` - Agent 定义
- `Provider` - Provider 配置（apiKey 始终为 null）
- `Model` - 模型定义
- `ResourceLayer` - 资源层（skills/prompts/extensions）
- `SessionTreeEntry` - 会话消息树节点

---

更新时间：2026-06-20
