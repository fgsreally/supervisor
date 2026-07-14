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
 * import { defineExtension, Type } from "@earendil-works/pi-supervisor";
 *
 * export default defineExtension({
 *   name: "my-extension",
 *   setup(ctx) {
 *     ctx.agent.registerTool({
 *       name: "my_tool",
 *       description: "My tool",
 *       parameters: Type.Object({ name: Type.String() }),
 *       async execute(params) {
 *         return { content: [{ type: "text", text: "Hello" }] };
 *       },
 *     });
 *
 *     ctx.on("message.user", async (event) => {
 *       console.log("User said:", event.text);
 *     });
 *
 *     return () => {
 *       console.log("Extension cleanup");
 *     };
 *   },
 * });
 * ```
 */
export function defineExtension(definition: ExtensionDefinition): ExtensionDefinition {
  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Extension name is required and must be a string");
  }

  if (!definition.setup || typeof definition.setup !== "function") {
    throw new Error("Extension setup function is required");
  }

  return definition;
}
