# 移除 pi-coding-agent 依赖计划

本文只记录未来计划，暂不执行代码修改。

## 背景

当前 `packages/supervisor` 依赖 `@earendil-works/pi-coding-agent`，不是只用了 4 个工具文件。

实际引入范围包括：

```text
default-tools.ts:
  createCodingTools
  createReadOnlyTools
  SettingsManager
  ToolsOptions

session-manager.ts:
  AuthStorage
  ModelRegistry
```

所以未来移除依赖时，不能只处理 `read/bash/edit/write`。需要把工具、工具配置、认证存储、模型注册表、类型引用一起拆掉。

## 当前问题

### 1. keepPiNativeTools() 过滤过度

`pi-coding-agent` 的工具集合是：

```text
coding:
  read / bash / edit / write

readonly:
  read / grep / find / ls

all:
  read / bash / edit / write / grep / find / ls
```

但 `supervisor` 当前通过 `keepPiNativeTools()` 只保留：

```text
read / bash / edit / write
```

这导致 `toolsPreset: "readonly"` 原本应该有：

```text
read / grep / find / ls
```

最终只剩：

```text
read
```

这个过滤未来不应保留。`grep/find/ls` 不应该被舍弃，它们应该作为 supervisor 原生只读搜索工具保留。

### 2. SettingsManager / ToolsOptions 泄漏了 pi 配置模型

当前默认工具创建依赖：

```text
SettingsManager
ToolsOptions
```

这意味着 supervisor 的默认工具配置仍然被 `pi-coding-agent` 的配置结构影响。

未来应改成 supervisor 自己的工具配置类型，例如：

```text
SupervisorToolOptions
  cwd
  shellPath
  commandPrefix
  timeoutMs
  maxOutputChars
  ignoreGlobs
```

### 3. AuthStorage / ModelRegistry 是额外核心依赖

当前 `SessionManager` 创建了：

```text
AuthStorage
ModelRegistry
```

但仓库内基本没有实际使用 `getModelRegistry()`。

这部分不是工具功能，却会阻止删除 `@earendil-works/pi-coding-agent` 依赖。未来需要明确处理：

```text
AuthStorage:
  删除，或迁移成 supervisor 自己的 provider credential 存储。

ModelRegistry:
  删除，或迁移成 supervisor 自己的 providers/models 表访问层。

getModelRegistry():
  如果没有调用方，直接移除。
  如果未来需要模型注册能力，改成 ctx.db.providers / ctx.db.models。
```

### 4. 类型引用也要清理

未来删除依赖前，要检查所有类型引用：

```text
ToolsOptions
ModelRegistry
AuthStorage
```

目标是：

```text
rg "@earendil-works/pi-coding-agent" packages/supervisor
```

无结果。

## 目标

最终移除：

```json
"@earendil-works/pi-coding-agent": "^0.74.0"
```

并由 supervisor 自己提供：

```text
默认工具:
  read / bash / edit / write / grep / find / ls

工具 access:
  read/search/inspect/write/edit/shell/dangerous

工具 policy:
  coding / readonly / none / 子代理自定义策略

工具配置:
  SupervisorToolOptions

模型和认证:
  supervisor 自己的 db/providers/models/credentials 能力
```

目标工具集合：

```text
coding:
  read / bash / edit / write / grep / find / ls

readonly:
  read / grep / find / ls

none:
  []
```

后续再通过 `ToolAccess` 和 `ToolPolicy` 控制不同 session / 子代理实际可用工具。

## 不做什么

不要直接原样复制 `pi-coding-agent` 的 4 个工具文件。

原因：

```text
工具文件不是孤立的。
read / bash / edit / write 会依赖路径处理、截断、shell、队列、渲染、TUI 等内部模块。
直接复制容易把 pi-coding-agent 的内部依赖也复制过来。
```

正确方向：

```text
参考 pi-coding-agent 行为。
实现 supervisor-native tools。
删除 TUI / interactive 依赖。
保留 headless/server 场景真正需要的逻辑。
补上 access 和 policy。
```

## 新模块建议

```text
packages/supervisor/src/tools/
  access.ts
  policy.ts
  default-tools.ts
  options.ts
  path-utils.ts
  truncate.ts
  read.ts
  grep.ts
  find.ts
  ls.ts
  bash.ts
  edit.ts
  write.ts
  shell-settings.ts
  file-mutation-queue.ts

packages/supervisor/src/core/
  model-registry.ts      可选，只有确实需要时再加
  credential-store.ts    可选，只有确实需要时再加
```

其中：

```text
access.ts            定义 ToolAccess / ToolAccessSpec
policy.ts            定义 ToolPolicy
default-tools.ts     createDefaultTools()
options.ts           替代 ToolsOptions
shell-settings.ts    替代 SettingsManager 的 shell 配置读取
model-registry.ts    替代 ModelRegistry，或直接删除相关能力
credential-store.ts  替代 AuthStorage，或直接删除相关能力
```

## 工具 access 设计

默认 access：

```text
read:
  level = read
  tags = [read]

grep:
  level = read
  tags = [search]

find:
  level = read
  tags = [search]

ls:
  level = read
  tags = [inspect]

edit:
  level = write
  tags = [edit]

write:
  level = write
  tags = [write]

bash:
  level = dangerous
  tags = [shell]
```

子代理可通过 policy 控制：

```text
review/explore 子代理:
  允许 read/search/inspect
  禁止 write/edit/shell/agent

coder 子代理:
  允许 read/write/edit
  bash 需要显式授权
```

## 分阶段计划

### Phase 1：保留依赖，但修正工具策略

暂不移除 `pi-coding-agent`。

先做：

- 去掉或调整 `keepPiNativeTools()`。
- 让 `readonly` 保留 `read/grep/find/ls`。
- 明确 `coding` 是否也加入 `grep/find/ls`。
- 给现有工具包装 `access`。
- 引入 `ToolPolicy`，用 policy 控制子代理工具，而不是靠工具名硬过滤。

验收：

```text
createDefaultTools(cwd, "readonly") 返回 read / grep / find / ls。
review 子代理通过 ToolPolicy 禁止 edit / write / bash / Agent。
```

### Phase 2：替换 SettingsManager / ToolsOptions

当前 `default-tools.ts` 依赖：

```text
SettingsManager
ToolsOptions
```

未来处理：

- 新增 `SupervisorToolOptions`。
- 新增 supervisor 自己的 shell 配置读取逻辑。
- 保留必要字段：`shellPath`、`commandPrefix`、`timeoutMs`、输出截断配置。
- 不再把 pi 的 `ToolsOptions` 暴露到 supervisor API。

验收：

```text
packages/supervisor/src/utils/default-tools.ts 不再 import SettingsManager / ToolsOptions。
```

### Phase 3：替换 AuthStorage / ModelRegistry

当前 `SessionManager` 创建了：

```text
AuthStorage
ModelRegistry
```

未来处理：

- 检查 `getModelRegistry()` 是否还有调用方。
- 如果没有调用方，删除 `modelRegistry` 字段和 `getModelRegistry()`。
- 如果需要保留模型注册能力，改成 supervisor 自己的 `providers/models` 表访问层。
- 如果需要认证存储，改成 supervisor 自己的 credential store，不再复用 pi 的 `auth.json`。

验收：

```text
packages/supervisor/src/core/session-manager.ts 不再 import AuthStorage / ModelRegistry。
rg "getModelRegistry" packages/supervisor 只剩必要的新实现，或无结果。
```

### Phase 4：实现 supervisor-native readonly tools

先实现只读工具：

```text
read
grep
find
ls
```

原因：

```text
只读工具风险低。
子代理和 review/explore 最先需要它们。
```

实现要求：

- 支持 cwd 内相对路径。
- 支持绝对路径安全校验。
- 支持输出截断。
- 支持 ignore / node_modules / .git 基础过滤。
- Windows 可用。

验收：

```text
toolsPreset="readonly" 不依赖 pi-coding-agent。
read / grep / find / ls 测试通过。
```

### Phase 5：实现 supervisor-native write tools

实现：

```text
edit
write
```

实现要求：

- 文件写入串行化，避免并发写坏。
- `edit` 有明确匹配失败错误。
- `write` 支持新建文件和覆盖文件。
- 写入操作能被 turn-file-tracker 追踪。

验收：

```text
edit/write 集成测试通过。
turn-file-tracker 能记录变更。
```

### Phase 6：实现 supervisor-native bash

实现：

```text
bash
```

实现要求：

- 必须保留 `intent` 参数。
- 支持 shellPath / commandPrefix。
- 支持 timeout。
- 支持 abort signal。
- 支持 Windows。
- 支持输出截断。
- 默认 access 为 dangerous。

验收：

```text
bash 可以执行普通命令。
bash 缺少 intent 会报错。
abort 能中止命令。
超时能结束命令。
```

### Phase 7：替换 default-tools.ts

将：

```text
createCodingTools
createReadOnlyTools
SettingsManager
ToolsOptions
```

替换为 supervisor 自己的实现。

新的语义：

```text
coding:
  read / bash / edit / write / grep / find / ls

readonly:
  read / grep / find / ls

none:
  []
```

验收：

```text
packages/supervisor/src/utils/default-tools.ts 不再 import @earendil-works/pi-coding-agent。
```

### Phase 8：删除 package dependency

最后删除：

```json
"@earendil-works/pi-coding-agent": "^0.74.0"
```

并运行：

```text
pnpm install
pnpm run check
pnpm run test
```

验收：

```text
rg "@earendil-works/pi-coding-agent" packages/supervisor
```

无结果。

## 风险

### 1. 工具行为不一致

自研工具可能和 `pi-coding-agent` 行为不同，导致模型习惯和测试变化。

应对：

```text
先保持参数 schema 尽量兼容。
先迁移 readonly 工具。
分阶段替换。
```

### 2. bash 跨平台复杂

Windows / PowerShell / Git Bash / WSL 行为可能不同。

应对：

```text
保留 shellPath / commandPrefix。
增加 Windows 测试。
输出截断和 abort 单独测试。
```

### 3. edit 并发写入

多个工具调用同时改文件会有风险。

应对：

```text
实现 file mutation queue。
同一路径写入串行执行。
```

### 4. AuthStorage / ModelRegistry 删除过早

如果外部还有隐藏调用方，直接删除会破坏兼容。

应对：

```text
先用 rg 确认内部调用。
对公开 API 做 deprecate 周期。
必要时提供 supervisor-native 替代类。
```

### 5. 过早删除依赖

如果还没补齐测试就删除依赖，容易引入行为回退。

应对：

```text
先 wrapper。
再逐个 native tool 替换。
最后删依赖。
```

## 结论

未来有必要移除 `pi-coding-agent` 依赖，但移除范围包括：

```text
read/bash/edit/write/grep/find/ls
SettingsManager
ToolsOptions
AuthStorage
ModelRegistry
```

推荐路线：

```text
先修正 readonly 工具集合，保留 grep/find/ls。
再补 access / policy。
然后替换 SettingsManager / ToolsOptions。
再处理 AuthStorage / ModelRegistry。
逐步实现 supervisor-native tools。
最后删除 pi-coding-agent 依赖。
```
