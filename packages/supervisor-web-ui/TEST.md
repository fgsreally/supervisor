# Supervisor Web UI 测试文档

## 单元测试（Vitest + @vue/test-utils）

以 `src/**/__tests__` 为准，主要包括：

- `store/__tests__/store.test.ts`
- `api/__tests__/api.integration.test.ts`
- `utils/__tests__/*`（session-entries、flatten-messages、ask-tool、workflow、resources 等）
- `components/__tests__/*`、`components/chat/__tests__/*`

```bash
npm test
npm run test:watch
```

## E2E（Playwright）

```
e2e/
└── supervisor.spec.ts
```

```bash
npm run test:e2e
```

## 本地联调建议

```bash
# 仓库根目录
pnpm run serve          # supervisor :3030
pnpm run dev            # web-ui :5173（代理到 3030）
```

## 检查

```bash
npm run check
npm test
npm run build
```

E2E 依赖后端与 UI 同时可用；冒烟仍较多依赖 DOM 文本，见 [已知缺口](../../docs/web-ui/known-gaps.md)。
