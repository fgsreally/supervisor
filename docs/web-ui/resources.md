# 资源管理

资源（Resources）分为两类：

1. **全局资源**：存放在 `~/.pi/supervisor/global/skills/`、`prompts/`、`extensions/` 下
2. **Agent 资源**：全局资源链接到某个 agent 后，可在 Agent 的资源浏览器中查看和编辑

## 资源类型

### Skills

SKILL.md 格式的技能包。agent 对话时自动加载对应 skill。

### Prompts

可复用的 prompt 模板。通过 `/` 补全在 ChatComposer 中输入。

### Extensions

`defineExtension` 风格的扩展文件，通过 `jiti` 加载。

## 组件

| 组件                        | 作用               |
| --------------------------- | ------------------ |
| `ResourcesPanel.vue`        | 全局资源列表与分类 |
| `SkillInstallDialog.vue`    | Skill 搜索 / 链接导入 |
| `ResourceContentView.vue`   | 资源内容查看与编辑 |
| `ResourceFileListItem.vue`  | 资源文件列表项     |
| `ResourceLayerBadge.vue`    | 资源层级标签       |
| `GlobalResourceLinkBar.vue` | 全局资源导航       |
| `SkillFileTree.vue`         | Skill 文件树       |
| `SkillFileListItem.vue`     | Skill 文件列表项   |

## Store

`useResourceStore()`（`src/store/index.ts`）：

- `globalSkills: ResourceFile[]`
- `globalPrompts: ResourceFile[]`
- `globalExtensions: ResourceFile[]`
- `resourceItems: AgentResource[]` — 当前 agent 已链接的资源

Action：`fetchGlobalResources`、`linkResource`

## 资源页面

`ResourceDetailView.vue`（路由 `/resources/:resourceId?`）作为独立标签页展示全局资源。

## 备注

- Skills 可通过搜索（`GET /skills/search`）或直接粘贴链接安装
- 资源系统是 supervisor 扩展能力的 UI 层面体现
- 通过 `AgentResourceBrowser.vue` 可在 Agent 配置页面直接查看和编辑链接后的资源内容
