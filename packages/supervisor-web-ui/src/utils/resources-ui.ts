import type { AgentResources, ResourceLayer } from "@/api";
import type {
  UIFileItem,
  UIResourceItem,
  UIResourceKind,
  UISkillItem,
  UISkillFile,
} from "@/types/ui";

export function resourceId(kind: UIResourceKind, path: string): string {
  return `${kind}:${path}`;
}

export function parseResourceId(id: string): { kind: UIResourceKind; path: string } | null {
  const idx = id.indexOf(":");
  if (idx <= 0) return null;
  const kind = id.slice(0, idx) as UIResourceKind;
  if (kind !== "skills" && kind !== "extensions" && kind !== "prompts" && kind !== "mcp") {
    return null;
  }
  return { kind: id.slice(0, idx) as UIResourceKind, path: id.slice(idx + 1) };
}

export function layerFromApi(resources: ResourceLayer): UIResourceItem[] {
  return layerToUiItems(undefined, resources, "global");
}

function skillFilesToUi(
  skillPath: string,
  files: Array<{ relativePath: string; content: string }>,
): UISkillFile[] {
  return files.map((file) => ({
    id: `${skillPath}/${file.relativePath}`,
    fileName: file.relativePath.split("/").pop() ?? file.relativePath,
    content: file.content,
  }));
}

function extensionFilesToUi(
  extPath: string,
  files: Array<{ relativePath: string; content: string }>,
): UISkillFile[] {
  return files.map((file) => ({
    id: `${extPath}/${file.relativePath}`,
    fileName: file.relativePath.split("/").pop() ?? file.relativePath,
    content: file.content,
  }));
}

function layerToUiItems(
  agentId: string | undefined,
  layer: ResourceLayer,
  resourceLayer: "global" | "agent",
): UIResourceItem[] {
  const items: UIResourceItem[] = [];
  for (const skill of layer.skills) {
    const item: UISkillItem = {
      id: resourceId("skills", skill.filePath),
      kind: "skills",
      layer: resourceLayer,
      name: skill.name,
      description: skill.description,
      agentIds: agentId ? [agentId] : undefined,
      rootPath: skill.filePath,
      files: skillFilesToUi(skill.filePath, skill.files),
    };
    items.push(item);
  }
  for (const prompt of layer.prompts) {
    const item: UIFileItem = {
      id: resourceId("prompts", prompt.filePath),
      kind: "prompts",
      layer: resourceLayer,
      name: prompt.name,
      description: prompt.description,
      agentIds: agentId ? [agentId] : undefined,
      fileName: prompt.filePath.split(/[/\\]/).pop() ?? prompt.name,
      path: prompt.filePath,
      content: prompt.content,
    };
    items.push(item);
  }
  for (const ext of layer.extensions) {
    const item: UIFileItem = {
      id: resourceId("extensions", ext.entryPath),
      kind: "extensions",
      layer: resourceLayer,
      name: ext.name ?? ext.fileName,
      description: ext.description ?? ext.entryPath,
      agentIds: agentId ? [agentId] : undefined,
      fileName: ext.fileName,
      path: ext.entryPath,
      rootPath: ext.rootDir,
      files: extensionFilesToUi(ext.rootDir, ext.files),
      content: ext.files.length > 0 ? ext.files[0].content : "",
    };
    items.push(item);
  }
  for (const mcp of layer.mcp ?? []) {
    items.push({
      id: resourceId("mcp", mcp.filePath),
      kind: "mcp",
      layer: resourceLayer,
      name: mcp.name,
      description: mcp.description,
      agentIds: agentId ? [agentId] : undefined,
      fileName: mcp.filePath.split(/[/\\]/).pop() ?? `${mcp.id}.json`,
      path: mcp.filePath,
      content: mcp.content,
    });
  }
  return items;
}

export function agentResourcesToUiItems(
  agentId: string,
  resources: AgentResources,
): UIResourceItem[] {
  return layerToUiItems(agentId, resources.layers.agent, "agent");
}

/** Agent tab shows resources currently bound to the agent. */
export function getLinkedResourcesForAgent(
  _agentId: string,
  agentItems: UIResourceItem[],
  _globalItems: UIResourceItem[],
): UIResourceItem[] {
  return agentItems;
}

export function getResourcesByKind(
  items: UIResourceItem[],
  kind: UIResourceKind,
): UIResourceItem[] {
  return items.filter((item) => item.kind === kind);
}

export function getResourceById(items: UIResourceItem[], id: string): UIResourceItem | undefined {
  return items.find((item) => item.id === id);
}
