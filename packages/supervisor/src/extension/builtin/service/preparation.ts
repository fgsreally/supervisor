import { Type, type Static } from "typebox";
import type { SessionServicesMeta } from "../../../core/project-runtime.js";

export const ProjectServicePreparationSchema = Type.Object({
  detected: Type.Boolean(),
  installCommand: Type.String(),
  startCommand: Type.String(),
  stopCommand: Type.String(),
  destroyCommand: Type.String(),
  appName: Type.String(),
  appPath: Type.String(),
});

export type ProjectServicePreparation = Static<typeof ProjectServicePreparationSchema>;

export function buildProjectServicePreparationPrompt(port: number): string {
  return [
    "Inspect local development services for the current coding Session.",
    "Read the project root and applicable AGENTS.md files completely, focusing on the `## 本地开发服务` section; then inspect README, package.json, workspace configuration, lockfiles, and existing start scripts as needed.",
    "This is a read-only investigation: do not edit files, install dependencies, or run install/start commands.",
    "Determine whether the project has a long-running service suitable for preview or API debugging. Ordinary scripts, tests, and one-off commands are not services.",
    "This Session has one free port reserved. If a service exists, startCommand must explicitly use the ${PORT} placeholder and set host=0.0.0.0 when needed; never use fixed defaults such as 3000 or 5173.",
    "Register exactly one primary service and one entry point. Return empty strings for installCommand, stopCommand, or destroyCommand when no reliable command exists; do not invent commands.",
    "If there is no long-running service, set detected=false and return empty strings for all other fields.",
    "Use an appPath beginning with /, usually /; use a short appName such as web or api.",
    "Call submit_result last and do not provide a text fallback.",
    "",
    `Reserved port: ${port} (for understanding only; the returned startCommand must still use \${PORT})`,
  ].join("\n");
}

export function preparationToServices(
  result: ProjectServicePreparation,
  port: number,
): SessionServicesMeta | null {
  const startCommand = result.startCommand.trim();
  if (!result.detected || !startCommand) return null;
  if (!/\$\{PORT\}|(?<![A-Za-z0-9_])\$PORT(?![A-Za-z0-9_])|%PORT%/.test(startCommand)) {
    throw new Error("华生返回的启动命令未使用 ${PORT} 占位符");
  }
  const appName = result.appName.trim() || "web";
  const rawPath = result.appPath.trim() || "/";
  return {
    status: "unregistered",
    installCommand: result.installCommand.trim() || undefined,
    startCommand,
    stopCommand: result.stopCommand.trim() || undefined,
    destroyCommand: result.destroyCommand.trim() || undefined,
    apps: [{ name: appName, port, path: rawPath.startsWith("/") ? rawPath : `/${rawPath}` }],
  };
}
