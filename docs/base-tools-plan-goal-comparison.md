# Coding Agent 基础工具、Plan、Goal 对照

范围：只比较高星开源 Coding Agent；重点是读、改、Shell、Plan、Goal。LSP/AST 不在本表重点内。

## 先说结论

### Vite 这类不会退出的命令怎么判断

必须分开三个状态：

1. `process_running`：进程还活着。
2. `port_open`：端口已经监听。
3. `healthy`：HTTP/自定义健康检查成功。

`ls` 等待退出，返回 exit code。`vite` 不能等退出，应在短暂等待后转后台，返回任务 ID，并继续做端口/HTTP 检查。

SV 当前只做到前两层的一部分：

- Bash 用命令正则识别 `vite/npm dev/...`，要求后台运行，并用日志正则判断 `ready`。
- ProjectService 会检查 TCP 端口。
- 但 ProjectService 也会仅凭“进程活着”标记 `active`；Bash 的 `ready` 也可能只是日志命中。

所以 SV 当前的 `active/ready` 不等于“网页真的能打开”。应改为：`进程存活 && 端口已开 && 可选 HTTP 健康检查成功`，并把三项状态分别返回。

另一个缺口是：SV 靠命令名称识别长期命令，会漏掉 `node server.js`、自定义脚本等。应像 Codex、Crush、oh-my-pi 一样：任何前台命令超过短等待时间都可自动转后台，不依赖命令名。

## Shell 对照

| Agent | `ls` | `vite`/长期命令 | 怎么知道启动 |
|---|---|---|---|
| Supervisor | 等退出、返回输出/状态 | 显式后台；已知 dev 命令禁止前台 | 日志正则；ProjectService 查 TCP，但仍可能只凭进程活着判 active |
| Pi | 等退出 | 无后台任务，超时后杀进程 | 不支持 |
| oh-my-pi | 等退出 | 显式 async；前台超阈值自动转后台；有 job 管理和完成通知 | 进程状态/日志；无通用健康检查 |
| OpenCode | 等退出 | Shell 本身只有 timeout；后台只用于子 Agent，不用于系统进程 | 无内置服务就绪判断 |
| MiMo-Code | 等退出 | 持久 Shell，但 Bash 本身只有 timeout；复杂后台能力主要给 Actor/Workflow | 无内置服务就绪判断 |
| Gemini CLI | 等退出 | `is_background`，短延迟后返回 PID 和初始输出；有完成通知 | 只确认仍在运行/看日志，不确认服务健康 |
| Qwen Code | 等退出 | 显式后台、状态文件、日志、监控和完成通知；前台可转后台 | 进程状态/日志，不自动确认 HTTP 健康 |
| Codex | 命令在 yield 窗口内退出，直接返回 | yield 后仍运行则返回 session/process ID；后续轮询或写 stdin | 进程状态/日志；健康需另查端口或 HTTP |
| Cline | 等退出 | VS Code 终端可持续运行，跟踪 busy/hot/process；SDK 基础 Bash 则是超时杀进程 | 终端集成判断运行/完成，不等于服务健康 |
| Crush | 等退出 | 显式后台；前台超过阈值自动转后台；job_output/job_kill | 进程状态/日志 |
| Goose | 等退出 | 持久终端；软超时后可空命令继续取日志，也可用 shell 后台作业 | 输出/退出状态，无服务健康判断 |
| Aider | 用户 `/run`/测试命令 | 没有一等后台任务管理 | 无内置判断 |
| SWE-agent | 每个动作按 timeout 执行 | 无一等后台任务；连续超时有上限 | 无内置判断 |
| Trae Agent | 持久 Bash session | 要求命令自行加 `&`；120 秒未返回会要求重启 Shell | 无任务 ID、无就绪判断 |
| OpenHands | 持久终端；10 秒无新输出会软超时 | 后台作业或软超时后继续读取/发送控制键 | 输出/退出状态；无通用服务健康判断 |

## Plan / Goal 对照

| Agent | Plan | Goal/完成验收 |
|---|---|---|
| Supervisor | 真只读阶段；Plan 文件；用户 approve/revise/reject；执行后用 Todo | Goal 持久化并自动续跑，但由 Agent 自己声明 complete；没有独立验收 |
| Pi | 核心不内置；只有示例扩展 | 无 |
| oh-my-pi | 真只读、持久 Plan、审批；还会强制 Agent 必须 ask/resolve 后才能离开 Plan | Todo 提醒；无独立 Goal 裁判 |
| OpenCode | 独立 Plan Agent 和权限规则；Plan 文件；用户确认后切 Build | Todo；无独立 Goal 裁判 |
| MiMo-Code | 只读回退保护、用户审批 | 独立模型读取完整记录判定 satisfied/impossible，未满足则继续 |
| Gemini CLI | 真只读；校验 Plan 文件；用户批准后切回执行权限 | `complete_task` 只是完成信号，没有独立验收 |
| Qwen Code | 真只读、用户批准、执行权限切换 | 最强：Stop Hook 调独立模型；要求工具结果中的可核验证据；裁判错误/超时不会误判完成 |
| Codex | Plan 模式与 `update_plan` 分离；`update_plan` 本身只是 checklist | Goal 有持久状态、续跑、预算/用量/暂停/阻塞；完成仍是 Agent 自报 |
| Cline | Plan/Act 真分离；用户切换 Act；Plan 中写/执行受限 | `attempt_completion` 自报；无独立验收 |
| Crush | Todo 为主，没有完整 Plan 状态机 | 无独立 Goal |
| Goose | 独立 Planner 模型，交互澄清后由用户决定清空历史并执行方案 | Todo 持久化；无独立 Goal 验收 |
| Aider | Architect 模式：一个模型设计、一个模型改代码 | 无持久 Goal |
| SWE-agent | 没有通用 Plan；是固定动作循环 | `submit`；可选 review-on-submit，但不是通用 Goal |
| Trae Agent | 无完整 Plan 状态机 | `task_done` 描述要求先验证，但代码看到调用就结束；没有硬验收 |
| OpenHands | Planning 提示阶段，不是 SV 这种持久 Plan 状态机 | 可配置 Critic 在 Finish 时评分并迭代；默认 Finish 仍是结束信号 |

结论：并不是“几乎所有 Agent 都有完整 Plan + Goal”。完整 Plan 常见；真正带独立验收的 Goal 很少，主要是 Qwen Code、MiMo-Code；OpenHands/Goose 的 Critic 是相近机制。

## 读写修改差异

SV/Pi 已有 offset/limit、图片读取、截断、精确唯一替换、空白模糊匹配、多修改队列，基础能力不差。真正值得补的只有三项：

1. 学 Qwen/Gemini/oh-my-pi：读取后保存内容 hash；编辑时发现文件已变化就拒绝，防止覆盖新内容。
2. 学 Gemini/Cline：一次读取多个文件，减少多轮工具调用。
3. 学 oh-my-pi：编辑定位使用稳定行锚点/hashline，避免行号漂移。

## SV 应优先改什么

1. Bash 不再靠 `vite/npm dev` 正则决定长期命令；所有命令短等待后都能自动转后台。
2. 后台返回结构固定为 `task_id/pid/process_running/exit_code/output_tail`。
3. 服务启动另走 readiness：先端口，再可选 HTTP；绝不能只凭 PID 或日志写 `ready=true`。
4. Plan 完成不能只检查 Todo 全部 completed；还要检查对应验证命令及结果。
5. Goal 采用 Qwen 的 Stop Hook：独立裁判、证据必须来自真实工具结果、裁判失败时暂停而不是放行。
6. Edit 增加读取 hash/stale-write 拒绝。

## 主要源码落点

- SV Bash：`packages/supervisor/src/tools/bash/tool.ts`
- SV 服务状态：`packages/supervisor/src/extension/builtin/project-services/index.ts`
- SV Plan/Goal：`packages/supervisor/src/extension/builtin/task-management/index.ts`
- Qwen Goal 裁判：`qwen-code/packages/core/src/goals/goalHook.ts`
- MiMo Goal 裁判：`MiMo-Code/packages/opencode/src/session/goal.ts`
- oh-my-pi Bash：`oh-my-pi/packages/coding-agent/src/tools/bash.ts`
- Crush Bash：`crush/internal/agent/tools/bash.go`
- Gemini Bash：`gemini-cli/packages/core/src/tools/shell.ts`
- OpenHands Terminal：`OpenHands-software-agent-sdk/openhands-tools/openhands/tools/terminal/`
