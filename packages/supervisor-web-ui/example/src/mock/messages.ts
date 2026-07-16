import { session4Messages } from "./session-long-compaction";
import { sessionStreamMessages } from "./session-stream";

export type { MockCompactionEntry, MockEntry, MockTextPart, MockToolPart } from "./types";

import type { MockEntry } from "./types";

function markOld(entries: MockEntry[], idPrefix: string): MockEntry[] {
  return entries.map((entry) => ({
    ...entry,
    id: `${idPrefix}${entry.id}`,
    isOld: true,
  }));
}

const buttonVueLegacy =
  '<template>\n  <button class="btn" @click="handleClick">\n    {{ text }}\n  </button>\n</template>\n\n' +
  "<script>\nexport default {\n  props: ['text'],\n  methods: {\n    handleClick() {\n      this.$emit('click');\n    }\n  }\n}\n" +
  "</" +
  "script>";

const buttonVue3 =
  '<template>\n  <button class="btn" @click="emit(\'click\')">\n    {{ text }}\n  </button>\n</template>\n\n' +
  '<script setup lang="ts">\n' +
  "defineProps<{ text: string }>()\n" +
  "const emit = defineEmits<{ (e: 'click'): void }>()\n" +
  "</" +
  "script>";

/** Main agent: Vue 3 refactor — uses read / edit / bash (ls only) / spawn_agent */
const session1Messages: MockEntry[] = [
  {
    id: "s1-1",
    type: "system",
    content: "Thinking level: high",
  },
  {
    id: "s1-2f",
    type: "message",
    message: {
      role: "user",
      content: {
        type: "file",
        name: "2026年基于企业微信的智慧校园云平台服务合同.docx",
        size: "36.8K",
        ext: "docx",
      },
    },
  },
  {
    id: "s1-2",
    type: "message",
    message: {
      role: "user",
      content: "用最新版本的 Vue 重构 src/components/Button.vue",
    },
  },
  {
    id: "s1-3",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "先看一下 components 目录里有哪些文件。" },
        {
          type: "toolCall",
          id: "call_ls",
          name: "bash",
          arguments: { intent: "列出 components 目录下的文件", command: "ls -la src/components" },
        },
      ],
    },
  },
  {
    id: "s1-4",
    type: "toolResult",
    toolCallId: "call_ls",
    toolName: "bash",
    content: [
      {
        type: "text",
        text: "Button.vue\nHeader.vue\nSessionTreeNode.vue\n",
      },
    ],
  },
  {
    id: "s1-5",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "用 **read** 读取 `Button.vue` 的当前实现。" },
        {
          type: "toolCall",
          id: "call_read",
          name: "read",
          arguments: { path: "src/components/Button.vue" },
        },
      ],
    },
  },
  {
    id: "s1-6",
    type: "toolResult",
    toolCallId: "call_read",
    toolName: "read",
    content: [{ type: "text", text: buttonVueLegacy }],
  },
  {
    id: "s1-7",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "这是 Vue 2 Options API。我会用 **edit** 改成 `<script setup>` + TypeScript。",
        },
        {
          type: "toolCall",
          id: "call_edit",
          name: "edit",
          arguments: {
            path: "src/components/Button.vue",
            edits: [
              {
                oldText:
                  "<script>\nexport default {\n  props: ['text'],\n  methods: {\n    handleClick() {\n      this.$emit('click');\n    }\n  }\n}\n</" +
                  "script>",
                newText:
                  "<script setup lang=\"ts\">\ndefineProps<{ text: string }>()\nconst emit = defineEmits<{ (e: 'click'): void }>()\n</" +
                  "script>",
              },
            ],
          },
        },
      ],
    },
  },
  {
    id: "s1-8",
    type: "toolResult",
    toolCallId: "call_edit",
    toolName: "edit",
    content: [
      {
        type: "text",
        text: "--- a/src/components/Button.vue\n+++ b/src/components/Button.vue\n- export default {\n+ defineProps<{ text: string }>()\n",
      },
    ],
  },
  {
    id: "s1-9",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "逻辑已迁移完成。样式交给子代理处理。",
        },
        {
          type: "toolCall",
          id: "call_spawn",
          name: "spawn_agent",
          arguments: {
            agentId: "css-specialist",
            instructions: "为 Button.vue 添加 Tailwind 样式，保持微信风格按钮。",
            childSessionId: "session-1-1",
          },
        },
      ],
    },
  },
  {
    id: "s1-10",
    type: "toolResult",
    toolCallId: "call_spawn",
    toolName: "spawn_agent",
    content: [{ type: "text", text: '{"sessionId":"session-1-1","status":"started"}' }],
  },
  {
    id: "s1-11",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "主代理任务结束。点击上方 **spawn_agent** 结果中的「查看子代理」可跳到 CSS Specialist 会话。",
        },
      ],
    },
  },
];

/** Subagent: CSS — read + edit only */
const session11Messages: MockEntry[] = [
  {
    id: "s11-1",
    type: "message",
    message: {
      role: "user",
      content: "为 Button.vue 添加 Tailwind 样式，保持微信风格按钮。",
    },
  },
  {
    id: "s11-2",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "读取迁移后的组件内容。" },
        {
          type: "toolCall",
          id: "call_read_css",
          name: "read",
          arguments: { path: "src/components/Button.vue" },
        },
      ],
    },
  },
  {
    id: "s11-3",
    type: "toolResult",
    toolCallId: "call_read_css",
    toolName: "read",
    content: [{ type: "text", text: buttonVue3 }],
  },
  {
    id: "s11-4",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "用 **edit** 更新 class。" },
        {
          type: "toolCall",
          id: "call_edit_css",
          name: "edit",
          arguments: {
            path: "src/components/Button.vue",
            edits: [
              {
                oldText: 'class="btn"',
                newText:
                  'class="px-4 py-2 rounded-md bg-[#95ec69] text-black shadow-sm hover:opacity-90"',
              },
            ],
          },
        },
      ],
    },
  },
  {
    id: "s11-5",
    type: "toolResult",
    toolCallId: "call_edit_css",
    toolName: "edit",
    content: [{ type: "text", text: "Applied 1 edit to src/components/Button.vue" }],
  },
  {
    id: "s11-6",
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "样式已更新，与主会话中的微信绿色气泡一致。" }],
    },
  },
];

/** Subagent: API — write new file + read */
const session12Messages: MockEntry[] = [
  {
    id: "s12-1",
    type: "message",
    message: {
      role: "user",
      content: "生成调用 supervisor /sessions 的 API 客户端草稿。",
    },
  },
  {
    id: "s12-2",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "用 **write** 创建客户端文件。" },
        {
          type: "toolCall",
          id: "call_write_api",
          name: "write",
          arguments: {
            path: "src/api/supervisor-client.ts",
            content:
              'export async function listSessions() {\n  const res = await fetch("/sessions")\n  return res.json()\n}\n',
          },
        },
      ],
    },
  },
  {
    id: "s12-3",
    type: "toolResult",
    toolCallId: "call_write_api",
    toolName: "write",
    content: [{ type: "text", text: "Wrote src/api/supervisor-client.ts" }],
  },
  {
    id: "s12-4",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "**read** 确认写入内容。" },
        {
          type: "toolCall",
          id: "call_read_api",
          name: "read",
          arguments: { path: "src/api/supervisor-client.ts" },
        },
      ],
    },
  },
  {
    id: "s12-5",
    type: "toolResult",
    toolCallId: "call_read_api",
    toolName: "read",
    content: [
      {
        type: "text",
        text: 'export async function listSessions() {\n  const res = await fetch("/sessions")\n  return res.json()\n}\n',
      },
    ],
  },
];

/** Backend session: read schema + bash migrate */
const session2Messages: MockEntry[] = [
  {
    id: "s2-1",
    type: "message",
    message: {
      role: "user",
      content: "检查 supervisor 数据库 schema 并跑迁移",
    },
  },
  {
    id: "s2-2",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "**read** `packages/supervisor/src/db.ts` 查看表结构。" },
        {
          type: "toolCall",
          id: "call_read_db",
          name: "read",
          arguments: { path: "packages/supervisor/src/db.ts", offset: 1, limit: 80 },
        },
      ],
    },
  },
  {
    id: "s2-3",
    type: "toolResult",
    toolCallId: "call_read_db",
    toolName: "read",
    content: [{ type: "text", text: "// SupervisorDb — sessions, agents, parent_id, cwd...\n" }],
  },
  {
    id: "s2-4",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "用 **bash** 执行测试（迁移脚本）。" },
        {
          type: "toolCall",
          id: "call_test",
          name: "bash",
          arguments: {
            intent: "运行 supervisor 包的 session-manager 测试",
            command: "npm test -w @earendil-works/pi-supervisor -- session-manager",
          },
        },
      ],
    },
  },
  {
    id: "s2-5",
    type: "toolResult",
    toolCallId: "call_test",
    toolName: "bash",
    content: [{ type: "text", text: "Tests: 12 passed\nexit code: 0" }],
  },
];

const session3Messages: MockEntry[] = [
  {
    id: "s3-1",
    type: "message",
    message: { role: "user", content: "supervisor 和 pi agent 有什么区别？" },
  },
  {
    id: "s3-2",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Supervisor 管理多个嵌入式 Agent 会话（含 parentId 子代理）；单个 pi agent 是一次对话与工具循环。Supervisor 默认工具集与 pi 相同：**read / write / edit / bash**。",
        },
      ],
    },
  },
];

const session121Messages: MockEntry[] = [
  {
    id: "s121-1",
    type: "message",
    message: {
      role: "user",
      content: "对 supervisor-client.ts 跑一遍测试。",
    },
  },
  {
    id: "s121-2",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "执行 **bash** 跑 vitest。" },
        {
          type: "toolCall",
          id: "call_test_sub",
          name: "bash",
          arguments: {
            intent: "运行 supervisor 包的 session-manager 测试",
            command: "npm test -w @earendil-works/pi-supervisor -- session-manager",
          },
        },
      ],
    },
  },
  {
    id: "s121-3",
    type: "toolResult",
    toolCallId: "call_test_sub",
    toolName: "bash",
    content: [{ type: "text", text: "Tests: 12 passed\nexit code: 0" }],
  },
];

/** fork(session-1, s1-8): history through edit result, then new turn */
const session1ForkMessages: MockEntry[] = [
  ...markOld(session1Messages.slice(0, 8), "sf-"),
  {
    id: "sf-new-1",
    type: "message",
    message: { role: "user", content: "改用手写 CSS，不要 Tailwind。" },
  },
  {
    id: "sf-new-2",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "已在 fork 分支移除 Tailwind class，改用手写 `scoped` 样式，与主会话继承部分区分（灰色气泡）。",
        },
      ],
    },
  },
];

/** clone(session-1): full copy + new question */
const session1CloneMessages: MockEntry[] = [
  ...markOld(session1Messages, "sc-"),
  {
    id: "sc-new-1",
    type: "message",
    message: { role: "user", content: "（克隆会话）能否把 Button 抽成通用 BaseButton？" },
  },
  {
    id: "sc-new-2",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "可以。我会在本 clone 会话新建 `BaseButton.vue`，上方灰色区域为从 session-1 继承的历史。",
        },
      ],
    },
  },
];

export const messagesBySessionId: Record<string, MockEntry[]> = {
  "session-1": session1Messages,
  "session-1-1": session11Messages,
  "session-1-2": session12Messages,
  "session-1-2-1": session121Messages,
  "session-1-fork": session1ForkMessages,
  "session-1-clone": session1CloneMessages,
  "session-2": session2Messages,
  "session-3": session3Messages,
  "session-4": session4Messages,
  "session-stream": sessionStreamMessages,
};

export const initialMockMessages = session1Messages;
