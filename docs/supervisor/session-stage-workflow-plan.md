# Session 阶段工作流计划

## 目标

在不改变 Supervisor 现有 `Project -> Session -> Agent` 结构的前提下，为 Session 增加可配置的阶段式工作流。不同阶段向当前 Agent 注入不同提示词和约束，使严格 SDD、自由 Compose 或用户自定义流程都能复用同一套机制。

本计划只定义实现方向，暂不实现代码。

## 核心设计

工作流不是新的一级实体。一次工作流运行仍然属于 Session，当前状态保存在 Session Meta：

```ts
interface SessionWorkflowMeta {
  template: string;
  stage: string;
  status: "working" | "waiting_approval" | "completed" | "cancelled";
  revision: number;
  artifacts?: Array<{
    type: string;
    path: string;
    status?: "draft" | "approved" | "completed";
  }>;
}

interface SessionMeta {
  workflow?: SessionWorkflowMeta;
}
```

- `template` 指向工作流模板，例如 `strict-sdd`、`compose` 或用户自定义模板。
- `stage` 是模板内的阶段标识，不在 Supervisor 核心中写死阶段名称。
- `status` 表示当前阶段是否正在执行、等待确认或已经结束。
- `revision` 用于避免重复或过期的阶段切换。
- `artifacts` 只保存产物引用和状态，不把文档正文塞进 Meta。

## 工作流模板

模板描述流程能力，而不是创建新的运行时层级。建议包含：

```yaml
id: strict-sdd
name: Strict SDD
initialStage: brainstorm
commonPrompt: prompts/common.md
stages:
  brainstorm:
    prompt: prompts/brainstorm.md
    allowedTools: [read, search, write_artifact, complete_stage]
    requiredArtifacts: [proposal]
    next: design
    approval: required
  design:
    prompt: prompts/design.md
    requiredArtifacts: [design]
    next: spec
    approval: required
```

模板中的阶段可自由增加、删除和排序。严格 SDD 可以要求每一步审批；自由 Compose 可以允许 Agent 自主切换；普通 Session 可以完全不启用工作流。

模板和提示词遵守资源归属规则：

- Agent 专用模板放在 Agent 专属目录。
- Project 专用模板放在 Project 专属目录。
- 单次 Session 的覆盖配置和运行产物放在 Session 专属目录。
- 内置模板随 Supervisor 发布，但运行时产物仍写入具体 Session 目录。

查找优先级建议为：Session 覆盖 > Agent 模板 > Project 模板 > 内置模板。

## Agent 提示词注入

每次 Agent 开始一轮执行前，扩展读取 `session.meta.workflow` 和对应模板，动态组装：

```text
Agent 基础提示词
+ 工作流公共提示词
+ 当前阶段提示词
+ 当前阶段规则和完成标准
+ 已有产物路径及状态
```

阶段变化后，下一轮自动使用新阶段提示词，无需创建新 Agent 或新 Session。没有 `meta.workflow` 时保持现有行为。

提示词负责引导，不能单独承担强约束。扩展还需要根据模板提供最薄的一层运行时控制：

- 过滤当前阶段不允许使用的工具。
- 校验阶段要求的产物是否存在。
- 提供仅供 Agent 使用的 `complete_stage` 工具。
- 需要用户确认时创建 Approval，不能直接推进阶段。
- Approval 通过后由扩展原子更新 `stage`、`status` 和 `revision`。
- Web UI 不提供直接写入阶段或任务状态的接口。

## 产物与任务

阶段本身不是 Todo、Goal 或 Plan 的另一种形式。一个 Session 可以同时存在：

- `meta.workflow`：当前流程、阶段和阶段状态。
- `meta.tasks`：Goal、Plan 等 Markdown 产物路径。
- `meta.todos`：Agent 管理的结构化 Todo 状态。
- `meta.workflow.artifacts`：proposal、design、spec、mockup、测试报告、录屏等阶段产物引用。

正文继续保存在文件中，Meta 只做索引。所有单次流程产物默认写入 Session 专属目录；明确属于项目长期规范的内容只在归档阶段合并到 Project 专属目录。

## Web UI

Web UI 只读取工作流状态和产物：

- 会话有活动工作流时显示阶段标签。
- 桌面端任务视窗展示当前模板、阶段、完成标准和产物列表。
- 已完成阶段置灰，当前阶段高亮，未到达阶段保持只读。
- 点击产物打开现有任务/资源查看能力；视频产物复用消息 `assets` 渲染。
- 阶段需要确认时复用 Approval 交互。UI 提交的是审批结果，不直接修改 `session.meta.workflow.stage`。
- 工作流完成或取消后不再作为活动任务展示，但历史状态和产物仍可查看。

## 首个内置模板：Strict SDD

首个模板参考仓库根目录 `my-problem.md`，初步阶段为：

1. Brainstorm：澄清产品目标、用户和边界。
2. Design：确认技术方向和结构约束。
3. Spec：形成可验证的 Requirement 与 Scenario。
4. Mockup：为 UI、API 或 CLI 生成可审阅的小样。
5. Planning：拆分有限、明确且带文件范围的 change。
6. Test：先依据 Spec 编写测试，不从实现反推测试。
7. Implement / Verify：由程序驱动测试循环，Agent 修改实现并完成业务与结构验证。
8. Archive：合并长期规范，归档本次 change。

阶段名称和顺序属于模板，不进入 Supervisor 核心枚举。后续用户可以复制模板并修改阶段、提示词、产物要求、审批策略和工具权限。

## 实施步骤

### 第一阶段：状态与模板读取

- 定义 `SessionWorkflowMeta` 的解析、校验和兼容策略。
- 增加内置模板加载器以及 Session、Agent、Project 覆盖查找。
- 确保 Session 持久化、恢复和外部 Agent 路径都能读取同一状态。
- 为模板校验、查找优先级和非法阶段补充测试。

### 第二阶段：提示词和工具约束

- 在 Agent 每轮执行前注入当前阶段上下文。
- 根据阶段限制可见工具，不修改现有工具实现。
- 增加 `complete_stage`，校验产物和目标阶段。
- 通过现有 Approval 流程完成需要确认的阶段切换。
- 覆盖重复提交、过期 revision、中断恢复和拒绝审批测试。

### 第三阶段：产物和 Strict SDD 模板

- 统一阶段产物引用格式，并复用现有安全文件访问接口。
- 实现 Strict SDD 内置模板及各阶段提示词。
- 将测试报告、截图和录屏作为产物引用关联到阶段或消息 assets。
- 验证所有运行产物遵守 Session > Agent/Project 的目录归属规则。

### 第四阶段：Web UI

- 增加只读阶段标签和阶段视窗。
- 同时展示工作流阶段、Goal/Plan、Todo 和多种阶段产物。
- 复用 Approval 完成用户确认，不开放工作流状态写接口。
- 增加桌面分栏、移动端抽屉和已完成工作流历史展示测试。

### 第五阶段：自定义模板

- 在 CLI `config` 中提供模板选择和模板目录配置。
- 支持基于内置模板复制后修改，不要求用户理解 Supervisor 内部实现。
- 增加模板版本和迁移策略，避免模板更新破坏正在运行的 Session。

## 验收标准

- 不启用工作流的 Session 行为完全不变。
- 启用工作流后，同一个 Session、同一个 Agent 能随 `stage` 使用不同提示词。
- Supervisor 核心不包含 Brainstorm、Spec 等固定阶段枚举。
- 严格模板不能绕过必需产物和用户 Approval；自由模板可以配置自主推进。
- UI 不能直接写任务、Todo 或工作流阶段状态。
- Session 恢复后阶段、审批等待状态和产物引用一致。
- 运行时文件不写入项目工作目录，除非用户或模板明确将归档目标设为 Project 资源。

## 暂不包含

- 不新增独立 Workflow 数据表或一级运行时实体。
- 不用工作流替代 Session、Agent、Goal、Plan 或 Todo。
- 不在第一版提供任意代码执行式模板；模板只描述声明式阶段和约束。
- 不默认强制创建 sub-agent；是否使用及用途由模板明确声明。
