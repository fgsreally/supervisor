/**
 * Supervisor Extension System - Define Extension
 *
 * 扩展入口包装器，提供类型安全的 defineExtension 函数
 */

import type { ExtensionDefinition } from "./types.js";

/**
 * 定义一个 supervisor 扩展
 *
 * @example
 * ```typescript
 * import { defineExtension } from "@earendil-works/pi-supervisor";
 * import { Type } from "typebox";
 *
 * export default defineExtension({
 *   name: "my-extension",
 *   setup(ctx) {
 *     // 注册工具
 *     ctx.agent.tools.register({
 *       name: "my_tool",
 *       description: "My tool",
 *       parameters: Type.Object({ name: Type.String() }),
 *       async execute(params) {
 *         return { content: [{ type: "text", text: "Hello" }] };
 *       },
 *     });
 *
 *     // 监听事件
 *     ctx.runtime.on("message.user", async (event) => {
 *       console.log("User said:", event.text);
 *     });
 *
 *     // 返回可选的清理函数
 *     return () => {
 *       console.log("Extension cleanup");
 *     };
 *   },
 * });
 * ```
 */
export function defineExtension(definition: ExtensionDefinition): ExtensionDefinition {
  // 验证扩展名称
  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Extension name is required and must be a string");
  }

  // 验证 setup 函数
  if (!definition.setup || typeof definition.setup !== "function") {
    throw new Error("Extension setup function is required");
  }

  // 返回扩展定义，可在加载时直接使用
  return definition;
}

/**
 * 异步定义扩展（支持异步初始化）
 *
 * @example
 * ```typescript
 * import { defineExtensionAsync } from "@earendil-works/pi-supervisor";
 *
 * export default await defineExtensionAsync(async () => {
 *   const config = await loadConfig();
 *
 *   return {
 *     name: "my-extension",
 *     setup(ctx) {
 *       // 使用 config
 *     },
 *   };
 * });
 * ```
 */
export async function defineExtensionAsync(
  factory: () => Promise<ExtensionDefinition>,
): Promise<ExtensionDefinition> {
  const definition = await factory();

  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Extension name is required and must be a string");
  }

  if (!definition.setup || typeof definition.setup !== "function") {
    throw new Error("Extension setup function is required");
  }

  return definition;
}
