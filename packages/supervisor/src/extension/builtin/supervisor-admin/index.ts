import { access, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Type } from "typebox";
import { getSupervisorCliHelp } from "../../../cli-definition.js";
import { getDefaultCwd } from "../../../config/default-cwd.js";
import { readSupervisorLocalConfig, resolveDbPath } from "../../../config/resolve-db-path.js";
import {
  getSupervisorSettingsPath,
  readSupervisorSettings,
} from "../../../utils/supervisor-settings.js";
import type { ExtensionContext, ExtensionDefinition } from "../../types.js";

const ADMIN_AGENT_NAMES = new Set(["Pi 助手"]);
const MAX_OUTPUT_CHARS = 40_000;

function textResult(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const text =
    serialized.length <= MAX_OUTPUT_CHARS
      ? serialized
      : `${serialized.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated]`;
  return { content: [{ type: "text" as const, text }], details: value };
}

function normalizedSql(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "");
}

function assertSingleStatement(sql: string): string {
  const normalized = normalizedSql(sql);
  if (!normalized) throw new Error("SQL is required");
  if (normalized.includes(";")) throw new Error("Only one SQL statement is allowed");
  return normalized;
}

function runtimeBaseUrl(): string {
  return (
    process.env.PI_SUPERVISOR_URL ??
    process.env.SUPERVISOR_URL ??
    "http://127.0.0.1:3030"
  ).replace(/\/$/, "");
}

async function approveWrite(ctx: ExtensionContext, title: string, body: string): Promise<void> {
  const result = await ctx.ui.requestApproval({
    kind: "supervisor-admin-write",
    title,
    body,
    actions: ["approve", "reject"],
  });
  if (result.action !== "approve") throw new Error("User rejected the Supervisor write operation");
}

function resolveScaffoldTarget(ctx: ExtensionContext, targetDir: string): string {
  const target = resolve(ctx.project.cwd, targetDir);
  const allowedRoots = [resolve(ctx.project.cwd), resolve(ctx.project.dir)];
  if (
    !allowedRoots.some((root) => {
      const rel = relative(root, target);
      return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    })
  ) {
    throw new Error("Scaffold target must be inside the Project cwd or Project directory");
  }
  return target;
}

async function assertMissing(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error(`Target already exists: ${path}`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

type OpenApiDocument = {
  paths?: Record<string, Record<string, unknown>>;
};

async function discoverHttp(module?: string, query?: string): Promise<unknown> {
  const response = await fetch(`${runtimeBaseUrl()}/openapi/json`);
  if (!response.ok) throw new Error(`OpenAPI discovery failed: HTTP ${response.status}`);
  const document = (await response.json()) as OpenApiDocument;
  const needle = query?.trim().toLowerCase();
  const paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).flatMap(([path, operations]) => {
      const pathModule = path.split("/").filter(Boolean)[0] ?? "root";
      if (module && pathModule !== module) return [];
      const filtered = Object.fromEntries(
        Object.entries(operations).filter(([method, operation]) => {
          if (!needle) return true;
          return `${method} ${path} ${JSON.stringify(operation)}`.toLowerCase().includes(needle);
        }),
      );
      return Object.keys(filtered).length ? [[path, filtered]] : [];
    }),
  );
  const modules = [
    ...new Set(Object.keys(document.paths ?? {}).map((path) => path.split("/").filter(Boolean)[0])),
  ].filter(Boolean);
  return { kind: "http", source: `${runtimeBaseUrl()}/openapi/json`, modules, paths };
}

const supervisorAdminExtension: ExtensionDefinition = {
  name: "supervisor-admin",
  setup(ctx) {
    if (!ADMIN_AGENT_NAMES.has(ctx.agent.name)) return;

    ctx.agent.registerTool({
      name: "supervisor_runtime_info",
      description:
        "Read the actual Supervisor URL, database path, workspace, environment, and startup arguments. Use it instead of assuming runtime configuration.",
      parameters: Type.Object({}),
      async execute() {
        const local = readSupervisorLocalConfig();
        const settings = readSupervisorSettings();
        const databaseSource = local?.config.dbPath
          ? "project .supervisor/config.json"
          : settings.dbPath
            ? getSupervisorSettingsPath()
            : "built-in default";
        return textResult({
          httpBaseUrl: runtimeBaseUrl(),
          database: { path: resolveDbPath(), source: databaseSource },
          workspaceCwd: getDefaultCwd(),
          processCwd: process.cwd(),
          project: { cwd: ctx.project.cwd, dir: ctx.project.dir },
          settingsPath: getSupervisorSettingsPath(),
          executable: process.execPath,
          argv: process.argv.slice(1),
          environment: {
            NODE_ENV: process.env.NODE_ENV ?? null,
            PI_SUPERVISOR_URL: process.env.PI_SUPERVISOR_URL ?? null,
            SUPERVISOR_URL: process.env.SUPERVISOR_URL ?? null,
            SS_CWD: process.env.SS_CWD ?? null,
          },
        });
      },
    });

    ctx.agent.registerTool({
      name: "supervisor_capabilities",
      description:
        "Discover current Supervisor capabilities from the running Elysia OpenAPI document or the CAC command registry. Call this before using an unfamiliar HTTP route or CLI module.",
      parameters: Type.Object({
        kind: Type.Union([Type.Literal("http"), Type.Literal("cli")]),
        module: Type.Optional(Type.String()),
        query: Type.Optional(Type.String()),
      }),
      async execute(params) {
        if (params.kind === "cli") {
          const help = getSupervisorCliHelp(params.module);
          if (!params.query) return textResult(help);
          const needle = params.query.toLowerCase();
          return textResult(
            help
              .split("\n")
              .filter((line) => line.toLowerCase().includes(needle))
              .join("\n"),
          );
        }
        return textResult(await discoverHttp(params.module, params.query));
      },
    });

    ctx.agent.registerTool({
      name: "supervisor_http",
      description: "Call a local Supervisor HTTP operation discovered by supervisor_capabilities.",
      parameters: Type.Object({
        method: Type.Union([
          Type.Literal("GET"),
          Type.Literal("POST"),
          Type.Literal("PUT"),
          Type.Literal("PATCH"),
          Type.Literal("DELETE"),
        ]),
        path: Type.String({ minLength: 1 }),
        body: Type.Optional(Type.Unknown()),
      }),
      async execute(params) {
        if (!params.path.startsWith("/")) throw new Error("HTTP path must begin with /");
        if (params.method === "GET" && params.body !== undefined) {
          throw new Error("GET requests cannot include a body");
        }
        if (
          params.method === "DELETE" ||
          /\/(uninstall|kill|complete)(?:\/|$)/i.test(params.path)
        ) {
          await approveWrite(ctx, "确认 Supervisor 写操作", `${params.method} ${params.path}`);
        }
        const endpoint = new URL(params.path, `${runtimeBaseUrl()}/`);
        if (
          endpoint.protocol !== "http:" ||
          !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
        ) {
          throw new Error("Supervisor HTTP endpoint must use local loopback HTTP");
        }
        const response = await fetch(endpoint, {
          method: params.method,
          headers: params.body === undefined ? undefined : { "content-type": "application/json" },
          body: params.body === undefined ? undefined : JSON.stringify(params.body),
          signal: ctx.session.signal,
        });
        const raw = await response.text();
        let data: unknown = raw;
        try {
          data = raw ? (JSON.parse(raw) as unknown) : null;
        } catch {
          // Preserve non-JSON responses for diagnostics.
        }
        if (!response.ok) throw new Error(`Supervisor HTTP ${response.status}: ${raw}`);
        return textResult({ ok: true, status: response.status, data });
      },
    });

    ctx.agent.registerTool({
      name: "supervisor_db_query",
      description: "Run one read-only SQL statement against the actual Supervisor SQLite database.",
      parameters: Type.Object({
        sql: Type.String({ minLength: 1 }),
        params: Type.Optional(Type.Array(Type.Unknown())),
      }),
      async execute(params) {
        if (!ctx.db.available) throw new Error("Supervisor database is unavailable");
        const sql = assertSingleStatement(params.sql);
        if (!/^(select\b|pragma\s+(table_info|index_list|foreign_key_list)\s*\()/i.test(sql)) {
          throw new Error("Only SELECT and read-only schema PRAGMA statements are allowed");
        }
        return textResult(ctx.db.query<unknown>(sql, params.params));
      },
    });

    ctx.agent.registerTool({
      name: "supervisor_db_write",
      description:
        "Run one approved INSERT, UPDATE, or DELETE when no supported HTTP operation exists.",
      parameters: Type.Object({
        sql: Type.String({ minLength: 1 }),
        params: Type.Optional(Type.Array(Type.Unknown())),
        reason: Type.String({ minLength: 1 }),
      }),
      async execute(params) {
        if (!ctx.db.available) throw new Error("Supervisor database is unavailable");
        const sql = assertSingleStatement(params.sql);
        if (!/^(insert|update|delete)\b/i.test(sql)) {
          throw new Error(
            "Only INSERT, UPDATE, or DELETE is allowed; schema changes are forbidden",
          );
        }
        await approveWrite(ctx, "确认直接修改 Supervisor 数据库", `${params.reason}\n\n${sql}`);
        return textResult(ctx.db.prepare(sql).run(...(params.params ?? [])));
      },
    });

    ctx.agent.registerTool({
      name: "supervisor_scaffold_extension",
      description: "Create a Supervisor extension scaffold in an explicit Project-owned directory.",
      parameters: Type.Object({
        name: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
        targetDir: Type.String({ minLength: 1 }),
        description: Type.Optional(Type.String()),
      }),
      async execute(params) {
        const target = resolveScaffoldTarget(ctx, params.targetDir);
        await assertMissing(target);
        await mkdir(target, { recursive: true });
        const description = params.description ?? `Supervisor extension: ${params.name}`;
        await Promise.all([
          writeFile(
            resolve(target, "package.json"),
            `${JSON.stringify(
              {
                name: params.name,
                version: "0.1.0",
                description,
                type: "module",
                main: "./index.ts",
                peerDependencies: { "pi-supervisor": "^0.1.0" },
                engines: { node: ">=20.6.0" },
              },
              null,
              2,
            )}\n`,
            "utf8",
          ),
          writeFile(
            resolve(target, "index.ts"),
            `import { Type, defineExtension } from "pi-supervisor";\n\n` +
              `export default defineExtension({\n` +
              `  name: ${JSON.stringify(params.name)},\n` +
              `  setup(ctx) {\n` +
              `    ctx.agent.registerTool({\n` +
              `      name: "${params.name.replaceAll("-", "_")}_status",\n` +
              `      description: "Return extension status.",\n` +
              `      parameters: Type.Object({}),\n` +
              `      async execute() {\n` +
              `        return { content: [{ type: "text", text: "ready" }] };\n` +
              `      },\n` +
              `    });\n` +
              `  },\n` +
              `});\n`,
            "utf8",
          ),
          writeFile(resolve(target, "README.md"), `# ${params.name}\n\n${description}\n`, "utf8"),
        ]);
        return textResult({ target, files: ["package.json", "index.ts", "README.md"] });
      },
    });
  },
};

export default supervisorAdminExtension;
