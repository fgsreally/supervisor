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
    "请为当前 coding Session 探查本地开发服务。",
    "先完整阅读项目根目录及适用的 AGENTS.md，重点查看“本地开发服务”；再按需阅读 README、package.json、workspace 配置、锁文件和已有启动脚本。",
    "只读探查：不要编辑文件，不要安装依赖，不要执行安装或启动命令。",
    "判断项目是否存在应长期运行、可供预览或 API 调试的本地服务。普通脚本、测试和一次性命令不算服务。",
    "本 Session 已预留一个空闲端口。若存在服务，startCommand 必须明确使用 ${PORT} 占位符，并在需要时设置 host=0.0.0.0；禁止使用 3000、5173 等固定默认端口。",
    "只登记一个主服务和一个入口。installCommand、stopCommand、destroyCommand 没有可靠命令时返回空字符串；不要臆造命令。",
    "若没有长期服务，detected=false，其余字符串返回空字符串。",
    "appPath 使用以 / 开头的预览路径，通常为 /；appName 使用简短名称，如 web 或 api。",
    "最后调用 submit_result，除此之外不要用文本兜底。",
    "",
    `预留端口：${port}（仅用于理解；返回的 startCommand 仍须写成 \${PORT}）`,
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
