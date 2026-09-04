/** Extract plain text from user/assistant message content (string or parts array). */
import {
  makeAttachmentToken,
  makePastedTextToken,
  ordinaryUserPromptText,
  parseUserPrompt,
} from "./user-prompt";

export function messageTextContent(content: unknown): string {
  if (typeof content === "string") return stripLegacyImageXml(ordinaryUserPromptText(content));
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        part?.type === "text" && typeof part.text === "string",
    )
    .map((part) => stripLegacyImageXml(part.text))
    .join("");
}

/** Keep non-text user prompt parts in their original position for rich rendering. */
export function messageRichTextContent(content: unknown): string {
  if (typeof content === "string") {
    return parseUserPrompt(content)
      .map((part) => {
        if (part.type === "text") return part.text;
        if (part.type === "pasted_text") return makePastedTextToken(part.id);
        return makeAttachmentToken(part.id);
      })
      .join("");
  }
  if (!Array.isArray(content)) return "";

  let imageIndex = 0;
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const type = (part as { type?: string }).type;
      if (type === "text") return messageRichTextContent((part as { text?: unknown }).text);
      if (type === "image") return `[Image #${++imageIndex}]`;
      if (type === "pasted_text" || type === "attachment") {
        const id = (part as { id?: unknown }).id;
        return typeof id === "string"
          ? type === "pasted_text"
            ? makePastedTextToken(id)
            : makeAttachmentToken(id)
          : "";
      }
      return "";
    })
    .join("");
}

export function messageImageParts(content: unknown): Array<{
  name: string;
  mediaId?: string;
  mimeType?: string;
  previewUrl?: string;
  missing?: boolean;
}> {
  if (!Array.isArray(content)) return [];
  const images: Array<{
    name: string;
    mediaId?: string;
    mimeType?: string;
    previewUrl?: string;
    missing?: boolean;
  }> = [];
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
      previewUrl:
        typeof (part as { previewUrl?: unknown }).previewUrl === "string"
          ? (part as { previewUrl: string }).previewUrl
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
