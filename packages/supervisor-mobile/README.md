# Pi Supervisor Mobile

Capacitor shell wrapping `supervisor-web-ui` for iOS and Android.

Native bridge plugin: `packages/pi-supervisor-native-bridge`（Android 16 Live Updates、前台服务、iOS Live Activity）。

## 开发命令（互不混合，请开多个终端）

| 终端 | 命令                   | 作用                                                  |
| ---- | ---------------------- | ----------------------------------------------------- |
| 1    | `pnpm run dev:server`  | Supervisor API `:3030`                                |
| 2    | `pnpm run dev:web`     | 浏览器 Vite 热更新 `:5163`                            |
| 3    | `pnpm run dev:android` | `vite build --watch` + `cap sync` + `cap run android` |

原生 App **不会**连 Vite dev server，而是加载打进壳的 `dist`；改 UI 后由 `build:watch` 重建并自动 `cap sync`。

App 内 **我的 → 服务器连接** 配置 API 地址（模拟器常用 `http://10.0.2.2:3030`，PIN 默认 `123456`）。

## 仅同步 / 打开 IDE

```bash
pnpm --filter pi-supervisor-mobile run sync
pnpm --filter pi-supervisor-mobile run open:android
pnpm --filter pi-supervisor-mobile run open:ios
```

## Deep links

- `supervisor://session/:id`

## Android 分享（传送门）

Capacitor `MainActivity` 已注册 `ACTION_SEND` / `SEND_MULTIPLE`（`image/*`）。相册、文件管理器等 App 分享图片时，可在系统分享面板选择 Supervisor。

**验证步骤（Capacitor 路径，非扫码 ShellActivity）：**

1. `pnpm --filter pi-supervisor-mobile run sync`
2. `pnpm run dev:android`（或 Android Studio 运行 `MainActivity` 对应的 debug 包）
3. App 内配置好服务器连接，并确保至少有两个非内置会话
4. 在相册选中图片 → 分享 → 选择 Supervisor
5. App 弹出「选择会话」→ 点选目标会话 → 进入该会话，输入区出现图片附件预览（需手动点发送）
6. 取消选择则不跳转、输入区无图；已在某会话时再分享仍会弹出选择器

分享图片会复制到 app cache，经 `SupervisorNative.getPendingShare` 交给 web-ui；选定会话并确认发送前不会自动发出。
