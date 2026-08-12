import { icons as vscodeIcons } from "@iconify-json/vscode-icons";
import { getIconData, iconToSVG } from "@iconify/utils";
import {
  fileIconName,
  fileIconNameFromPath,
  fileIconSvg,
  type FileIconKind,
} from "../utils/file-type-icon";

/** Offline SVG from bundled vscode-icons (no CDN / async Iconify fetch). */
export function vscodeIconSvg(iconName: string, size = 16): string {
  const id = iconName.includes(":") ? iconName.split(":")[1]! : iconName;
  const data = getIconData(vscodeIcons, id);
  if (!data) return "";
  const rendered = iconToSVG(data, { height: `${size}px` });
  const attrs = Object.entries(rendered.attributes)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${rendered.body}</svg>`;
}

export function fileTypeIconSvg(options: {
  path?: string;
  kind?: FileIconKind;
  isDirectory?: boolean;
  size?: number;
}): string {
  const iconName = options.path
    ? fileIconNameFromPath(options.path, options.isDirectory)
    : fileIconName(options.kind ?? "generic");
  return (
    vscodeIconSvg(iconName, options.size ?? 16) ||
    fileIconSvg(options.kind ?? "generic")
  );
}
