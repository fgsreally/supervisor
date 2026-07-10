import { defineExtension } from "../../define-extension.js";
import { registerAgentTool } from "../../register-agent-tool.js";
import { createWebFetchTool } from "./web-fetch-tool.js";
import { createWebSearchTool } from "./web-search-tool.js";

export default defineExtension({
  name: "supervisor-web",
  setup(ctx) {
    registerAgentTool(ctx, createWebSearchTool());
    registerAgentTool(ctx, createWebFetchTool());
  },
});
