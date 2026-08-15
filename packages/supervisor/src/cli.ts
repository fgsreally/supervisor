#!/usr/bin/env bun
import prompts from "prompts";
import { createSupervisorCli } from "./cli-definition.js";
import { BUILT_IN_PROVIDERS } from "./config/built-in-providers.js";
import {
  dedupeBuiltinAssistantSessions,
  ensureBuiltinAssistant,
  ensurePackagedAgents,
} from "./agent/index.js";
import { SupervisorDb } from "./db/db.js";
import { getDefaultCwd, resolveWorkspacePath, setDefaultCwd } from "./config/default-cwd.js";
import { resolveDbPath } from "./config/resolve-db-path.js";
import { createHttpServer } from "./http/http-server.js";
import { SessionManager } from "./core/session-manager.js";
import { attachPushDispatcher } from "./core/push-dispatcher.js";
import { startDailyWorkScheduler } from "./core/daily-work.js";
import type { Provider } from "./types.js";
import { encryptApiKey } from "./utils/encrypt.js";
import { readSupervisorSettings, writeSupervisorSettings } from "./utils/supervisor-settings.js";
import { registerWebSocketRoutes } from "./websocket/server.js";
import { startQuickTunnel } from "./utils/cloudflare-tunnel.js";
import { resolveUiDistDir } from "./utils/ui-dist.js";
import { resolveWebPin } from "./utils/web-password.js";
import { getSupervisorHome, setSupervisorHome } from "./utils/supervisor-home.js";
import { writeLog } from "./i18n/logs.js";
import {
  buildDevPublicUrl,
  printExternalAgentAvailability,
  printStartupBanner,
  printTunnelError,
  printTunnelStarting,
} from "./utils/startup-banner.js";

const KNOWN_CLI_OPTIONS = new Set([
  "port",
  "p",
  "cwd",
  "password",
  "tunnel",
  "ui-dir",
  "locale",
  "h",
  "help",
]);

function _parseExtensionFlags(argv: string[]): Record<string, string | boolean | undefined> {
  const flags: Record<string, string | boolean | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    if (KNOWN_CLI_OPTIONS.has(name)) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("-")) {
      flags[name] = next;
      i++;
    } else {
      flags[name] = true;
    }
  }
  return flags;
}

const cli = createSupervisorCli();
const parsed = cli.parse(process.argv, { run: false });
const values = parsed.options;
if (typeof values.locale === "string") process.env.PI_SUPERVISOR_LOCALE = values.locale;

function rawCliValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("-") ? value : undefined;
}

async function selectProviderLocal(db: SupervisorDb): Promise<Provider> {
  const providers = db.listProviders().filter((p) => p.isEnabled);
  if (providers.length === 0) {
    throw new Error("No providers configured. Run `pi-supervisor providers add` first.");
  }
  if (providers.length === 1) return providers[0];

  const { idx } = await prompts({
    type: "number",
    name: "idx",
    message: "Select provider #",
    min: 1,
    max: providers.length,
  });
  if (!idx) throw new Error("Cancelled.");
  return providers[idx - 1];
}

function getModelsByProvider(db: SupervisorDb, providerId: number) {
  return db.listModels().filter((m) => m.providerId === providerId);
}

function getPrimaryModelId(db: SupervisorDb, providerId: number): string | null {
  const models = getModelsByProvider(db, providerId);
  return models[0]?.modelId ?? null;
}

function showHelp() {
  cli.outputHelp();
}

if (values.help) {
  process.exit(0);
}

async function run() {
  const cwdArg = values.cwd as string | undefined;
  if (cwdArg) {
    const home = resolveWorkspacePath(cwdArg);
    setSupervisorHome(home);
    setDefaultCwd(home);
  }

  const db = new SupervisorDb(resolveDbPath());
  dedupeBuiltinAssistantSessions(db);
  const manager = new SessionManager(db);
  attachPushDispatcher(db, (listener) => manager.onAnySessionOutput(listener));
  const command = cli.matchedCommandName ?? "serve";
  const cmdArgs = [...parsed.args];

  switch (command) {
    case "serve": {
      const port = Number(values.port);
      process.env.PI_SUPERVISOR_URL = `http://127.0.0.1:${port}`;
      const workspaceCwd = getDefaultCwd();
      manager.createProject({ cwd: workspaceCwd });
      ensureBuiltinAssistant(db, manager);
      ensurePackagedAgents(db);
      // Read from argv so numeric-looking PINs keep their exact string form
      // (CAC otherwise coerces e.g. "0123" to the number 123).
      const { pin: webPassword, generated } = resolveWebPin(rawCliValue("password"));
      const wantTunnel = values.tunnel === true;
      const uiDir = resolveUiDistDir(rawCliValue("ui-dir"));
      const uiDistMissing = !uiDir;
      const devMode = process.env.PI_SUPERVISOR_DEV === "1";
      const uiPort = Number(process.env.PI_SUPERVISOR_UI_PORT || "5163");
      const publicUrl = devMode ? buildDevPublicUrl(uiPort) : null;
      const app = createHttpServer(manager, {
        password: webPassword,
        tunnelQuick: wantTunnel,
        uiDir: uiDir ?? undefined,
      });
      registerWebSocketRoutes(app, webPassword, manager);
      app.listen({ hostname: "0.0.0.0", port });
      manager.resumePersistedSessionInputs();
      startDailyWorkScheduler(db);

      let tunnelUrl: string | null = null;
      if (wantTunnel) {
        try {
          printTunnelStarting();
          const tunnel = await startQuickTunnel(port);
          tunnelUrl = tunnel.url;
        } catch (error) {
          printTunnelError(error instanceof Error ? error.message : String(error));
        }
      }

      printStartupBanner({
        port,
        pin: webPassword,
        pinGenerated: generated,
        home: getSupervisorHome(),
        database: resolveDbPath(),
        workspaceCwd,
        publicUrl,
        tunnelUrl,
        uiDistMissing,
        devMode,
      });
      printExternalAgentAvailability(manager.detectExternalAgents());
      break;
    }

    case "extensions": {
      const subCmd = cmdArgs[0];
      const manager = new SessionManager(db);
      await manager.ensureResourceCatalog();

      // Global catalog commands
      if (subCmd === "install") {
        const source = cmdArgs[1];
        if (!source) {
          writeLog("error", "cli.extensions.install.usage");
          process.exit(1);
        }
        const result = await manager.resources.installResource({ kind: "extension", source });
        const details = result.details ?? {};
        writeLog("info", "cli.extensions.installed", { slug: result.resource.slug });
        writeLog("info", "cli.extensions.rootDir", { value: String(details.rootDir ?? "") });
        writeLog("info", "cli.extensions.entry", { value: String(details.entryPath ?? "") });
        writeLog("info", "cli.extensions.deps", {
          value: String(details.installCommand ?? "none"),
        });
        db.close();
        break;
      }

      if (subCmd === "update") {
        const id = cmdArgs[1];
        if (!id) {
          writeLog("error", "cli.extensions.update.usage");
          process.exit(1);
        }
        const result = await manager.resources.updateResource("extension", id);
        const details = result.details ?? {};
        writeLog("info", "cli.extensions.updated", { slug: result.resource.slug });
        writeLog("info", "cli.extensions.rootDir", { value: String(details.rootDir ?? "") });
        writeLog("info", "cli.extensions.entry", { value: String(details.entryPath ?? "") });
        writeLog("info", "cli.extensions.deps", {
          value: String(details.installCommand ?? "none"),
        });
        db.close();
        break;
      }

      if (subCmd === "uninstall") {
        const id = cmdArgs[1];
        if (!id) {
          writeLog("error", "cli.extensions.uninstall.usage");
          process.exit(1);
        }
        await manager.resources.uninstallResource("extension", id);
        writeLog("info", "cli.extensions.uninstalled", { id });
        db.close();
        break;
      }

      if (subCmd === "list") {
        const resources = manager.resources.listResources("extension");
        if (resources.length === 0) {
          writeLog("info", "cli.extensions.none");
        } else {
          for (const resource of resources) {
            const ver = resource.version ? ` v${resource.version}` : "";
            writeLog("info", "cli.extensions.item", {
              slug: resource.slug,
              name: resource.name ?? resource.slug,
              version: ver,
              sourcePath: resource.sourcePath,
            });
          }
        }
        db.close();
        break;
      }

      if (subCmd === "bind") {
        const agentIdRaw = cmdArgs[1];
        const id = cmdArgs[2];
        if (!agentIdRaw || !id) {
          writeLog("error", "cli.extensions.bind.usage");
          process.exit(1);
        }
        const agentId = Number(agentIdRaw);
        if (!Number.isFinite(agentId)) {
          writeLog("error", "cli.extensions.agentIdNumber");
          process.exit(1);
        }
        manager.resources.bindResource({ agentId, kind: "extension", slug: id });
        writeLog("info", "cli.extensions.bound", { id, agentId });
        db.close();
        break;
      }

      if (subCmd === "unbind") {
        const agentIdRaw = cmdArgs[1];
        const id = cmdArgs[2];
        if (!agentIdRaw || !id) {
          writeLog("error", "cli.extensions.unbind.usage");
          process.exit(1);
        }
        const agentId = Number(agentIdRaw);
        if (!Number.isFinite(agentId)) {
          writeLog("error", "cli.extensions.agentIdNumber");
          process.exit(1);
        }
        await manager.resources.unbindResource({ agentId, kind: "extension", slug: id });
        writeLog("info", "cli.extensions.unbound", { id, agentId });
        db.close();
        break;
      }

      writeLog("error", "cli.extensions.unknown", { command: subCmd ?? "" });
      showHelp();
      db.close();
      process.exit(1);
      break;
    }

    case "config": {
      const searchProviders = ["duckduckgo", "tavily", "brave", "serper", "firecrawl"] as const;
      const fetchProviders = [
        "native",
        "tavily",
        "firecrawl",
        "native-then-tavily",
        "native-then-firecrawl",
      ] as const;
      const browserModes = ["headless", "headed"] as const;
      type CredentialProvider = "tavily" | "brave" | "serper" | "firecrawl";
      const ensureApiKey = async (provider: CredentialProvider): Promise<void> => {
        const current = readSupervisorSettings();
        const envFields = {
          tavily: "tavilyApiKeyEnv",
          brave: "braveApiKeyEnv",
          serper: "serperApiKeyEnv",
          firecrawl: "firecrawlApiKeyEnv",
        } as const;
        const encryptedFields = {
          tavily: "tavilyApiKeyEncrypted",
          brave: "braveApiKeyEncrypted",
          serper: "serperApiKeyEncrypted",
          firecrawl: "firecrawlApiKeyEncrypted",
        } as const;
        const envDefaults = {
          tavily: "TAVILY_API_KEY",
          brave: "BRAVE_API_KEY",
          serper: "SERPER_API_KEY",
          firecrawl: "FIRECRAWL_API_KEY",
        } as const;
        const envName = current[envFields[provider]] ?? envDefaults[provider];
        const configured = Boolean(process.env[envName] || current[encryptedFields[provider]]);
        const answer = await prompts({
          type: "password",
          name: "apiKey",
          message: `${provider} API key${configured ? " (leave blank to keep current)" : " (leave blank to skip)"}`,
        });
        const apiKey = typeof answer.apiKey === "string" ? answer.apiKey.trim() : "";
        if (!apiKey) {
          writeLog("info", "cli.config.apiKeyUnchanged", { provider });
          return;
        }
        writeSupervisorSettings({ [encryptedFields[provider]]: encryptApiKey(apiKey) });
        writeLog("info", "cli.config.apiKeySaved", { provider });
      };
      let section = cmdArgs[0];

      if (!section) {
        const answer = await prompts({
          type: "select",
          name: "section",
          message: "Select configuration section",
          choices: [
            { title: "Web Search", value: "web-search" },
            { title: "Web Fetch", value: "web-fetch" },
            { title: "Browser", value: "browser" },
            { title: "Show current configuration", value: "show" },
          ],
        });
        section = answer.section;
      }

      const settings = readSupervisorSettings();
      if (section === "show") {
        writeLog("info", "cli.config.browser", { value: settings.browserMode ?? "headless" });
        writeLog("info", "cli.config.webSearch", {
          value: settings.webSearchProvider ?? "duckduckgo",
        });
        writeLog("info", "cli.config.webFetch", { value: settings.webFetchProvider ?? "native" });
        writeLog("info", "cli.config.tavilyEnv", {
          value: settings.tavilyApiKeyEnv ?? "TAVILY_API_KEY",
        });
        writeLog("info", "cli.config.braveEnv", {
          value: settings.braveApiKeyEnv ?? "BRAVE_API_KEY",
        });
        writeLog("info", "cli.config.serperEnv", {
          value: settings.serperApiKeyEnv ?? "SERPER_API_KEY",
        });
        writeLog("info", "cli.config.firecrawlEnv", {
          value: settings.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY",
        });
      } else if (section === "web-search") {
        let provider = cmdArgs[1];
        if (!provider) {
          const answer = await prompts({
            type: "select",
            name: "provider",
            message: "Web Search provider",
            choices: searchProviders.map((value) => ({ title: value, value })),
            initial: Math.max(
              0,
              searchProviders.indexOf(settings.webSearchProvider ?? "duckduckgo"),
            ),
          });
          provider = answer.provider;
        }
        if (!searchProviders.includes(provider as (typeof searchProviders)[number])) {
          throw new Error(`Invalid Web Search provider: ${provider ?? ""}`);
        }
        writeSupervisorSettings({
          webSearchProvider: provider as (typeof searchProviders)[number],
        });
        if (provider !== "duckduckgo") await ensureApiKey(provider as CredentialProvider);
        writeLog("info", "cli.config.webSearchSet", { provider });
      } else if (section === "web-fetch") {
        let provider = cmdArgs[1];
        if (!provider) {
          const answer = await prompts({
            type: "select",
            name: "provider",
            message: "Web Fetch provider",
            choices: fetchProviders.map((value) => ({ title: value, value })),
            initial: Math.max(0, fetchProviders.indexOf(settings.webFetchProvider ?? "native")),
          });
          provider = answer.provider;
        }
        if (!fetchProviders.includes(provider as (typeof fetchProviders)[number])) {
          throw new Error(`Invalid Web Fetch provider: ${provider ?? ""}`);
        }
        writeSupervisorSettings({ webFetchProvider: provider as (typeof fetchProviders)[number] });
        if (provider !== "native") {
          await ensureApiKey(provider.endsWith("firecrawl") ? "firecrawl" : "tavily");
        }
        writeLog("info", "cli.config.webFetchSet", { provider });
      } else if (section === "browser") {
        let mode = cmdArgs[1];
        if (!mode) {
          const answer = await prompts({
            type: "select",
            name: "mode",
            message: "Browser mode",
            choices: browserModes.map((value) => ({ title: value, value })),
            initial: settings.browserMode === "headed" ? 1 : 0,
          });
          mode = answer.mode;
        }
        if (!browserModes.includes(mode as (typeof browserModes)[number])) {
          throw new Error(`Invalid browser mode: ${mode ?? ""}`);
        }
        writeSupervisorSettings({ browserMode: mode as (typeof browserModes)[number] });
        writeLog("info", "cli.config.browserSet", { mode });
      } else {
        throw new Error(`Unknown configuration section: ${section ?? ""}`);
      }
      db.close();
      break;
    }

    case "providers": {
      const subCmd = cmdArgs[0];
      if (subCmd === "list") {
        const providers = db.listProviders();
        if (providers.length === 0) {
          writeLog("info", "cli.providers.none");
        } else {
          for (let i = 0; i < providers.length; i++) {
            const p = providers[i];
            const primaryModel = getPrimaryModelId(db, p.id) ?? "(no model)";
            writeLog("info", "cli.providers.item", {
              index: i + 1,
              name: p.name,
              model: primaryModel,
            });
          }
        }
        db.close();
      } else if (subCmd === "add") {
        const choices = [
          ...BUILT_IN_PROVIDERS.map((p) => ({
            title: p.name,
            value: p.id,
          })),
          { title: "Custom...", value: "__custom__" },
        ];

        const { builtInId } = await prompts({
          type: "select",
          name: "builtInId",
          message: "Select a provider",
          choices,
        });
        if (!builtInId) throw new Error("Cancelled.");

        let id: string;
        let name: string;
        let icon: string | null;
        let protocol: string;
        let baseUrl: string | null;
        let defaultModels: string[];

        if (builtInId === "__custom__") {
          const answers = await prompts([
            {
              type: "text",
              name: "id",
              message: "Provider ID (e.g. my-provider)",
              validate: (v: string) => v.trim().length > 0 || "Required",
            },
            {
              type: "text",
              name: "name",
              message: "Display name",
              validate: (v: string) => v.trim().length > 0 || "Required",
            },
            {
              type: "select",
              name: "protocol",
              message: "Wire protocol",
              choices: [
                { title: "messages", value: "messages" },
                { title: "chat-completions", value: "chat-completions" },
                { title: "responses", value: "responses" },
              ],
            },
            {
              type: "text",
              name: "baseUrl",
              message: "Base URL (optional)",
            },
          ]);
          if (!answers.id || !answers.protocol) throw new Error("Cancelled.");
          id = answers.id.trim();
          name = answers.name.trim();
          icon = null;
          protocol = answers.protocol;
          baseUrl = answers.baseUrl?.trim() || null;
          defaultModels = [];
        } else {
          const builtin = BUILT_IN_PROVIDERS.find((p) => p.id === builtInId)!;
          id = builtin.id;
          name = builtin.name;
          icon = builtin.icon;
          protocol = builtin.protocol;
          baseUrl = builtin.baseUrl;
          defaultModels = builtin.defaultModels;
        }

        const { apiKey } = await prompts({
          type: "text",
          name: "apiKey",
          message: `API key for ${name}`,
          style: "invisible",
          validate: (v: string) => v.trim().length > 0 || "Required",
        });

        let initialModelId: string | null = null;
        if (defaultModels.length > 0) {
          const { modelChoice } = await prompts({
            type: "select",
            name: "modelChoice",
            message: "Select model or choose custom",
            choices: [
              ...defaultModels.map((m) => ({ title: m, value: m })),
              { title: "Custom (enter manually)", value: "__custom__" },
            ],
          });

          if (modelChoice === "__custom__") {
            const { customModel } = await prompts({
              type: "text",
              name: "customModel",
              message: "Enter model ID",
              validate: (v: string) => v.trim().length > 0 || "Required",
            });
            initialModelId = customModel?.trim() || null;
          } else {
            initialModelId = modelChoice;
          }
        } else {
          const { customModel } = await prompts({
            type: "text",
            name: "customModel",
            message: "Enter model ID",
            validate: (v: string) => v.trim().length > 0 || "Required",
          });
          initialModelId = customModel?.trim() || null;
        }

        const existing = db.listProviders().find((provider) => provider.slug === id);
        if (existing) {
          writeLog("info", "cli.providers.exists", { id });
          db.close();
          break;
        }

        const providerId = db.insertProvider({
          slug: id,
          name,
          icon,
          protocol,
          base_url: baseUrl,
          api_key: apiKey?.trim() || null,
          is_enabled: 1,
        });

        if (initialModelId) {
          db.insertModel({ provider_id: providerId, model_id: initialModelId });
        }

        writeLog("info", "cli.providers.added", { id });
        db.close();
      } else if (subCmd === "set-key") {
        const providers = db.listProviders();
        if (providers.length === 0) {
          writeLog("info", "cli.providers.addKeyFirst");
          db.close();
          break;
        }
        const { idx } = await prompts({
          type: "number",
          name: "idx",
          message: "Provider # to set key",
          min: 1,
          max: providers.length,
        });
        if (!idx) throw new Error("Cancelled.");
        const provider = providers[idx - 1];
        const { apiKey } = await prompts({
          type: "text",
          name: "apiKey",
          message: `API key for ${provider.name}`,
          style: "invisible",
          validate: (v: string) => v.trim().length > 0 || "Required",
        });
        if (!apiKey) throw new Error("Cancelled.");
        db.updateProvider(provider.id, { api_key: apiKey.trim() });
        writeLog("info", "cli.providers.keyUpdated", { id: provider.id });
        db.close();
      } else if (subCmd === "remove") {
        const selectedProvider = await selectProviderLocal(db);
        db.deleteProvider(selectedProvider.id);
        writeLog("info", "cli.providers.removed", { id: selectedProvider.id });
        db.close();
      } else {
        writeLog("error", "cli.providers.unknown", { command: subCmd });
        showHelp();
        db.close();
        process.exit(1);
      }
      break;
    }

    case "models": {
      const subCmd = cmdArgs[0];
      if (subCmd === "list") {
        const providerId = cmdArgs[1];
        if (!providerId) {
          writeLog("error", "cli.models.listUsage");
          process.exit(1);
        }
        const provider = db
          .listProviders()
          .find((item) => item.slug === providerId || String(item.id) === providerId);
        const models = provider ? db.listModelsByProvider(provider.id) : [];
        if (models.length === 0) {
          writeLog("info", "cli.models.none");
        } else {
          for (const m of models) {
            writeLog("info", "cli.models.item", { model: m.modelId });
          }
        }
        db.close();
      } else if (subCmd === "add") {
        const selectedProvider = await selectProviderLocal(db);
        const { modelId } = await prompts({
          type: "text",
          name: "modelId",
          message: `Model ID to add to ${selectedProvider.name}`,
          validate: (v: string) => v.trim().length > 0 || "Required",
        });
        if (!modelId) throw new Error("Cancelled.");
        db.insertModel({ provider_id: selectedProvider.id, model_id: modelId.trim() });
        writeLog("info", "cli.models.added", { model: modelId, provider: selectedProvider.name });
        db.close();
      } else if (subCmd === "remove") {
        const selectedProvider = await selectProviderLocal(db);
        const models = db.listModels().filter((m) => m.providerId === selectedProvider.id);
        if (models.length === 0) {
          writeLog("info", "cli.models.noneToRemove");
          db.close();
          break;
        }
        const { modelId } = await prompts({
          type: "select",
          name: "modelId",
          message: "Select model to remove",
          choices: models.map((m) => ({
            title: m.modelId,
            value: m.modelId,
          })),
        });
        if (!modelId) throw new Error("Cancelled.");
        db.deleteModel(selectedProvider.id, modelId);
        writeLog("info", "cli.models.removed", { model: modelId, provider: selectedProvider.name });
        db.close();
      } else {
        writeLog("error", "cli.models.unknown", { command: subCmd });
        showHelp();
        db.close();
        process.exit(1);
      }
      break;
    }

    default: {
      writeLog("error", "cli.unknownCommand", { command });
      showHelp();
      db.close();
      process.exit(1);
    }
  }
}

run().catch((e) => {
  writeLog("error", "runtime.unknownError", {
    error: e instanceof Error ? e.message : String(e),
  });
  process.exit(1);
});
