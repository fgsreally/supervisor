import type { MockSkillFile } from "../mock/resources";

export interface SkillTreeNode {
  /** Unique id for he-tree */
  id: string;
  text: string;
  children?: SkillTreeNode[];
  /** Set on file leaves */
  fileId?: string;
}

/** Build nested folder tree from skill file relative paths. */
export function buildSkillFileTree(files: MockSkillFile[]): SkillTreeNode[] {
  const root: SkillTreeNode[] = [];

  for (const file of files) {
    const segments = file.fileName.split("/").filter(Boolean);
    let level = root;
    let pathSoFar = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLeaf = i === segments.length - 1;
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      const nodeId = `${file.id}::${pathSoFar}`;

      let node = level.find((n) => n.text === segment);
      if (!node) {
        node = {
          id: nodeId,
          text: segment,
          ...(isLeaf ? { fileId: file.id } : { children: [] }),
        };
        level.push(node);
      } else if (isLeaf) {
        node.fileId = file.id;
      }

      if (!isLeaf) {
        if (!node.children) node.children = [];
        level = node.children;
      }
    }
  }

  return sortSkillTree(root);
}

function sortSkillTree(nodes: SkillTreeNode[]): SkillTreeNode[] {
  const folders = nodes
    .filter((n) => n.children?.length)
    .sort((a, b) => a.text.localeCompare(b.text));
  const files = nodes
    .filter((n) => !n.children?.length)
    .sort((a, b) => a.text.localeCompare(b.text));
  for (const folder of folders) {
    if (folder.children) folder.children = sortSkillTree(folder.children);
  }
  return [...folders, ...files];
}
