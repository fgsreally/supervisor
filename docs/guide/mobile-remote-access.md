# 手机远程访问

通过 Cloudflare Quick Tunnel，在手机上扫码访问本机 Supervisor（HTTPS）。无需 Cloudflare 账号或域名；`cloudflared` 由 npm 依赖自动下载。

## 快速开始

```bash
pnpm run build:all
pi-supervisor serve --tunnel --cwd playground
# 或：bun packages/supervisor/dist/cli.mjs serve --tunnel --cwd playground
```

终端会打印：

- Web PIN（需在手机上手动输入，不进二维码）
- 公网 HTTPS 地址与 ASCII 二维码（`*.trycloudflare.com`）
- 可选的同 WiFi LAN 地址与二维码

扫码 → 手输 PIN → 聊天。Quick Tunnel 下聊天走 WebSocket（Cloudflare 会缓冲 SSE）；同 WiFi / localhost 仍走 SSE。

## 说明

| 项 | 说明 |
| --- | --- |
| 费用 | 免费 Quick Tunnel |
| URL | 每次重启 supervisor 会变化，需重新扫码 |
| 并发 | 约 200 in-flight，个人手机够用 |
| HTTPS | 自动，满足添主屏 / Service Worker 的 secure context |
| 依赖 | `cloudflared` npm 包自动拉取二进制；无需系统全局安装 |

不传 `--tunnel` 时仅 LAN / localhost（终端仍会打印局域网二维码）。

UI 需先构建：`--tunnel` 会自动探测 `packages/supervisor-web-ui/dist`；缺失时终端会提示。也可用 `--ui-dir <path>` 指定。

## 安全

- 二维码不含 PIN；公网 URL 仍靠 6 位 PIN 门禁
- `trycloudflare.com` 子域随机，但链接泄露仍可被尝试——保持 PIN
- 适合个人临时远程；关闭 supervisor 即断隧道

## 附录：Named Tunnel

有自有域名时，可自行配置 Cloudflare Named Tunnel 指向本机端口，以获得固定地址。Supervisor MVP 不集成 `--tunnel-token`；流程与官方文档一致。
