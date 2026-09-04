/** Virtual workspace file tree for @ attachment autocomplete in chat composer. */

export interface WorkspaceFileEntry {
  path: string;
  isDirectory: boolean;
}

const filesByWorkspace: Record<string, WorkspaceFileEntry[]> = {
  "ws-demo": [
    { path: "packages/wecode-web-ui/example/src/App.vue", isDirectory: false },
    { path: "packages/wecode-web-ui/example/src/views/ChatView.vue", isDirectory: false },
    { path: "packages/wecode-web-ui/example/src/components/", isDirectory: true },
    { path: "packages/wecode/src/http-server.ts", isDirectory: false },
    { path: "packages/wecode/src/session-manager.ts", isDirectory: false },
    { path: "packages/coding-agent/src/core/tools/bash.ts", isDirectory: false },
    { path: "packages/ai/src/models.generated.ts", isDirectory: false },
    { path: "AGENTS.md", isDirectory: false },
    { path: "package.json", isDirectory: false },
    { path: "README.md", isDirectory: false },
  ],
  "ws-my": [
    { path: "src/main.ts", isDirectory: false },
    { path: "src/App.vue", isDirectory: false },
    { path: "src/components/", isDirectory: true },
    { path: "package.json", isDirectory: false },
    { path: "vite.config.ts", isDirectory: false },
  ],
};

export function getWorkspaceFiles(workspaceId: string): WorkspaceFileEntry[] {
  return filesByWorkspace[workspaceId] ?? filesByWorkspace["ws-demo"] ?? [];
}
