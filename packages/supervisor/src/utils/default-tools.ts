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
import {
  createSupervisorBashTool,
  type BashJobHost,
  type SupervisorBashOptions,
} from "../tools/bash/index.js";

export type DefaultToolsOptions = ToolsOptions & {
  /** Session id for background bash tasks (kimi-style run_in_background). */
  sessionId?: number;
  /** Job host used by background bash. Omit → foreground-only. */
  jobs?: BashJobHost;
  /** Extra env for bash (e.g. registered service ports). */
  getEnv?: () => NodeJS.ProcessEnv;
};

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

function createExplorationTools(cwd: string, options?: ToolsOptions): AgentTool[] {
  return [
    createGrepTool(cwd, options?.grep),
    createFindTool(cwd, options?.find),
    createLsTool(cwd, options?.ls),
  ];
}

function replacePiBash(tools: AgentTool[], bash: AgentTool): AgentTool[] {
  const without = tools.filter((tool) => tool.name !== "bash");
  return [...without, bash];
}

function buildSupervisorBash(cwd: string, options?: DefaultToolsOptions): AgentTool {
  const merged = resolveToolsOptions(cwd, options);
  const bashOptions: SupervisorBashOptions = {
    cwd,
    sessionId: options?.sessionId,
    jobs: options?.jobs,
    shellPath: merged.bash?.shellPath,
    commandPrefix: merged.bash?.commandPrefix,
    getEnv: options?.getEnv,
  };
  return createSupervisorBashTool(bashOptions);
}

/**
 * Default supervisor tools: pi coding tools with Supervisor bash (fg + bg) replacing pi bash.
 * Background tasks require sessionId + jobs (wired by SessionManager).
 */
export function createDefaultTools(
  cwd: string,
  preset: ToolsPreset = "coding",
  options?: DefaultToolsOptions,
): AgentTool[] {
  const merged = resolveToolsOptions(cwd, options);
  const bash = buildSupervisorBash(cwd, options);
  switch (preset) {
    case "coding":
      return replacePiBash(
        [...createCodingTools(cwd, merged), ...createExplorationTools(cwd, merged)],
        bash,
      );
    case "readonly":
      return replacePiBash(createReadOnlyTools(cwd, merged), bash);
    case "none":
      return [];
  }
}
