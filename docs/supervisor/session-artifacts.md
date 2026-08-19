# Session 专属文件、外部 Agent 与对话产物

## 约定

每个 Session 都有自己的专属目录，由 Supervisor 分配，不等同于 Agent 的工作目录（`cwd`）。目录位置由 Supervisor 内部管理，常用子目录包括：

- `attachments/`：用户上传的附件，以及超过阈值的长文本粘贴内容
- `scripts/`、`plans/`、`todos/`、`outputs/`：对话过程中生成的脚本、计划、待办和结果
- `tmp/`：临时文件

除非文件本来就是源码，否则 Agent 生成的副产物应放在 Session 专属目录，不要写入项目源码目录。

## 两种路径形式

Supervisor 自己控制的文件工具（`read`、`ls`、`grep`、`find` 等）使用逻辑路径：

```text
@/attachments/input.csv
```

这里的 `@/` 根目录就是当前 Session 的专属目录。它不是当前项目 `cwd`，也不是一个需要 Agent 自己解析的操作系统路径。

Shell、Python、JavaScript、eval，以及 Supervisor 无法直接控制的外部程序使用环境变量：

```text
SV_SESSION_DIR/attachments/input.csv
```

外部 Agent 进程启动时会注入 `SV_SESSION_DIR`。外部提示词中的 `@/` 路径会转换为 `${SV_SESSION_DIR}/` 形式；Supervisor 自己的原生 Agent 仍使用 `@/`。

## 附件与长文本提示词

界面中，上传附件、粘贴图片和长文本都显示为可点击的标签。发送给模型时：

- 普通文字保持普通文字；
- 短粘贴文本使用 `<pasted_text mode="inline">`；
- 长粘贴文本先保存到 `attachments/`，使用带 `path` 的 `<pasted_text mode="attachment" />`；
- 上传文件使用带路径、名称、类型和大小的 `<attachment />`。

原生 Agent 的路径使用 `@/`。外部 Agent 收到的路径使用 `SV_SESSION_DIR`。

## 对话产物与 `meta.assets`

Session 产物目录中的新建或修改文件，会作为当前工具结果消息的 `meta.assets` 登记。前端可以像显示录屏和截图一样，在对应消息下提供文件入口。

目前重点覆盖 `scripts/`、`plans/`、`todos/` 和 `outputs/`；用户上传的 `attachments/` 不作为模型产物重复登记。

## 后续事项

Watson 暂不纳入这套环境变量和产物处理，后续需要单独接入。届时仍应遵守同一条归属原则：Session 产生的非源码文件写入 Session 专属目录，并通过 `SV_SESSION_DIR` 访问。
