# 已知未实装功能

以下功能在 `intro.html` 中有描述，但在 `src/` 中没有对应的 UI 实现。

## 1. 中止运行 / Steer / Follow-up 按钮

- `intro.html` 标注 `Web UI 未接入`
- 后端 API：`POST /sessions/:id/abort`、`/steer`、`/follow-up` **都已实现**（`http-server.ts`）/ `getSessionState` 也返回 `isRunning`、`canSteer` 等状态
- UI：`ChatInputToolbar.vue` 和 `ChatView.vue`**没有中止按钮**，agent 运行中用户无法干预
- **修复建议**：在 `ChatInputToolbar.vue` 加一个停止按钮（当 `session.isRunning` 时显示），调用 `api.abortSession(id)`

## 2. Slash 命令 UI 未加

- 后端 API：`GET /sessions/:id/commands` 存在（但返回 501），`api.getSessionCommands` 存在
- UI：`ChatComposer.vue` 支持 `/` skill/prompt 补全，但没有专门的 slash 命令执行面板
- 注：`/commands` 端点 501 是因为后端尚未挂钩扩展命令路由（详见 [Supervisor 已知未实装功能](/supervisor/known-gaps#2-扩展命令路由未挂钩)）

## 3. 自定义 Extension 运行时管理 UI 缺

- intro.html 标注 `todo`
- 后端 extension 框架完整（loader / runtime / events）
- UI：没有管理界面（没有列出已加载扩展、没有查看扩展状态的页面）

## 4. Thinking Level 切换 UI 缺

- `ThinkingBlock.vue` 可以**展示**思考块的展开/折叠
- 但没有 UI 让用户选择 `thinking_level`（`low`/`medium`/`high`/`none`）
- 后端 API 需要 `thinkingLevel` 参数来支持

## 5. Turn File Tracking 独立面板缺

- `TurnFileChanges.vue` 已在 message group 中渲染
- 但没有像 `SessionLogPanel.vue` 那样的独立审计面板
- **修复建议**：在 `ChatSessionMenu.vue` 加一个 "File Changes" 入口，展开一个只展示 `TurnFileChanges` 列表的侧滑面板

## 6. E2E 测试不够稳定

- `e2e/supervisor.spec.ts` 有 148 行冒烟测试
- 组件上**没有 `data-testid`**，测试用 DOM 文本内容定位，脆弱
- 测试用例用 `if (count > 0)` 兜底，覆盖率低

## 7. deprecated shim 文件

`src/store/session.ts`：标 `@deprecated`，是抽出 `useRootStore` 和 `useSessionStore` 后的残留。不要引用它，全用 `src/store/index.ts` 的 store。

## 总结

| 问题                          | 严重度 | 根源                                   |
| ----------------------------- | ------ | -------------------------------------- |
| 中止 / Steer / Follow-up 按钮 | 中     | 后端已做完，UI 未加                    |
| Slash 命令 UI                 | 中     | 后端 501（命令路由未挂钩），UI 未加    |
| Extension 管理 UI             | 低     | 后端框架完整，UI 未做                  |
| Thinking Level 切换           | 低     | 后端可能需要适配，UI 未加              |
| Turn File Tracking 面板       | 低     | 已有组件 `TurnFileChanges.vue`，可复用 |
| E2E 缺少 data-testid          | 低     | 影响 CI 冒烟                           |
| store/session.ts deprecated   | 低     | 不影响使用                             |
