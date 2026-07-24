/** Extract plain text from user/assistant message content (string or parts array). */
export function messageTextContent(content: unknown): string {
  if (typeof content === "string") return stripLegacyImageXml(content);
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        part?.type === "text" && typeof part.text === "string",
    )
    .map((part) => stripLegacyImageXml(part.text))
    .join("");
}

export function messageImageParts(
  content: unknown,
): Array<{ name: string; mediaId?: string; mimeType?: string; missing?: boolean }> {
  if (!Array.isArray(content)) return [];
  const images: Array<{ name: string; mediaId?: string; mimeType?: string; missing?: boolean }> =
    [];
  for (const part of content) {
    if (!part || typeof part !== "object" || (part as { type?: string }).type !== "image") continue;
    const mediaId =
      typeof (part as { mediaId?: unknown }).mediaId === "string"
        ? (part as { mediaId: string }).mediaId
        : undefined;
    const name =
      typeof (part as { name?: unknown }).name === "string" && (part as { name: string }).name
        ? (part as { name: string }).name
        : mediaId
          ? `[Image]`
          : "[Image]";
    images.push({
      name,
      mediaId,
      mimeType:
        typeof (part as { mimeType?: unknown }).mimeType === "string"
          ? (part as { mimeType: string }).mimeType
          : undefined,
      missing: !!(part as { missing?: boolean }).missing,
    });
  }
  return images;
}

function stripLegacyImageXml(text: string): string {
  return text
    .replace(
      /<image\b[^>]*\bname=(?:\[[^\]]+\]|"[^"]*"|'[^']*')[^>]*\bpath="[^"]*"[^>]*\/?\s*>\s*(?:<\/image\s*>)?/gi,
      "",
    )
    .replace(/<\/image\s*>/gi, "")
    .replace(/(^|\n)\s*>\s*(?=\n|$)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drop [Image #N] placeholders when thumbs are rendered separately. */
export function stripImagePlaceholders(text: string): string {
  return text
    .replace(/\[Image(?:\s*#\s*\d+)?\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
