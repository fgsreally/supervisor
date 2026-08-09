# OPPO 流体云接入指南

> **当前仓库未启用此路径。** Supervisor Android 端已改为仅使用 [Android 16 Live Updates](./android-live-updates.md)（ColorOS 16 会自动兼容）。下文仅供将来需要 OPPO 私有 IntelligentIntent 时参考。

Supervisor 在 OPPO / realme / OnePlus 设备（ColorOS 15+）上，可将 Agent 运行状态展示为**流体云**胶囊/卡片；App 前台时走端侧意图共享，App 后台或被杀死时走 OPPO Push 远程更新。

## 能力概览

| 场景                        | 机制                                                                       | 前提                                     |
| --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| App 前台、聊天页 Agent 运行 | Android `ContentProvider` 调用系统 `IntelligentIntentProvider.shareIntent` | 已配置 `serviceId`，系统开启意图框架     |
| App 后台、进程存活          | 同上（由 Web UI `use-live-status` 驱动）                                   | 同上                                     |
| App 被杀死                  | Supervisor 服务端 OPPO Push `intelligent_intent`                           | OPPO Push `registration_id` + 服务端密钥 |

垂域映射：Supervisor Agent 任务使用 **`entityName: "TASK"`**（进度模板）。

## 如何申请 OPPO 流体云资格

### 1. 注册 OPPO 开放平台

1. 打开 [OPPO 开放平台](https://open.oppomobile.com/) 并注册开发者账号。
2. 完成企业/个人实名认证（流体云通常要求应用与开发者主体一致）。

### 2. 创建应用

1. 控制台 → **应用服务** → 创建应用。
2. 填写包名（与 `com.supervisor.app` 一致）、应用名称、签名 SHA256。
3. 上传 APK 或填写签名信息供审核。

### 3. 开通消息推送（OPPO Push）

1. 在应用详情中进入 **推送服务 / OPPO PUSH**。
2. 开通后获取：
   - **AppKey**（即 `app_key`）
   - **MasterSecret**（服务端密钥，仅保存在服务器）
3. 集成 OPPO 客户端 Push SDK（`com.heytap.msp:push`），获取设备的 **`registration_id`**（与 FCM token 不同）。

> 当前仓库已预留 `getManufacturerPushToken()` 接口；完整远程推送还需在 `supervisor-mobile` 集成 HeyTap Push SDK 并在注册回调里上报 `registration_id`。

### 4. 申请智慧服务 / 流体云 / 意图共享

流体云属于 **意图框架（Intelligent Intent）** 能力，不能仅靠普通推送自动开通：

1. 在 OPPO 开放平台或联系 OPPO 商务/技术支持，说明业务场景：**AI Agent 长任务进度（TASK 垂域）**。
2. 提交材料通常包括：应用说明、界面截图、是否需要锁屏/状态栏展示、测试账号。
3. OPPO 审核通过后分配：
   - **`intentName`**（如 `Example.Progress`，以 OPPO 分配为准）
   - **`serviceId.launcher`** — 桌面/入口卡片 ID
   - **`serviceId.fluidCloud`** — 流体云卡片 ID
4. 测试阶段需在 ColorOS 15+ 真机按 OPPO 文档完成**测试环境搭建**（`intent_env = 1`）。

参考文档：

- [ColorOS 15 流体云介绍](https://www.coloros.com/article/A00000075/)
- [阿里云 EMAS：OPPO 流体云推送指南](https://help.aliyun.com/zh/document_detail/2997310.html)（参数结构与 OPPO 官方一致）
- T/TAF 283 终端意图框架（意图共享 `shareIntent` 接口）

### 5. 可选：阿里云 EMAS 代管推送

若不想自建 OPPO Push 鉴权，可接入 [阿里云移动推送 EMAS](https://help.aliyun.com/zh/document_detail/2997310.html)，在控制台配置 **流体云 ClientId / ClientSecret**，通过 EMAS OpenAPI 发送 `AndroidOppoIntelligentIntent`。本仓库默认实现为**直连 OPPO Push Server API**（`https://api.push.oppomobile.com`）。

## 客户端配置

审核通过后，在 `packages/supervisor-mobile/android/app/src/main/res/values/oppo_fluid_cloud.xml`（或在宿主 App 覆盖同名 string）填写：

```xml
<string name="supervisor_oppo_intent_name">Example.Progress</string>
<string name="supervisor_oppo_service_id_launcher">999800001</string>
<string name="supervisor_oppo_service_id_fluid_cloud">999900001</string>
```

`intelligent_intent_config.json` 已放在原生插件 `assets/`，并在 `AndroidManifest.xml` 中声明 `IntelligentIntentConfig`。

Deep Link：`supervisor://session/{sessionId}`，点击流体云卡片可回到对应会话。

## 服务端配置

在 Supervisor 数据目录的 `settings.json`（或通过扩展写入）增加：

```json
{
  "pushOppoAppKey": "OPPO_PUSH_APP_KEY",
  "pushOppoMasterSecretEncrypted": "<encrypt 工具加密后的 master_secret>",
  "pushOppoIntentName": "Example.Progress",
  "pushOppoServiceIdLauncher": "999800001",
  "pushOppoServiceIdFluidCloud": "999900001",
  "pushOppoTestEnv": true
}
```

兼容旧字段名：`pushOppoClientId` / `pushOppoClientSecretEncrypted` 仍可作为 AppKey / MasterSecret 使用。

设备注册 POST `/devices` 时额外上报：

```json
{
  "manufacturer": "OPPO",
  "manufacturerPushToken": "OPPO_REGISTRATION_ID"
}
```

## 验证

1. **端侧（推荐先测）**
   - ColorOS 15+ OPPO 真机安装 debug 包。
   - 填好 `serviceId` 并完成 OPPO 测试环境搭建。
   - 打开会话触发 Agent → 状态栏/锁屏应出现流体云胶囊。
   - 调用 `SupervisorNative.isOppoLiveUpdatesAvailable()`，`available: true` 表示就绪。

2. **远程推送**
   - 配置服务端 OPPO Push 密钥。
   - 设备上报 `manufacturerPushToken`。
   - Agent `agent_start` → 创建（`actionStatus: 0`）；运行中更新（`1`）；`agent_end` → 结束（`2`）。

3. **失败排查**
   - `oppo_service_id_not_configured` — 未填 serviceId。
   - `intelligent_intent_framework_disabled` — 系统设置中关闭意图共享或未通过 OPPO 审核。
   - 远程无效果 — 检查是否误用 FCM token 代替 OPPO `registration_id`。

## 相关源码

- 端侧：`packages/pi-supervisor-native-bridge/android/.../OppoFluidCloudManager.java`
- 服务端：`packages/supervisor/src/core/push-oppo-fluid-cloud.ts`
- 意图 JSON 构造：`packages/supervisor/src/core/push-oppo-intelligent-intent.ts`
