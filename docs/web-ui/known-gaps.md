# 已知缺口

本文只记录当前实现仍存在的产品缺口，不保留已经完成的历史 TODO。

| 缺口              | 当前状态                                                             |
| ----------------- | -------------------------------------------------------------------- |
| Thinking level UI | 后端已有 `/sessions/:id/thinking-level`，前端尚无选择控件            |
| 扩展更新/卸载体验 | 已有安装弹窗、资源绑定与逐项反馈；更新/卸载仍缺少完整管理流程        |
| 工作流确认/选择   | UI 只显示 `sessions.stage`；扩展私有 waiting/choice 状态没有通用面板 |
| 独立搜索页        | `/search` 重定向 `/home`；搜索主要在 Chat 内完成                     |
| E2E 稳定性        | 部分 Playwright 用例仍依赖展示文本，缺少稳定的 `data-testid`         |
| Store shim        | `src/store/session.ts` 仍是 deprecated 兼容入口                      |
