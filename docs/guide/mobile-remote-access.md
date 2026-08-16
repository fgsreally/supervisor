# 手机远程访问

通过 Cloudflare Quick Tunnel，在手机上扫码访问本机 Supervisor（HTTPS）。无需 Cloudflare 账号或域名；`cloudflared` 由 npm 依赖自动下载。

## 开发（同 WiFi）

```bash
pnpm run dev:server   # API
pnpm run dev:web      # 浏览器前端（另开终端）
```

两个终端分别启动 API 与 Vite。开发脚本暂用 `--cwd playground`：

- 全局根 = `playground/`（db、public、agents、projects、global 都在这里）
- 数据库 = `playground/supervisor.db`
- 终端二维码指向 Vite：`http://{局域网IP}:5163`

## 生产 / 隧道

```bash
pnpm run build:all
pnpm run serve:tunnel
```

终端会打印：

- Web PIN（需在手机上手动输入，不进二维码）
- **公网 HTTPS 地址与 ASCII 二维码**（`*.trycloudflare.com`，优先于 LAN）
- 可选的同 WiFi LAN 地址（仅文字提示）

扫码 → 手输 PIN → 聊天。

## `--cwd` 语义

`--cwd <path>` = Supervisor **全局根**。指定后以下全部落在该目录下：

| 内容        | 路径                                       |
| ----------- | ------------------------------------------ |
| 数据库      | `<cwd>/supervisor.db`                      |
| public      | `<cwd>/public/`                            |
| global 资源 | `<cwd>/global/{skills,extensions,prompts}` |
| agents      | `<cwd>/agents/{id}/`                       |
| projects    | `<cwd>/projects/{id}/`                     |
| media       | `<cwd>/media/`                             |
| settings    | `<cwd>/settings.json`                      |

不传 `--cwd` 时默认全局根为 `~/.supervisor`。

## 说明

| 项    | 说明                                                |
| ----- | --------------------------------------------------- |
| 费用  | 免费 Quick Tunnel                                   |
| URL   | 每次重启 supervisor 会变化，需重新扫码              |
| HTTPS | 自动，满足添主屏 / Service Worker 的 secure context |

不传 `--tunnel` 且已构建 UI 时，扫码为 `http://{lan}:3030`。

## 原生 App（Capacitor）

Android / iOS 壳见 `packages/supervisor-mobile`。Android 16 Live Updates 见 [Android Live Updates 接入指南](./android-live-updates.md)。

## 安全

- 二维码不含 PIN；公网 URL 仍靠 6 位 PIN 门禁
- 适合个人临时远程；关闭 supervisor 即断隧道
