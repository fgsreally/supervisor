# Android 16 Live Updates

Supervisor 在 Android 16+（API 36）使用 **AOSP Live Updates**：系统推广的常驻进度通知，在状态栏显示 chip，在锁屏/通知栏置顶展示 Agent 运行状态。

ColorOS 16 等 OEM 会将符合 Google 规范的 Live Updates **自动渲染为各自流体云/实时活动 UI**，无需单独对接 OPPO IntelligentIntent。

## 要求

- Android 16+（API 36）
- `androidx.core:core:1.17.0+`（`setRequestPromotedOngoing` 等 API 回移植）
- Manifest 权限：`POST_NOTIFICATIONS`、`POST_PROMOTED_NOTIFICATIONS`
- 通知：`ProgressStyle` + `setOngoing(true)` + `setRequestPromotedOngoing(true)` + `setShortCriticalText`（状态栏 chip 短文案）

官方说明：[Create live update notifications](https://developer.android.com/develop/ui/views/notifications/live-update)

## 用户看到什么

| 位置        | 内容                              |
| ----------- | --------------------------------- |
| 状态栏 chip | 短状态（如「思考中」，约 7 字内） |
| 通知栏      | 会话标题 + 副标题 + 进度条        |
| 锁屏        | 展开的任务卡片（系统推广时）      |

## 代码位置

- `packages/pi-supervisor-native-bridge/android/.../AndroidLiveUpdateManager.java`
- Web UI 通过 `use-live-status.ts` → `SupervisorNative.startLiveStatus` / `updateLiveStatus` / `endLiveStatus`

检测是否可用：

```ts
const { available, promoted, reason } = await SupervisorNative.isAndroidLiveUpdatesAvailable();
```

- `available`：API 36+
- `promoted`：用户未在系统设置中关闭该 App 的 Live Updates

## 远程更新（App 后台）

Android **没有** iOS 那种系统托管的远程 Live Activity。App 被杀后若要刷新状态，需：

1. FCM **data** 消息唤醒 `FirebaseMessagingService`
2. 使用同一 `notificationId` 再次 `notify()` 更新 Live Update

服务端 `push-gateway` 已预留 hook；客户端 Push 处理尚未实现。

## 与 OPPO 私有流体云

|            | Live Updates (本方案) | OPPO IntelligentIntent |
| ---------- | --------------------- | ---------------------- |
| 最低系统   | Android 16            | ColorOS 15+            |
| 厂商审核   | 无                    | 需 serviceId           |
| ColorOS 16 | 自动兼容流体云展示    | 可选增强               |

私有 OPPO 接入文档见 [oppo-fluid-cloud.md](./oppo-fluid-cloud.md)（当前仓库**未启用**）。
