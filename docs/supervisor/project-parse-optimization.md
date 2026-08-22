# 项目解析性能与缓存优化记录

## 背景

项目解析由两部分组成：

1. 程序确定性检测项目 setup 命令、Git 状态和 HTML 入口。
2. Watson 读取项目文件，只负责判断项目描述、开发服务和可访问页面。

解析结果通过终止型 `submit_result` 工具提交，平台再将结果写入项目配置。

## 原始问题

在 `vite8` 项目的两次实测中：

- 第一次耗时约 74 秒。
- 第二次耗时约 79 秒。
- 两次都出现模型反复调用 bash 检查 Git 的情况。
- Windows 下不兼容的 `cd`、重定向和 Git 命令造成了约 25 秒和 38 秒的额外等待。
- Pi 原生 Anthropic 缓存只在系统提示、工具定义和最后一条用户/工具结果上设置断点。
- 多轮工具历史超过兼容服务商的回溯窗口后，缓存读取量长期固定在约 1834 token。

## 缓存定位

Pi 本身具备 Anthropic Prompt Cache 支持，但默认序列化策略没有为多轮工具历史保留足够的消息断点。

MiniMax 的 Anthropic 兼容文档说明：

- 缓存按完整前缀匹配。
- 服务端大约回溯 20 个消息块。
- 一个请求最多支持 4 个缓存断点。

Pi 官方 issue [#1736](https://github.com/earendil-works/pi/issues/1736) 也记录了多轮 `tool_use` 历史的类似问题，并建议同时标记：

- 最近的 assistant `tool_use`。
- 当前最后的 user / `tool_result`。

因此修复放在 pi-ai 依赖层，而不是 Supervisor 的 Watson 业务层。当前补丁位于：

`patches/@earendil-works__pi-ai@0.74.2.patch`

补丁只增加一个历史消息断点，最终最多形成四个断点：

1. system。
2. tools。
3. 最近的 assistant `tool_use`。
4. 最后的 user / `tool_result`。

非 Anthropic Messages 协议不使用这段补丁逻辑。

## 解析性能优化

项目解析新增专用 `project-parse` 工具预设：

- 保留 `ls`、`read`、`edit` 和 `submit_result`。
- 移除 `bash`，避免模型为了确认 Git 状态反复执行平台相关命令。
- setup 命令由程序检测，不要求 Watson 执行安装命令。
- HTML 入口由程序兜底生成 view，避免模型漏报根目录 HTML 页面。

这不是把所有 Agent 的 bash 都禁用，只针对项目解析任务限制工具范围。

## 实测结果

第一次优化后解析：

- 总耗时：20.6 秒。
- LLM 轮次：4。
- bash 调用：0。
- 缓存读取：1703 → 2794 → 3328 token。

第二次优化后解析：

- 总耗时：18.4 秒。
- LLM 轮次：3。
- bash 调用：0。
- 首轮缓存读取：2637 token。
- 后续缓存读取：2802、2765 token。

## 当前 `submit_result` 结构

```json
{
  "result": {
    "description": "Vue 3 + TypeScript + Vite 前端开发模板，使用 pnpm 作为包管理器，集成 Vue 3 <script setup> 语法和 TypeScript 类型检查，提供开箱即用的开发体验。",
    "services": {
      "definitions": [
        {
          "name": "web",
          "startCommand": "vite --port ${PORT1}"
        }
      ],
      "views": [
        {
          "name": "Home",
          "service": "web",
          "port": "PORT1",
          "path": "/"
        }
      ]
    }
  }
}
```

`installCommand` 不属于 Watson 的提交结果。它由程序调用 `detectSetup()` 后补充。

## setupCommand 命名遗留

昨天的项目解析改造已经完成了 setup 的程序化检测，但当前字段名仍是 `installCommand`：

- `project-detect.ts` 的 `DetectedSetup` 仍返回 `installCommand`。
- `project-runtime.ts` 的 `ProjectServiceConfig` 仍定义 `installCommand`。
- `applyProjectRuntimeParse()` 仍把检测结果写入 `services.installCommand`。
- Web UI 和 session service 类型中也仍存在同名字段。

所以当前状态是：

> setup 的行为已经完成，setupCommand 的命名迁移尚未完成。

后续如果确认改名，不能全仓库机械替换。外部 Agent 的安装命令也叫 `installCommand`，它表达的是另一件事，应继续保留。项目 setup 至少需要一起审查：

- 项目运行时类型和数据库 JSON。
- Session services 的继承、安装和复用逻辑。
- API 返回类型。
- Web UI 展示和操作文案。
- 旧项目 `meta.services.installCommand` 的兼容读取或一次性迁移。

本记录只说明现状和迁移范围，不包含该命名改动。

## 相关日志

- `playground/logs/watson/2026-08-21T07-21-11-845Z-project-parse.log`
- `playground/logs/watson/2026-08-21T07-21-54-245Z-project-parse.log`
