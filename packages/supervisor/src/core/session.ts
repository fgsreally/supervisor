import { readFileSync } from "node:fs";
import type {
	AgentHarness,
	AgentMessage,
	AgentTool,
	SessionTreeEntry,
	ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { getModel, type ImageContent, type KnownProvider, type Model } from "@earendil-works/pi-ai";
import { expandPromptTemplate, type PromptTemplate } from "../agent/prompt-templates.js";
import { resolveModelWithProviderOverrides } from "../utils/model-utils.js";
import type { Skill } from "../agent/skills.js";
import type { SourceInfo } from "../utils/source-info.js";
import type { SessionRow } from "../types.js";

export type SlashCommandSource = "plugin" | "prompt" | "skill";

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: SlashCommandSource;
	sourceInfo: SourceInfo;
}

export interface SessionState {
	id: number;
	sessionId: string | null;
	cwd: string;
	status: SessionRow["status"];
	model: { provider: string; modelId: string };
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	messageCount: number;
	leafId: string | null;
}

export interface SessionOptions {
	session: SessionRow;
	harness: AgentHarness;
	skills?: Skill[];
	promptTemplates?: PromptTemplate[];
	getSession: () => SessionRow | undefined;
	getMessages: () => Promise<SessionTreeEntry[]>;
	getProvider?: (id: number) => { baseUrl: string | null; apiType: string } | undefined;
}

export class SessionRuntime {
	readonly id: number;
	readonly harness: AgentHarness;
	readonly cwd: string;
	readonly skills: Skill[];
	readonly promptTemplates: PromptTemplate[];

	private getSession: () => SessionRow | undefined;
	private getMessagesForSession: () => Promise<SessionTreeEntry[]>;
	private getProvider: ((id: number) => { baseUrl: string | null; apiType: string } | undefined) | undefined;

	constructor(options: SessionOptions) {
		this.id = options.session.id;
		this.cwd = options.session.cwd;
		this.harness = options.harness;
		this.skills = options.skills ?? [];
		this.promptTemplates = options.promptTemplates ?? [];
		this.getSession = options.getSession;
		this.getMessagesForSession = options.getMessages;
		this.getProvider = options.getProvider;
	}

	private expandSkillCommand(text: string): string {
		if (!text.startsWith("/skill:")) return text;
		const spaceIndex = text.indexOf(" ");
		const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
		const skill = this.skills.find((s) => s.name === skillName);
		if (!skill) return text;
		try {
			const rawContent = readFileSync(skill.filePath, "utf-8");
			let body = rawContent;
			if (rawContent.startsWith("---")) {
				const end = rawContent.indexOf("\n---", 3);
				if (end !== -1) body = rawContent.slice(end + 4).trim();
			}
			const block = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
			return args ? `${block}\n\n${args}` : block;
		} catch {
			return text;
		}
	}

	async prompt(message: string, images?: ImageContent[]): Promise<void> {
		let expanded = this.expandSkillCommand(message);
		expanded = expandPromptTemplate(expanded, this.promptTemplates);
		await this.harness.prompt(expanded, images?.length ? { images } : undefined);
	}

	steer(message: string): void { this.harness.steer(message); }
	followUp(message: string): void { this.harness.followUp(message); }
	async abort(): Promise<void> { await this.harness.abort(); }

	async compact(customInstructions?: string): Promise<{
		summary: string; firstKeptEntryId: string; tokensBefore: number; details?: unknown;
	}> {
		return this.harness.compact(customInstructions);
	}

	async reloadMessagesFromSessionTree(): Promise<void> {
		const h = this.harness as unknown as { session: { buildContext(): Promise<{ messages: AgentMessage[] }> } };
		const ctx = await h.session.buildContext();
		this.harness.agent.state.messages = ctx.messages;
	}

	async appendCompactionResult(
		summary: string, firstKeptEntryId: string, tokensBefore: number, details?: unknown,
	): Promise<void> {
		const h = this.harness as unknown as {
			session: { appendCompaction(s: string, f: string, t: number, d?: unknown, h?: boolean): Promise<string> };
		};
		await h.session.appendCompaction(summary, firstKeptEntryId, tokensBefore, details, false);
		await this.reloadMessagesFromSessionTree();
	}

	async setModel(provider: string, modelId: string): Promise<Model<any>> {
		const model = this.getProvider
			? resolveModelWithProviderOverrides({ getProvider: this.getProvider }, provider, modelId)
			: getModel(provider as KnownProvider, modelId as never);
		if (!model) throw new Error(`Model ${modelId} from ${provider} not found`);
		await this.harness.setModel(model);
		return model;
	}

	async setThinkingLevel(level: ThinkingLevel): Promise<void> { await this.harness.setThinkingLevel(level); }
	async setActiveTools(toolNames: string[]): Promise<void> { await this.harness.setActiveTools(toolNames); }
	async setTools(tools: AgentTool[], activeToolNames?: string[]): Promise<void> {
		await this.harness.setTools(tools, activeToolNames);
	}

	async getMessages(): Promise<SessionTreeEntry[]> { return this.getMessagesForSession(); }

	async getState(): Promise<SessionState> {
		const s = this.getSession();
		if (!s) throw new Error(`Session ${this.id} not found`);
		const messages = await this.getMessagesForSession();
		const m = this.harness.agent.state.model;
		return {
			id: s.id, sessionId: s.session_id, cwd: s.cwd, status: s.status,
			model: { provider: m.provider, modelId: m.id },
			thinkingLevel: this.harness.agent.state.thinkingLevel,
			isStreaming: s.status === "running",
			messageCount: messages.filter((e) => e.type === "message").length,
			leafId: s.leaf_id,
		};
	}

	getSlashCommands(): SlashCommandInfo[] {
		const skills = this.skills.map((s) => ({
			name: `skill:${s.name}`, description: s.description, source: "skill" as const, sourceInfo: s.sourceInfo,
		}));
		const templates = this.promptTemplates.map((t) => ({
			name: t.name, description: t.description, source: "prompt" as const, sourceInfo: t.sourceInfo,
		}));
		return [...skills, ...templates];
	}

	getLastAssistantText(): string | undefined {
		for (let i = this.harness.agent.state.messages.length - 1; i >= 0; i--) {
			const msg = this.harness.agent.state.messages[i] as AgentMessage | undefined;
			if (!msg || msg.role !== "assistant") continue;
			const c = msg.content;
			if (typeof c === "string") return c;
			return c.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("");
		}
		return undefined;
	}
}
