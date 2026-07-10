# AI 代理协作规范

对本仓库（supervisor-standalone）贡献或进行开发时，AI 代理解读本文件以了解约定。

## 可编辑范围

只允许编辑以下包：

- `packages/supervisor` — 后端运行时（会话管理、HTTP API、扩展框架、MCP 集成）
- `packages/supervisor-web-ui` — Vue 3 + Vite 前端

根目录配置、文档（`docs/`）也在编辑范围内。

## 项目特征

- Node.js >= 20.6.0，ESM（type: "module"）
- 包管理器：pnpm（与 nub 兼容）
- 语法检查：oxlint / oxfmt（无 Prettier、无 Biome）
- 构建工具：tsdown（supervisor）、Vite（supervisor-web-ui）
- 测试框架：vitest、Playwright（E2E）

## 构建命令

```
pnpm install            # 安装依赖
pnpm run build          # 构建 supervisor
pnpm run check          # lint + format check + 类型检查
pnpm run lint           # oxlint
pnpm run format:check   # oxfmt 检查格式
pnpm run test           # 运行测试
pnpm docs:dev           # 启动 VitePress 文档
pnpm docs:build         # 构建文档
```

## Git 约定

- 不修改上游 `CHANGELOG.md`
- 无 emoji（禁止表情符号）
- 提交信息简明扼要
- `npm run check` 通过后方可提交

## 沟通风格

- 简洁、精练
- 中文优先
- 引用源码时标注文件路径和行号
