# MiniMax 国内站 (minimax-cn) 测试指引

Playground 已配置使用 MiniMax 国内站 API (`minimax-cn` / `MiniMax-M2.7`)。按以下步骤在 PowerShell 中测试 Supervisor 的 print、HTTP、RPC 能力。

## 准备工作

在 PowerShell 中设置环境变量（不要写进任何提交的代码中）：

```powershell
$env:MINIMAX_CN_API_KEY="你的真实 API Key"
```

编译 supervisor 包（如果你改了代码）：

```powershell
pnpm run build
```

## 测试方式一：Print 模式 (CLI 一次性运行)

在**仓库根目录**执行：

```powershell
node packages/supervisor/dist/cli.mjs print "读取 TASK.md，简要说明需要改什么代码" --provider minimax-cn --model MiniMax-M2.7 --cwd playground --db playground/.supervisor/supervisor.db
```

## 测试方式二：HTTP API 模式

**终端 1 (启动服务端):**

```powershell
node packages/supervisor/dist/cli.mjs serve --port 3030 --cwd playground --db playground/.supervisor/supervisor.db
```

**终端 2 (发送 HTTP 请求):**

1. 启动一个实例（默认 preset 是 readonly，防止乱改文件）：

```powershell
$body = Get-Content playground/fixtures/http-create-session.json -Raw
$inst = Invoke-RestMethod -Method Post -Uri http://localhost:3030/sessions -ContentType application/json -Body $body
$id = $inst.id
Write-Host "已创建实例 ID: $id"
```

2. 触发 prompt：

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3030/sessions/$id/prompt" -ContentType application/json -Body '{"message":"读取 TASK.md 和 src/calculator.ts，说明下一步是什么"}'
```

3. 查看运行时状态：

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3030/sessions/$id/state"
```

4. 提取完整消息树：

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3030/sessions/$id/messages"
```

## 测试方式三：JSONL RPC 模式

```powershell
Get-Content playground/fixtures/rpc-session.jsonl | node packages/supervisor/dist/cli.mjs --mode rpc --cwd playground --db playground/.supervisor/supervisor.db
```

这条命令会依次发四个指令：`spawn_instance`、`get_state`、`prompt`、`get_messages`。若终端打印出一系列合法的 JSON 响应，说明功能正常。
