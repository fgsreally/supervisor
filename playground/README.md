# Playground

本地开发与测试用的工作区。

## 目录

- `src/` — 示例 TypeScript 项目（见 `TASK.md`）
- `fixtures/` — HTTP / RPC 冒烟测试用的 JSON 样例
- `.pi/supervisor/` — 项目级 skills / prompts / extensions
- `.supervisor/` — 本地 supervisor 数据库（git 忽略，运行时生成）

手动测试 print / HTTP / RPC 见 [`TESTING_CN.md`](TESTING_CN.md)。

## 启动

在仓库根目录：

```bash
pnpm install
pnpm run build
pnpm run dev:supervisor
```

Supervisor 默认使用 `--cwd playground`。Web UI 开发时：

```bash
pnpm run dev
```

## 手动指定工作目录

```bash
node packages/supervisor/dist/cli.mjs serve --port 3030 --cwd playground
# 或任意绝对/相对路径
node packages/supervisor/dist/cli.mjs serve --cwd /path/to/your/project
```

也可通过环境变量：

```bash
SS_CWD=playground node packages/supervisor/dist/cli.mjs serve
```

## 本地数据库

开发时建议把数据库放在 playground 内，避免污染 `~/.pi/supervisor.db`：

```bash
node packages/supervisor/dist/cli.mjs serve --cwd playground --db playground/.supervisor/supervisor.db
```
