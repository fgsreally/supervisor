# 资源管理

资源（Resources）分为以下几类来源：

1. **Supervisor 全局资源**：`~/.supervisor/global/skills/`、`prompts/`、`extensions/`
2. **npx skills 全局 Skill**：`~/.agents/skills/`（`npx skills add -g` 的 canonical 目录；也会扫描 `~/.config/agents/skills` 作为 fallback）
3. **Agent 资源**：全局 catalog 中的资源绑定到某个 Agent 后，可在 Agent 资源浏览器中查看
4. **项目 Skill**：`<project cwd>/.agents/skills/`（`npx skills add` 默认项目范围）。Session 运行时自动合并，无需绑定到 Agent

## Session 可用 Skill

```
Session skills = Agent 已启用绑定的 skills ∪ 项目 .agents/skills
```

同名时项目 skill 优先。npx 全局 skill 与 Supervisor 自有全局 skill 一样，仍需绑定到 Agent 才会进入 Session。

## 资源类型

### Skills

SKILL.md 格式的技能包。可通过斜杠命令或 `skill` 工具激活。

### Prompts

可复用的 prompt 模板。通过 `/` 补全在 ChatComposer 中输入。

### Extensions

`defineExtension` 风格的扩展文件，通过 `jiti` 加载。

## 组件

| 组件                        | 作用                  |
| --------------------------- | --------------------- |
| `ResourcesPanel.vue`        | 全局资源列表与分类    |
| `SkillInstallDialog.vue`    | Skill 搜索 / 链接导入 |
| `ResourceContentView.vue`   | 资源内容查看与编辑    |
| `ResourceFileListItem.vue`  | 资源文件列表项        |
| `ResourceLayerBadge.vue`    | 资源层级标签（global / project） |
| `GlobalResourceLinkBar.vue` | 全局资源导航          |
| `SkillFileTree.vue`         | Skill 文件树          |
| `SkillFileListItem.vue`     | Skill 文件列表项      |

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

- Skills 可通过搜索（`GET /skills/search`）或直接粘贴链接安装到 Supervisor 全局目录
- 来自 `npx skills -g` 的外部 skill 会出现在全局库中，但 UI 不可卸载（需用 `npx skills remove -g`）
- 项目 skill 由仓库内 `.agents/skills/` 或 `npx skills add`（不加 `-g`）管理，只读展示
- 资源系统是 supervisor 扩展能力的 UI 层面体现
- 通过 `AgentResourceBrowser.vue` 可在 Agent 配置页面直接查看和编辑链接后的资源内容
