import type { MockEntry } from './types'

const demoPath = 'packages/supervisor-web-ui/example/src/utils/mock-stream-reply.ts'

/** Completed turn shown before user sends a new message. */
export const sessionStreamMessages: MockEntry[] = [
  {
    id: 'stream-0',
    type: 'system',
    content: '流式演示 · 含 bash / read / edit / write，发送消息后按 SSE 节奏回放',
  },
  {
    id: 'stream-1',
    type: 'message',
    message: {
      role: 'user',
      content: '帮我在 example 里确认 ChatView 的流式逻辑，并写一份说明',
    },
  },
  {
    id: 'stream-2',
    type: 'message',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: '先列出 example 源码目录。' },
        {
          type: 'toolCall',
          id: 'stream-seed-ls',
          name: 'bash',
          arguments: {
            intent: '列出 example 源码目录',
            command: 'ls -la packages/supervisor-web-ui/example/src',
          },
        },
      ],
    },
  },
  {
    id: 'stream-3',
    type: 'toolResult',
    toolCallId: 'stream-seed-ls',
    toolName: 'bash',
    content: [{ type: 'text', text: 'components/\nmock/\nutils/\nviews/\n' }],
  },
  {
    id: 'stream-4',
    type: 'message',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: `读取 \`${demoPath}\`：` },
        {
          type: 'toolCall',
          id: 'stream-seed-read',
          name: 'read',
          arguments: { path: demoPath, offset: 1, limit: 30 },
        },
      ],
    },
  },
  {
    id: 'stream-5',
    type: 'toolResult',
    toolCallId: 'stream-seed-read',
    toolName: 'read',
    content: [
      {
        type: 'text',
        text: "import type { MockEntry, MockTextPart, MockToolPart } from '../mock/types'\n\nexport const STREAM_DEMO_SESSION_ID = 'session-stream'\n...",
      },
    ],
  },
  {
    id: 'stream-6',
    type: 'message',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '下方输入框可再发一条消息；会再次以流式方式执行 read / write / edit / bash。',
        },
      ],
    },
  },
]
