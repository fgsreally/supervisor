# WeCode Mobile

Capacitor shell wrapping `wecode-web-ui` for iOS and Android.

Native bridge plugin: `packages/wecode-native-bridge`（Android 16 Live Updates、前台服务、iOS Live Activity）。

## 开发命令（互不混合，请开多个终端）

| 终端 | 命令                   | 作用                                                  |
| ---- | ---------------------- | ----------------------------------------------------- |
| 1    | `pnpm run dev:server`  | Wecode API `:3030`                                |
| 2    | `pnpm run dev:web`     | 浏览器 Vite 热更新 `:5163`                            |
| 3    | `pnpm run dev:android` | `vite build --watch` + `cap sync` + `cap run android` |

原生 App **不会**连 Vite dev server，而是加载打进壳的 `dist`；改 UI 后由 `build:watch` 重建并自动 `cap sync`。

App 启动后进入微信风格「服务器」列表，可扫码或手动添加多个 Wecode 实例；在「我的 → 服务器」可切换。模拟器手填常用 `http://10.0.2.2:3030`，PIN 默认 `123456`。

Android 默认入口也可使用原生 `ShellActivity`（扫码壳）：一进 App 即为实例列表，扫码添加后点选进入对应远程页面；返回键在根页会回到列表。

## 仅同步 / 打开 IDE

```bash
pnpm --filter wecode-mobile run sync
pnpm --filter wecode-mobile run open:android
pnpm --filter wecode-mobile run open:ios
```

## Deep links

- `wecode://session/:id`

## Android / iOS 分享与打开文件

相册、微信、文件管理器等可通过系统分享或「用其他应用打开」把图片、Excel、PDF 等交给 Wecode。App 弹出「选择会话」后，文件进入该会话输入框，需手动点发送。

**Android：** `ACTION_SEND` / `SEND_MULTIPLE`（`image/*`、`application/*`、`*/*` 等，对齐荣耀/OPPO 传送门查询类型）。桌面入口 `ShellActivity` 与 Capacitor `MainActivity` 均可接收；传送门进 App 后弹出「选择会话」。

**iOS：** 在微信等 App 中打开文件 →「用其他应用打开」→ 选择 Wecode。聊天里点回形针也可从系统文件选择器上传。

**验证步骤：**

1. `pnpm --filter wecode-mobile run sync`
2. `pnpm run dev:android`（或 Android Studio / Xcode 运行 debug 包）
3. App 内配置好服务器连接，并确保至少有一个非内置会话
4. 荣耀/OPPO 传送门，或微信分享 /「用其他应用打开」，选中图片或 Excel → 选择 Wecode
5. App 弹出「选择会话」→ 点选目标会话 → 进入该会话，输入区出现附件预览（需手动点发送）
6. 取消选择则不跳转、输入区无文件；已在某会话时再分享仍会弹出选择器

文件会复制到 app cache，经 `WecodeNative.getPendingShare` 交给 web-ui；选定会话并确认发送前不会自动发出。
