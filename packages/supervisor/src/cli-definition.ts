import { cac, type CAC, type Command } from "cac";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  serve: "Start the HTTP and WebSocket server",
  extensions: "Install, update, list, bind, and remove extensions",
  config: "Inspect or update supervisor configuration",
  providers: "Manage model providers and API keys",
  models: "Manage models belonging to providers",
};

export function createSupervisorCli(): CAC {
  const cli = cac("pi-supervisor");
  cli
    .option("-p, --port <port>", "HTTP server port", { default: "3030" })
    .option(
      "--cwd <path>",
      "Supervisor global root (db/public/global/agents/projects; default: ~/.supervisor)",
    )
    .option("--password <pin>", "6-digit numeric PIN for the web UI (default: random)")
    .option("--tunnel", "Expose via Cloudflare Quick Tunnel (auto-downloads cloudflared)", {
      default: false,
    })
    .option("--ui-dir <path>", "Directory of built web UI (defaults to auto-detect dist)")
    .help();
  cli.command("serve", MODULE_DESCRIPTIONS.serve, { allowUnknownOptions: true });
  cli
    .command("extensions <action> [...args]", MODULE_DESCRIPTIONS.extensions)
    .example("pi-supervisor extensions install npm:my-extension")
    .example("pi-supervisor extensions bind 1 my-extension");
  cli
    .command("config [action] [value]", MODULE_DESCRIPTIONS.config)
    .example("pi-supervisor config show")
    .example("pi-supervisor config browser headless");
  cli
    .command("providers <action> [...args]", MODULE_DESCRIPTIONS.providers)
    .example("pi-supervisor providers list")
    .example("pi-supervisor providers add");
  cli
    .command("models <action> [...args]", MODULE_DESCRIPTIONS.models)
    .example("pi-supervisor models list <provider-id>")
    .example("pi-supervisor models add");
  return cli;
}

function formatCommand(command: Command): string {
  const lines = [`pi-supervisor ${command.rawName}`, command.description];
  if (command.options.length) {
    lines.push("", "Options:");
    for (const option of command.options) lines.push(`  ${option.rawName}  ${option.description}`);
  }
  if (command.examples.length) {
    lines.push("", "Examples:");
    for (const example of command.examples) {
      lines.push(`  ${typeof example === "function" ? example("pi-supervisor") : example}`);
    }
  }
  return lines.join("\n");
}

export function getSupervisorCliHelp(module?: string): string {
  const cli = createSupervisorCli();
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
    "pi-supervisor [module] [options]",
    "",
    "Modules:",
    ...cli.commands.map((command) => `  ${command.rawName.padEnd(32)} ${command.description}`),
    "",
    "Request a module name for module-specific help.",
  ].join("\n");
}
