import type { SessionWorkspaceFileEntry } from "@/api";
import type { SessionChangedFileView } from "@/components/chat/SessionChangesPopover.vue";

export interface SessionFileTreeNode {
  id: string;
  text: string;
  children?: SessionFileTreeNode[];
  filePath?: string;
}

export function buildSessionFileTree(
  entries: SessionWorkspaceFileEntry[],
  changedFiles?: SessionChangedFileView[],
): SessionFileTreeNode[] {
  const root: SessionFileTreeNode[] = [];
  const paths = new Set(
    entries.filter((entry) => !entry.isDirectory).map((entry) => entry.path.replace(/\\/g, "/")),
  );
  for (const file of changedFiles ?? []) {
    if (file?.path && file.status === "deleted") {
      paths.add(file.path.replace(/\\/g, "/"));
    }
  }
  const fileEntries = [...paths].map((path) => ({ path, isDirectory: false }));

  for (const file of fileEntries) {
    const segments = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    let level = root;
    let pathSoFar = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const isLeaf = i === segments.length - 1;
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      let node = level.find((n) => n.text === segment);
      if (!node) {
        node = {
          id: pathSoFar,
          text: segment,
          ...(isLeaf ? { filePath: file.path.replace(/\\/g, "/") } : { children: [] }),
        };
        level.push(node);
      } else if (isLeaf) {
        node.filePath = file.path.replace(/\\/g, "/");
      }
      if (!isLeaf) {
        if (!node.children) node.children = [];
        level = node.children;
      }
    }
  }

  return sortSessionFileTree(root);
}

function sortSessionFileTree(nodes: SessionFileTreeNode[]): SessionFileTreeNode[] {
  const folders = nodes
    .filter((n) => n.children?.length)
    .sort((a, b) => a.text.localeCompare(b.text));
  const leaves = nodes
    .filter((n) => !n.children?.length)
    .sort((a, b) => a.text.localeCompare(b.text));
  for (const folder of folders) {
    if (folder.children) folder.children = sortSessionFileTree(folder.children);
  }
  return [...folders, ...leaves];
}

export function changeStatusLabel(status: SessionChangedFileView["status"]): string {
  if (status === "added") return "A";
  if (status === "deleted") return "D";
  return "M";
}

export function fileBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalized;
}
