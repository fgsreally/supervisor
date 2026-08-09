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
