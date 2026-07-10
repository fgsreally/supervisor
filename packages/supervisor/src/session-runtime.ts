import { readFileSync } from "node:fs";
import type {
	AgentHarness,
	AgentHarnessEvent,
	AgentMessage,
	AgentTool,
	SessionTreeEntry,
	ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { getModel, type ImageContent, type KnownProvider, type Model } from "@earendil-works/pi-ai";
import { expandPromptTemplate, type PromptTemplate } from "./agent/prompt-templates.js";
import type { Skill } from "./agent/skills.js";
import type { SourceInfo } from "./utils/source-info.js";
import type { Session } from "./types.js";

interface HarnessSessionTree {
	buildContext(): Promise<{ messages: AgentMessage[] }>;
	appendCompaction(
		summary: string,
		firstKeptEntryId: string,
		tokensBefore: number,
		details?: unknown,
		fromHook?: boolean,
	): Promise<string>;
}

function harnessSession(harness: unknown): HarnessSessionTree {
	return (harness as { session: HarnessSessionTree }).session;
}

export type SlashCommandSource = "extension" | "prompt" | "skill";

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: SlashCommandSource;
	sourceInfo: SourceInfo;
}

export interface SupervisorSessionState {
	id: string;
	sessionId: string | null;
	cwd: string;
	status: Session["status"];
	model: {
		provider: string;
		modelId: string;
	};
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	messageCount: number;
	leafId: string | null;
}

export interface SupervisorSessionRuntimeOptions {
	session: Session;
	harness: AgentHarness;
	skills?: Skill[];
	promptTemplates?: PromptTemplate[];
	getSession: () => Session | undefined;
	getMessages: () => Promise<SessionTreeEntry[]>;
}

export type SupervisorSessionEvent = AgentHarnessEvent;
export type SupervisorSessionEventListener = (event: SupervisorSessionEvent) => void | Promise<void>;

export class SupervisorSessionRuntime {
	readonly id: string;
	readonly harness: AgentHarness;

	private getSession: () => Session | undefined;
	private getMessagesForSession: () => Promise<SessionTreeEntry[]>;
	private listeners = new Set<SupervisorSessionEventListener>();
	private skills: Skill[];
	private promptTemplates: PromptTemplate[];

	constructor(options: SupervisorSessionRuntimeOptions) {
		this.id = options.session.id;
		this.harness = options.harness;
		this.skills = options.skills ?? [];
		this.promptTemplates = options.promptTemplates ?? [];
		this.getSession = options.getSession;
		this.getMessagesForSession = options.getMessages;

		this.harness.subscribe((event) => {
			void this.emit(event);
		});
	}

	private async emit(event: SupervisorSessionEvent): Promise<void> {
		for (const listener of this.listeners) {
			await listener(event);
		}
	}

	subscribe(listener: SupervisorSessionEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Expand /skill:name commands to full skill content (XML format, matching coding-agent).
	 */
	private expandSkillCommand(text: string): string {
		if (!text.startsWith("/skill:")) return text;

		const spaceIndex = text.indexOf(" ");
		const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);

		const skill = this.skills.find((s) => s.name === skillName);
		if (!skill) return text;

		try {
			const rawContent = readFileSync(skill.filePath, "utf-8");
			// Strip frontmatter
			let body = rawContent;
			if (rawContent.startsWith("---")) {
				const end = rawContent.indexOf("\n---", 3);
				if (end !== -1) {
					body = rawContent.slice(end + 4).trim();
				}
			}
			const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
			return args ? `${skillBlock}\n\n${args}` : skillBlock;
		} catch {
			return text;
		}
	}

	async prompt(message: string, images?: ImageContent[]): Promise<void> {
		let expanded = this.expandSkillCommand(message);
		expanded = expandPromptTemplate(expanded, this.promptTemplates);
		await this.harness.prompt(expanded, images?.length ? { images } : undefined);
	}

	steer(message: string): void {
		this.harness.steer(message);
	}

	followUp(message: string): void {
		this.harness.followUp(message);
	}

	async abort(): Promise<void> {
		await this.harness.abort();
	}

	async compact(customInstructions?: string): Promise<{
		summary: string;
		firstKeptEntryId: string;
		tokensBefore: number;
		details?: unknown;
	}> {
		return this.harness.compact(customInstructions);
	}

	/** Reload in-memory agent messages from the persisted session tree. */
	async reloadMessagesFromSessionTree(): Promise<void> {
		const session = harnessSession(this.harness);
		const context = await session.buildContext();
		this.harness.agent.state.messages = context.messages;
	}

	/** Persist a compaction entry and sync agent state. */
	async appendCompactionResult(
		summary: string,
		firstKeptEntryId: string,
		tokensBefore: number,
		details?: unknown,
	): Promise<void> {
		const session = harnessSession(this.harness);
		await session.appendCompaction(summary, firstKeptEntryId, tokensBefore, details, false);
		await this.reloadMessagesFromSessionTree();
	}

	async setModel(provider: string, modelId: string): Promise<Model<any>> {
		const model = getModel(provider as KnownProvider, modelId as never);
		if (!model) {
			throw new Error(`Model ${modelId} from provider ${provider} not found`);
		}
		await this.harness.setModel(model);
		return model;
	}

	async setThinkingLevel(level: ThinkingLevel): Promise<void> {
		await this.harness.setThinkingLevel(level);
	}

	async setActiveTools(toolNames: string[]): Promise<void> {
		await this.harness.setActiveTools(toolNames);
	}

	async setTools(tools: AgentTool[], activeToolNames?: string[]): Promise<void> {
		await this.harness.setTools(tools, activeToolNames);
	}

	async getMessages(): Promise<SessionTreeEntry[]> {
		return this.getMessagesForSession();
	}

	async getState(): Promise<SupervisorSessionState> {
		const session = this.getSession();
		if (!session) throw new Error(`Session ${this.id} not found`);
		const messages = await this.getMessagesForSession();
		const model = this.harness.agent.state.model;
		return {
			id: session.id,
			sessionId: session.sessionId,
			cwd: session.cwd,
			status: session.status,
			model: {
				provider: model.provider,
				modelId: model.id,
			},
			thinkingLevel: this.harness.agent.state.thinkingLevel,
			isStreaming: session.status === "running",
			messageCount: messages.filter((entry) => entry.type === "message").length,
			leafId: session.leafId,
		};
	}

	/**
	 * Return available dynamic slash commands: skills + prompt templates.
	 * Mirrors coding-agent's AgentSession.getSlashCommands().
	 */
	getSlashCommands(): SlashCommandInfo[] {
		// Extension commands will be added back when new extension system is implemented
		const extensionCommands: SlashCommandInfo[] = [];
		const skillCommands: SlashCommandInfo[] = this.skills.map((s) => ({
			name: `skill:${s.name}`,
			description: s.description,
			source: "skill" as const,
			sourceInfo: s.sourceInfo,
		}));
		const templateCommands: SlashCommandInfo[] = this.promptTemplates.map((t) => ({
			name: t.name,
			description: t.description,
			source: "prompt" as const,
			sourceInfo: t.sourceInfo,
		}));
		return [...extensionCommands, ...skillCommands, ...templateCommands];
	}

	getLastAssistantText(): string | undefined {
		for (let i = this.harness.agent.state.messages.length - 1; i >= 0; i--) {
			const message = this.harness.agent.state.messages[i] as AgentMessage | undefined;
			if (!message || message.role !== "assistant") continue;
			const content = message.content;
			if (typeof content === "string") return content;
			return content
				.filter((part): part is { type: "text"; text: string } => part.type === "text")
				.map((part) => part.text)
				.join("");
		}
		return undefined;
	}
}
