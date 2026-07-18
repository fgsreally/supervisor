#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const sessionId = process.argv[2];
const supervisorUrl = process.argv[3];
if (!sessionId || !supervisorUrl) throw new Error("session id and Supervisor URL are required");

const server = new McpServer({ name: "pi-supervisor-permission", version: "0.1.0" });
server.registerTool(
  "approve",
  {
    description: "Ask the Pi Supervisor user to approve a Claude Code tool call",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: { type: "string" },
        input: { type: "object", additionalProperties: true },
      },
      required: ["tool_name", "input"],
    } as any,
  },
  async (args: any) => {
    const response = await fetch(
      `${supervisorUrl}/sessions/${sessionId}/external-interactions/request`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          backend: "claude",
          kind: "approval",
          title: "Claude Code 请求操作权限",
          detail: args.tool_name,
          request: args,
        }),
      },
    );
    if (!response.ok) throw new Error(await response.text());
    const decision = (await response.json()) as { action: string };
    const result = decision.action.startsWith("approve")
      ? { behavior: "allow", updatedInput: args.input }
      : { behavior: "deny", message: "User denied this operation in Pi Supervisor" };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.registerTool(
  "ask",
  {
    description: "Ask the Pi Supervisor user one or more structured questions and wait for answers",
    inputSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["label"],
                },
              },
              isOther: { type: "boolean" },
              isSecret: { type: "boolean" },
            },
            required: ["id", "question"],
          },
        },
      },
      required: ["questions"],
    } as any,
  },
  async (args: any) => {
    const response = await fetch(
      `${supervisorUrl}/sessions/${sessionId}/external-interactions/request`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          backend: "claude",
          kind: "question",
          title: "Claude Code 需要你的回答",
          questions: args.questions,
          request: args,
        }),
      },
    );
    if (!response.ok) throw new Error(await response.text());
    const decision = (await response.json()) as { answers?: Record<string, string[]> };
    return { content: [{ type: "text", text: JSON.stringify(decision.answers ?? {}) }] };
  },
);

await server.connect(new StdioServerTransport());
