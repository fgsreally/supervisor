import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ensureAgentHome,
	ensureGlobalResourceDirs,
	getAgentHomeDir,
	linkGlobalResourceToAgent,
	writeAgentHomeSystemPrompt,
} from "./agent-paths.js";
import { getDefaultCwd } from "../config/default-cwd.js";
import type { SessionManager } from "../core/session-manager.js";

const BUILTIN_AGENT_NAME = "Pi 助手";
const BUILTIN_SESSION_NAME = "Pi 助手";

const BUILTIN_SYSTEM_PROMPT = `你是 Pi Supervisor 内置助手，专门帮助用户配置和使用 Supervisor。
你可以帮助用户：
- 理解 Supervisor 的架构：全局资源库（~/.pi/supervisor/global/）、Agent 目录、会话树
- 将 pi-coding-agent 插件迁移到 Supervisor 扩展（放到 agent 的 extensions/ 或全局 extensions/）
- 安装 skill 到全局库或指定 Agent（通过符号链接关联）
- 配置模型 Provider、创建智能代理、管理会话
- 解答 ask 工具、PWA 推送、聊天 UI 组件等使用问题
回答时简洁、可操作，优先给出具体路径和步骤。不确定时说明需要用户补充的信息。`;

const SUPERVISOR_GUIDE_SKILL = `# Supervisor 使用指南

## 目录结构

- 全局资源：\`~/.pi/supervisor/global/{skills,extensions,prompts}\`
- Agent 目录：\`~/.pi/supervisor/agents/{agentId}/\`
- 数据库：\`~/.pi/supervisor.db\`

Agent 通过符号链接引用全局资源，而非复制文件。
## 扩展迁移（coding-agent -> supervisor）
1. 将扩展入口放到 \`extensions/\` 目录
2. Supervisor 扩展 API 见 \`packages/supervisor/src/extension-system/\`
3. 使用 \`pi-supervisor extensions install <agent-id> <path>\` 安装到指定 Agent

## Skill 安装

1. 将 skill 目录放入 \`~/.pi/supervisor/global/skills/\`
2. 在 UI 资源面板或 API \`POST /agents/:id/resources/link\` 关联到 Agent
3. 输入框 \`/\` 可补全已关联的 skill 和 prompt

## 常用 API

- \`POST /sessions/:id/prompt\` - 发送消息
- \`POST /sessions/:id/ask-answer\` - 回答 ask 工具问题
- \`GET /resources/global\` - 列出全局资源

## Web UI 组件

见 \`packages/supervisor-web-ui/README.md\` 组件映射表。`;

function pickProvider(db: SupervisorDb): { providerId: number; modelId: string } | null {
	const providers = db.listProviders().filter((p) => p.isEnabled);
	for (const p of providers) {
		const models = db.listModels().filter((m) => m.providerId === p.id);
		if (models.length > 0) return { providerId: p.id, modelId: models[0].modelId };
	}
	return null;
}

function findBuiltinAgentId(db: SupervisorDb): number | undefined {
	for (const agent of db.listAgents()) {
		if ((agent.meta as any)?.builtin === true) return agent.id;
	}
	return undefined;
}

function findBuiltinSessionId(db: SupervisorDb): number | undefined {
	for (const session of db.list()) {
		if ((session.meta as any)?.builtin === true) return session.id;
	}
	return undefined;
}

function installBuiltinSkill(agentHomeDir: string): void {
	const globalRoot = ensureGlobalResourceDirs();
	const skillDir = join(globalRoot, "skills", "supervisor-guide");
	mkdirSync(skillDir, { recursive: true });
	const skillPath = join(skillDir, "SKILL.md");
	if (!existsSync(skillPath)) {
		writeFileSync(skillPath, SUPERVISOR_GUIDE_SKILL, "utf8");
	}
	try {
		linkGlobalResourceToAgent(agentHomeDir, "skills", skillDir);
	} catch {
		// already linked or platform issue - non-fatal
	}
}

/** Ensure built-in Pi assistant agent and pinned session exist. Does not block server listen. */
export function ensureBuiltinAssistant(db: SupervisorDb, manager: SessionManager): void {
	const providerPick = pickProvider(db);
	if (!providerPick) {
		console.warn("[pi-supervisor] No provider configured - skipping built-in Pi assistant setup");
		return;
	}

	const { providerId, modelId } = providerPick;
	let agentId = findBuiltinAgentId(db);
	let agent = agentId !== undefined ? db.getAgent(agentId) : undefined;

	if (!agent) {
		agent = db.insertAgent({
			name: BUILTIN_AGENT_NAME,
			description: "Supervisor 内置助手：配置、迁移插件、安装 skill 等",
			provider_id: providerId,
			model_id: modelId,
			tools_preset: "coding",
			meta: { builtin: true },
		});
		agentId = agent.id;
	}

	const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
	ensureAgentHome(agent.id, homeDir);
	writeAgentHomeSystemPrompt(homeDir, BUILTIN_SYSTEM_PROMPT);
	installBuiltinSkill(homeDir);

	let sessionId = findBuiltinSessionId(db);
	if (!sessionId) {
		const session = manager.create({
			agentId: agent.id,
			cwd: getDefaultCwd(),
			meta: {
				name: BUILTIN_SESSION_NAME,
				pinned: true,
				builtin: true,
				description: "Supervisor 内置助手会话",
			},
		});
		sessionId = session.id;
	}

	const session = sessionId !== undefined ? db.get(sessionId) : undefined;
	if (session) {
		const meta = typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta;
		db.updateMeta(sessionId, {
			...meta,
			name: BUILTIN_SESSION_NAME,
			pinned: true,
			builtin: true,
		});
	}
}
