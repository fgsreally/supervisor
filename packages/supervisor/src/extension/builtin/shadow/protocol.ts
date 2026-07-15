import { SHADOW_URGENCIES, type ShadowProtocolResult, type ShadowUrgency } from "./types.js";

const XML_PROTOCOL_PROMPT = `The protocol is lazy: the default and expected response is an empty string. Use a field only when it provides clear, material value beyond the latest turn. Otherwise omit it. If every field would be omitted, return an empty string instead of an empty XML wrapper.

When at least one field is necessary, respond with exactly one XML element:

<shadow>
  <shadow-memory action="append">Long-term memory to retain</shadow-memory>
  <message>A message for the parent agent</message>
  <urgency>normal</urgency>
  <suggestion>Suggested text for the user's input box</suggestion>
  <title>A concise session title</title>
</shadow>

Every child element is optional. shadow-memory action must be append or replace. urgency applies only to message and must be low, normal, high, or critical. suggestion is only a draft for the user and is never sent to the parent agent. title is exceptional: emit it only when the current title is clearly wrong or meaningless and a stable topic has emerged; never emit title merely to rephrase or polish it. Routine conversation, acknowledgements, progress updates, and normally completed work should produce an empty response. Output XML only.`;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractXmlCandidate(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const fenced = trimmed.match(/```(?:xml)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function extractElement(xml: string, name: string): { attributes: string; content: string } | null {
  const match = xml.match(new RegExp(`<${name}(\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (!match) return null;
  return {
    attributes: match[1] ?? "",
    content: decodeXml(match[2] ?? "").trim(),
  };
}

function extractText(xml: string, name: string): string | undefined {
  const element = extractElement(xml, name);
  return element?.content || undefined;
}

function parseUrgency(value: string | undefined): ShadowUrgency | undefined {
  const normalized = value?.trim().toLowerCase();
  return SHADOW_URGENCIES.find((urgency) => urgency === normalized);
}

export function getShadowProtocolPrompt(): string {
  return XML_PROTOCOL_PROMPT;
}

export function parseShadowProtocolResponse(text: string): ShadowProtocolResult | null {
  const candidate = extractXmlCandidate(text);
  if (!candidate) return {};
  if (
    !/^<shadow(?:\s[^>]*)?\s*\/>$/i.test(candidate) &&
    !/^<shadow(?:\s[^>]*)?>[\s\S]*<\/shadow>$/i.test(candidate)
  ) {
    return null;
  }

  const memory = extractElement(candidate, "shadow-memory");
  const actionMatch = memory?.attributes.match(/\baction\s*=\s*["'](append|replace)["']/i);
  const action = actionMatch?.[1]?.toLowerCase();
  const shadowMemory =
    memory?.content && (action === "append" || action === "replace")
      ? { action, content: memory.content }
      : undefined;

  return {
    shadowMemory,
    message: extractText(candidate, "message"),
    urgency: parseUrgency(extractText(candidate, "urgency")),
    suggestion: extractText(candidate, "suggestion"),
    title: extractText(candidate, "title"),
  };
}

export function formatShadowRunPrompt(shadowMemory: string, latestTurn: string): string {
  return [
    "## Shadow memory",
    shadowMemory.trim() || "(empty)",
    "",
    "## Latest turn",
    latestTurn.trim() || "(empty)",
  ].join("\n");
}
