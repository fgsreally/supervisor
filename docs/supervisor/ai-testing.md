# AI 效果测试

Supervisor 将测试分为两类：

- `*.test.ts`：结果确定的单元测试和集成测试，默认由 `pnpm test` 执行。
- `*.ai.test.ts`：运行真实 Coding Agent，并由独立裁判 LLM 评价效果。

AI 测试不会直接断言模型原文。测试场景收集消息、工具调用和最终回答，再交给裁判按照明确标准给出 0 到 4 分。

## 公共 API

扩展项目可以直接使用 Supervisor 提供的测试模块：

```ts
import { judgeAiResult, withAiTestEnvironment } from "@earendil-works/pi-supervisor/test";
import { expect, it } from "vitest";

it("improves code navigation", async () => {
  await withAiTestEnvironment(
    { fixture: "./test/fixture", extensions: ["./src"] },
    async (environment) => {
      const result = await environment.run({
        name: "code-navigation",
        prompt: "定位并解释登录请求的处理流程",
      });
      const judgment = await judgeAiResult({
        task: "正确定位登录请求的处理流程",
        criteria: ["找到入口", "找到核心调用链", "没有编造文件或函数"],
        result,
      });
      expect(judgment.verdict, judgment.raw).toBe("pass");
    },
  );
});
```

公共模块不依赖 Vitest，扩展可以使用任意测试框架。

## 环境变量

被测 Coding Agent：

```text
AI_TEST_SUBJECT_PROVIDER
AI_TEST_SUBJECT_MODEL
AI_TEST_SUBJECT_API_KEY
AI_TEST_SUBJECT_BASE_URL
AI_TEST_SUBJECT_API_TYPE
```

裁判 LLM：

```text
AI_TEST_JUDGE_PROVIDER
AI_TEST_JUDGE_MODEL
AI_TEST_JUDGE_API_KEY
AI_TEST_JUDGE_BASE_URL
AI_TEST_JUDGE_API_TYPE
```

可选运行参数：

```text
AI_TEST_TIMEOUT_MS=180000
AI_TEST_ARTIFACTS_DIR=./test-results/ai
```

配置 `AI_TEST_ARTIFACTS_DIR` 后，每次场景会保存最终回答、Agent 事件、裁判原文和结构化裁判结果。

## 运行

```bash
pnpm --filter @earendil-works/pi-supervisor run test:unit
pnpm --filter @earendil-works/pi-supervisor run test:ai
pnpm --filter @earendil-works/pi-supervisor run test:all
```

没有配置被测模型凭据时，`*.ai.test.ts` 会被跳过。普通测试不会请求真实模型。

## A/B 对照

使用 `compareAiResults()` 可以比较未启用扩展的 baseline 与启用扩展后的 candidate。裁判会分别评分，并返回 `baseline`、`candidate` 或 `tie`，适合验证扩展是否真正改善 Coding Agent 的解决能力。
