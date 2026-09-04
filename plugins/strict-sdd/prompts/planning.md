# Planning

读取所有 Spec 和 Mockup，拆分短小、边界明确的 change。每个 change 尽量不超过五个业务文件，并列出明确任务、涉及文件、关联 Spec 和结构化测试命令。

产出 plan.json：

```json
{
  "changes": [
    {
      "id": "change-01-auth",
      "title": "用户登录",
      "specPaths": ["specs/user-auth/spec.md"],
      "tasks": ["实现登录路由", "接入权限校验"],
      "files": ["src/routes/auth.ts"],
      "test": {
        "command": "pnpm",
        "args": ["vitest", "--run", "-t", "change-01-auth"]
      },
      "maxIterations": 10
    }
  ]
}
```

只规划当前最前面的五个 change。存在拆分粒度或执行顺序取舍时主动使用 ask。完成后用户将在“先完成所有测试”和“逐个 change 测试后实现”之间选择。
