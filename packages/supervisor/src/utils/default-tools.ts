import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  createCodingTools,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadOnlyTools,
  SettingsManager,
  type ToolsOptions,
} from "@earendil-works/pi-coding-agent";
import type { ToolsPreset } from "../types.js";

const BASH_INTENT_ERROR =
  "bash tool requires a non-empty `intent` field describing why you are running this command.";

function assertBashIntent(params: unknown): void {
  const intent =
    typeof params === "object" &&
    params !== null &&
    "intent" in params &&
    typeof params.intent === "string"
      ? params.intent.trim()
      : "";
  if (!intent) {
    throw new Error(BASH_INTENT_ERROR);
  }
}

function requireBashIntent(tool: AgentTool): AgentTool {
  const execute = tool.execute.bind(tool);
  const prepareArguments = tool.prepareArguments?.bind(tool);
  return {
    ...tool,
    description: `${tool.description} The \`intent\` parameter is required: a one-line summary of why you run the command.`,
    prepareArguments(args) {
      const prepared = prepareArguments ? prepareArguments(args) : args;
      assertBashIntent(prepared);
      return prepared;
    },
    async execute(toolCallId, params, signal, onUpdate) {
      assertBashIntent(params);
      return execute(toolCallId, params, signal, onUpdate);
    },
  };
}

function wrapTools(tools: AgentTool[]): AgentTool[] {
  return tools.map((tool) => (tool.name === "bash" ? requireBashIntent(tool) : tool));
}

/** Exploration tools from pi-coding-agent (not included in createCodingTools). */
function createExplorationTools(cwd: string, options?: ToolsOptions): AgentTool[] {
  return [
    createGrepTool(cwd, options?.grep),
    createFindTool(cwd, options?.find),
    createLsTool(cwd, options?.ls),
  ];
}

/** Match interactive pi: merge global + project settings for bash shell resolution. */
export function resolveToolsOptions(cwd: string, overrides?: ToolsOptions): ToolsOptions {
  const settings = SettingsManager.create(cwd);
  const shellPath = settings.getShellPath();
  const commandPrefix = settings.getShellCommandPrefix();

  const fromSettings: ToolsOptions = {};
  if (shellPath || commandPrefix) {
    fromSettings.bash = { shellPath, commandPrefix };
  }

  if (!overrides) return fromSettings;

  return {
    ...fromSettings,
    ...overrides,
    bash: { ...fromSettings.bash, ...overrides.bash },
    read: { ...fromSettings.read, ...overrides.read },
    write: { ...fromSettings.write, ...overrides.write },
    edit: { ...fromSettings.edit, ...overrides.edit },
    grep: { ...fromSettings.grep, ...overrides.grep },
    find: { ...fromSettings.find, ...overrides.find },
    ls: { ...fromSettings.ls, ...overrides.ls },
  };
}

/**
 * Default supervisor tools: pi coding tools plus grep/find/ls for exploration.
 * Additional capabilities come from packaged tools (`src/tools/`) and extensions.
 */
export function createDefaultTools(
  cwd: string,
  preset: ToolsPreset = "coding",
  options?: ToolsOptions,
): AgentTool[] {
  const merged = resolveToolsOptions(cwd, options);
  switch (preset) {
    case "coding":
      return wrapTools([...createCodingTools(cwd, merged), ...createExplorationTools(cwd, merged)]);
    case "readonly":
      return wrapTools(createReadOnlyTools(cwd, merged));
    case "none":
      return [];
  }
}
