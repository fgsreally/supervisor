# @earendil-works/supervisor-native

Supervisor 扩展：用 omp 的 Rust 原生库（`@oh-my-pi/pi-natives`）**覆盖**默认工具。

## 覆盖的工具

| 工具        | pi-natives API                                          | 说明                                     |
| ----------- | ------------------------------------------------------- | ---------------------------------------- |
| `bash`      | `executeShell` + `applyBashFixups` + **Rust minimizer** | Rust shell，内置 output minimizer        |
| `grep`      | `grep`                                                  | 替代 spawn `rg`                          |
| `find`      | `glob`                                                  | 替代 spawn `fd`                          |
| `ls`        | `listWorkspace`                                         | 替代 Node `readdir`                      |
| `read`      | `summarizeCode` + suffix `glob`                         | 大文件结构摘要；路径后缀纠错             |
| `ast_grep`  | `astGrep` + `astEdit` + `summarizeCode`                 | 结构化搜索 / 摘要 / 改写                 |
| `web_fetch` | `htmlToMarkdown`                                        | HTML 转 Markdown（替代 TS `htmlToText`） |

扩展还会在 `write` / `edit` / `bash` / `ast_grep` 写盘后调用 `invalidateFsScanCache`，与 omp 的 grep/find 缓存一致。

## output-minimizer 与 native bash

- **native bash**：压缩在 `executeShell` 内由 **Rust minimizer** 完成（可通过 `OMP_MINIMIZER_*` 环境变量配置）。
- **默认 bash**：走 supervisor 内置 **`supervisor-output-minimizer`** 扩展（TS 移植版）。

启用 `supervisor-native` 后，output-minimizer 会自动跳过已由 Rust 压缩过的 bash 输出，避免重复处理。

## 与内置扩展的关系

| 内置扩展                      | 冲突                           |
| ----------------------------- | ------------------------------ |
| `supervisor-ast-grep`         | 同名 `ast_grep`，后加载者覆盖  |
| `supervisor-web`              | 同名 `web_fetch`，后加载者覆盖 |
| `supervisor-output-minimizer` | 与 native bash 冗余，可关闭    |

## Minimizer 环境变量

| 变量                            | 含义                        |
| ------------------------------- | --------------------------- |
| `OMP_MINIMIZER_ENABLED`         | `false` 关闭 Rust minimizer |
| `OMP_MINIMIZER_SETTINGS_PATH`   | TOML 配置文件路径           |
| `OMP_MINIMIZER_ONLY` / `EXCEPT` | 逗号分隔的 filter 白/黑名单 |
| `OMP_MINIMIZER_LEGACY_FILTERS`  | `1` 启用旧版 filter 行为    |

## Node 与安装

Supervisor 运行在 **Node**（>= 20.6），不需要 Bun。安装：

```bash
pi-supervisor extensions install ./extensions/native
```

`optionalDependencies` 仅会安装当前平台对应的 `.node` 二进制（五平台，无 win-arm）。
