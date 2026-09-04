import { cac, type CAC, type Command } from "cac";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  serve: "Start the HTTP and WebSocket server",
  plugins: "Install, update, list, bind, and remove plugins",
  config: "Inspect or update wecode configuration",
  providers: "Manage model providers and API keys",
  models: "Manage models belonging to providers",
};

export function createWecodeCli(): CAC {
  const cli = cac("wecode");
  cli
    .option("-p, --port <port>", "HTTP server port", { default: "3030" })
    .option(
      "--cwd <path>",
      "Wecode global root (db/public/global/agents/projects; default: ~/.wecode)",
    )
    .option("--home <path>", "Wecode state root (overrides --cwd for runtime data)")
    .option("--workspace <path>", "Default project workspace (overrides --cwd for project files)")
    .option("--password <pin>", "6-digit numeric PIN for the web UI (default: random)")
    .option("--tunnel", "Expose via Cloudflare Quick Tunnel (auto-downloads cloudflared)", {
      default: false,
    })
    .option("--ui-dir <path>", "Directory of built web UI (defaults to auto-detect dist)")
    .option("--tls-cert <path>", "TLS certificate for HTTPS")
    .option("--tls-key <path>", "TLS private key for HTTPS")
    .option("--locale <locale>", "Console language: en or zh-CN (default: system locale)")
    .help();
  cli.command("serve", MODULE_DESCRIPTIONS.serve, { allowUnknownOptions: true });
  cli
    .command("plugins <action> [...args]", MODULE_DESCRIPTIONS.plugins)
    .example("wecode plugins install npm:my-plugin")
    .example("wecode plugins bind 1 my-plugin");
  cli
    .command("config [action] [value]", MODULE_DESCRIPTIONS.config)
    .example("wecode config show")
    .example("wecode config browser headless");
  cli
    .command("providers <action> [...args]", MODULE_DESCRIPTIONS.providers)
    .example("wecode providers list")
    .example("wecode providers add");
  cli
    .command("models <action> [...args]", MODULE_DESCRIPTIONS.models)
    .example("wecode models list <provider-id>")
    .example("wecode models add");
  return cli;
}

function formatCommand(command: Command): string {
  const lines = [`wecode ${command.rawName}`, command.description];
  if (command.options.length) {
    lines.push("", "Options:");
    for (const option of command.options) lines.push(`  ${option.rawName}  ${option.description}`);
  }
  if (command.examples.length) {
    lines.push("", "Examples:");
    for (const example of command.examples) {
      lines.push(`  ${typeof example === "function" ? example("wecode") : example}`);
    }
  }
  return lines.join("\n");
}

export function getWecodeCliHelp(module?: string): string {
  const cli = createWecodeCli();
  if (module) {
    const command = cli.commands.find((candidate) => candidate.name === module);
    if (!command) {
      return `Unknown CLI module: ${module}\nAvailable modules: ${cli.commands
        .map((candidate) => candidate.name)
        .join(", ")}`;
    }
    return formatCommand(command);
  }
  return [
    "wecode [module] [options]",
    "",
    "Modules:",
    ...cli.commands.map((command) => `  ${command.rawName.padEnd(32)} ${command.description}`),
    "",
    "Request a module name for module-specific help.",
  ].join("\n");
}
