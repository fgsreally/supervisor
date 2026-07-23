#!/usr/bin/env node
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import prompts from "prompts";
import { BUILT_IN_PROVIDERS } from "./config/built-in-providers.js";
import { ensureBuiltinAssistant, ensurePackagedAgents } from "./agent/index.js";
import { SupervisorDb } from "./db/db.js";
import { getDefaultCwd, resolveWorkspacePath, setDefaultCwd } from "./config/default-cwd.js";
import { createHttpServer } from "./http/http-server.js";
import { attachWebSocketServer } from "./websocket/server.js";
import { SessionManager } from "./core/session-manager.js";
import type { Provider } from "./types.js";
import { encryptApiKey } from "./utils/encrypt.js";
import { readSupervisorSettings, writeSupervisorSettings } from "./utils/supervisor-settings.js";

const KNOWN_CLI_OPTIONS = new Set(["port", "p", "db", "cwd", "h", "help"]);

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

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: "string", short: "p", default: "3030" },
    db: { type: "string" },
    cwd: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

function parseCommand() {
  const args = process.argv.slice(2);
  let command = "serve";
  let cmdArgs: string[] = [];
  let i = 0;

  while (i < args.length) {
    if (!args[i].startsWith("-")) {
      command = args[i];
      cmdArgs = args.slice(i + 1);
      break;
    }
    i++;
  }

  return { command, cmdArgs };
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
  console.log(
    `
pi-supervisor — HTTP API server for pi agent sessions

Usage:
  pi-supervisor [command] [options]

Commands:
  serve                     Start the HTTP API server (default)

Provider Commands:
  providers list            List all providers
  providers add             Add a provider (interactive)
  providers remove          Remove a provider (interactive)
  providers set-key         Update API key for a provider (interactive)

Model Commands:
  models list <provider-id> List models for a provider
  models add                Add a model ID to a provider (interactive)
  models remove             Remove a model from a provider (interactive)

Configuration Commands:
  config                    Select a configuration section interactively
  config show               Show current configuration
  config web-search [provider]
  config web-fetch [provider]
  config browser [headless|headed]

Extension Commands:
  extensions install <source>           Install from npm:<spec>, git:<url>, or local-path into global catalog
  extensions update <id>                  Re-fetch extension from package.json repository field
  extensions uninstall <id>             Remove extension from global catalog
  extensions list                       List extensions in the global catalog
  extensions bind <agent-id> <id>       Bind a catalog extension to an agent in the database
  extensions unbind <agent-id> <id>     Remove an agent extension binding

Options:
  -p, --port <port>         HTTP server port (default: 3030)
  --db <path>               SQLite database path (default: ~/.pi/supervisor.db)
  --cwd <path>              Default workspace directory (default: ./playground when present, else process.cwd())
  --<extension-flag>        Extension-registered CLI flags (see extension docs)
  -h, --help                Show this help
`.trim(),
  );
}

if (values.help) {
  showHelp();
  process.exit(0);
}

async function run() {
  const cwdArg = values.cwd as string | undefined;
  if (cwdArg) setDefaultCwd(resolveWorkspacePath(cwdArg));

  const db = new SupervisorDb(values.db as string | undefined);
  const manager = new SessionManager(db);
  const { command, cmdArgs } = parseCommand();

  switch (command) {
    case "serve": {
      const port = Number(values.port);
      process.env.PI_SUPERVISOR_URL = `http://127.0.0.1:${port}`;
      const workspaceCwd = getDefaultCwd();
      manager.createProject({ cwd: workspaceCwd });
      ensureBuiltinAssistant(db, manager);
      ensurePackagedAgents(db);
      const app = createHttpServer(manager);
      const server = serve({ fetch: app.fetch, port });
      attachWebSocketServer(server);
      manager.resumePersistedSessionInputs();
      console.log(`Server listening on http://localhost:${port}`);
      console.log(`Workspace cwd: ${workspaceCwd}`);
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
          console.error("Usage: pi-supervisor extensions install <npm:/git:/local-path>");
          process.exit(1);
        }
        const result = await manager.resources.installResource({ kind: "extension", source });
        const details = result.details ?? {};
        console.log(`Installed: ${result.resource.slug}`);
        console.log(`  rootDir: ${String(details.rootDir ?? "")}`);
        console.log(`  entry:   ${String(details.entryPath ?? "")}`);
        console.log(`  deps:    ${String(details.installCommand ?? "none")}`);
        db.close();
        break;
      }

      if (subCmd === "update") {
        const id = cmdArgs[1];
        if (!id) {
          console.error("Usage: pi-supervisor extensions update <id>");
          process.exit(1);
        }
        const result = await manager.resources.updateResource("extension", id);
        const details = result.details ?? {};
        console.log(`Updated: ${result.resource.slug}`);
        console.log(`  rootDir: ${String(details.rootDir ?? "")}`);
        console.log(`  entry:   ${String(details.entryPath ?? "")}`);
        console.log(`  deps:    ${String(details.installCommand ?? "none")}`);
        db.close();
        break;
      }

      if (subCmd === "uninstall") {
        const id = cmdArgs[1];
        if (!id) {
          console.error("Usage: pi-supervisor extensions uninstall <id>");
          process.exit(1);
        }
        await manager.resources.uninstallResource("extension", id);
        console.log(`Uninstalled extension: ${id}`);
        db.close();
        break;
      }

      if (subCmd === "list") {
        const resources = manager.resources.listResources("extension");
        if (resources.length === 0) {
          console.log("No extensions in resource catalog.");
        } else {
          for (const resource of resources) {
            const ver = resource.version ? ` v${resource.version}` : "";
            console.log(
              `  ${resource.slug}  ${resource.name ?? resource.slug}${ver}  [${resource.sourcePath}]`,
            );
          }
        }
        db.close();
        break;
      }

      if (subCmd === "bind") {
        const agentIdRaw = cmdArgs[1];
        const id = cmdArgs[2];
        if (!agentIdRaw || !id) {
          console.error("Usage: pi-supervisor extensions bind <agent-id> <id>");
          process.exit(1);
        }
        const agentId = Number(agentIdRaw);
        if (!Number.isFinite(agentId)) {
          console.error("agent-id must be a number");
          process.exit(1);
        }
        manager.resources.bindResource({ agentId, kind: "extension", slug: id });
        console.log(`Bound extension ${id} to agent ${agentId}`);
        db.close();
        break;
      }

      if (subCmd === "unbind") {
        const agentIdRaw = cmdArgs[1];
        const id = cmdArgs[2];
        if (!agentIdRaw || !id) {
          console.error("Usage: pi-supervisor extensions unbind <agent-id> <id>");
          process.exit(1);
        }
        const agentId = Number(agentIdRaw);
        if (!Number.isFinite(agentId)) {
          console.error("agent-id must be a number");
          process.exit(1);
        }
        await manager.resources.unbindResource({ agentId, kind: "extension", slug: id });
        console.log(`Unbound extension ${id} from agent ${agentId}`);
        db.close();
        break;
      }

      console.error(`Unknown extensions sub-command: ${subCmd ?? ""}`);
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
          console.log(`${provider} API key unchanged.`);
          return;
        }
        writeSupervisorSettings({ [encryptedFields[provider]]: encryptApiKey(apiKey) });
        console.log(`${provider} API key saved encrypted.`);
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
        console.log(`Browser: ${settings.browserMode ?? "headless"}`);
        console.log(`Web Search: ${settings.webSearchProvider ?? "duckduckgo"}`);
        console.log(`Web Fetch: ${settings.webFetchProvider ?? "native"}`);
        console.log(`Tavily key env: ${settings.tavilyApiKeyEnv ?? "TAVILY_API_KEY"}`);
        console.log(`Brave key env: ${settings.braveApiKeyEnv ?? "BRAVE_API_KEY"}`);
        console.log(`Serper key env: ${settings.serperApiKeyEnv ?? "SERPER_API_KEY"}`);
        console.log(`Firecrawl key env: ${settings.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY"}`);
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
        console.log(`Web Search provider: ${provider}`);
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
        console.log(`Web Fetch provider: ${provider}`);
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
        console.log(`Browser mode: ${mode}`);
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
          console.log("No providers.");
        } else {
          for (let i = 0; i < providers.length; i++) {
            const p = providers[i];
            const primaryModel = getPrimaryModelId(db, p.id) ?? "(no model)";
            console.log(`${i + 1}. ${p.name}  [${primaryModel}]`);
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
        let apiType: string;
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
              name: "apiType",
              message: "API standard",
              choices: [
                { title: "anthropic-messages  (Claude API)", value: "anthropic-messages" },
                { title: "openai-compatible  (OpenAI / compatible)", value: "openai-compatible" },
              ],
            },
            {
              type: "text",
              name: "baseUrl",
              message: "Base URL (optional)",
            },
          ]);
          if (!answers.id || !answers.apiType) throw new Error("Cancelled.");
          id = answers.id.trim();
          name = answers.name.trim();
          icon = null;
          apiType = answers.apiType;
          baseUrl = answers.baseUrl?.trim() || null;
          defaultModels = [];
        } else {
          const builtin = BUILT_IN_PROVIDERS.find((p) => p.id === builtInId)!;
          id = builtin.id;
          name = builtin.name;
          icon = builtin.icon;
          apiType = builtin.apiType;
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

        const existing = db.getProvider(id);
        if (existing) {
          console.log(
            `Provider "${id}" already exists. Use \`providers set-key\` to update the key.`,
          );
          db.close();
          break;
        }

        const allProviders = db.listProviders();

        db.insertProvider({
          id,
          name,
          icon,
          api_type: apiType,
          base_url: baseUrl,
          api_key: apiKey?.trim() || null,
          is_enabled: 1,
        });

        if (initialModelId) {
          db.insertModel({ provider_id: id, model_id: initialModelId });
        }

        console.log(`Added provider: ${id}`);
        db.close();
      } else if (subCmd === "set-key") {
        const providers = db.listProviders();
        if (providers.length === 0) {
          console.log("No providers. Add one first.");
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
        console.log(`Updated key for: ${provider.id}`);
        db.close();
      } else if (subCmd === "remove") {
        const selectedProvider = await selectProviderLocal(db);
        db.deleteProvider(selectedProvider.id);
        console.log(`Removed provider: ${selectedProvider.id}`);
        db.close();
      } else {
        console.error(`Unknown providers sub-command: ${subCmd}`);
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
          console.error("Usage: pi-supervisor models list <provider-id>");
          process.exit(1);
        }
        const models = db.listModels().filter((m) => m.providerId === providerId);
        if (models.length === 0) {
          console.log("No models.");
        } else {
          for (const m of models) {
            console.log(`  ${m.modelId}`);
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
        console.log(`Added model ${modelId} to ${selectedProvider.name}`);
        db.close();
      } else if (subCmd === "remove") {
        const selectedProvider = await selectProviderLocal(db);
        const models = db.listModels().filter((m) => m.providerId === selectedProvider.id);
        if (models.length === 0) {
          console.log("No models to remove.");
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
        console.log(`Removed model ${modelId} from ${selectedProvider.name}`);
        db.close();
      } else {
        console.error(`Unknown models sub-command: ${subCmd}`);
        showHelp();
        db.close();
        process.exit(1);
      }
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      showHelp();
      db.close();
      process.exit(1);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
