# Supervisor Web UI — Mock Example

Static Vue mock (WeChat-style layout, no backend).

## Run

**仅使用 npm**（不要在此目录使用 pnpm）：

```bash
cd packages/supervisor-web-ui/example
npm install
npm run dev
```

浏览器打开 http://localhost:5174/

带局域网访问：

```bash
npm run dev -- --host
```

## 排错

若出现 `Install @vitejs/plugin-vue to handle .vue files`，多半是曾混用过 pnpm。清理后只用 npm 重装：

```bash
npx shx rm -rf node_modules node_modules/.ignored pnpm-lock.yaml
npm install
npm run dev
```
