import type { ShadowProtocolResult } from "./types.js";

const XML_PROTOCOL_PROMPT = `The protocol is lazy: the default and expected response is an empty string. Use a field only when it provides clear, material value beyond the latest turn. Otherwise omit it. If every field would be omitted, return an empty string instead of an empty XML wrapper.

When at least one field is necessary, respond with exactly one XML element:

<shadow>
  <shadow-memory action="append">Long-term memory to retain</shadow-memory>
  <message>A message for the parent agent</message>
  <interrupt>true</interrupt>
  <status>A single short sentence describing the parent agent's current work and progress</status>
  <suggested-questions>
    <question>A likely useful next question from the user</question>
    <question>Another distinct next question</question>
  </suggested-questions>
  <title>A concise session title</title>
  <commit-message>A concise conventional commit message</commit-message>
</shadow>

Every child element is optional. shadow-memory action must be append or replace and is emitted only when durable information is genuinely worth retaining. message is queued for the parent agent by default. interrupt may be true only for an exceptional issue that requires stopping the parent's current execution immediately; otherwise omit it. status is one short sentence describing what the parent agent is doing and its current progress. suggested-questions contains up to four short, distinct questions the user is reasonably likely to ask next; emit it only when the latest answer creates useful follow-up paths. title is exceptional: emit it only when the current title is clearly wrong or meaningless and a stable topic has emerged; never emit title merely to rephrase or polish it. commit-message is exceptional: emit it only when the accumulated code changes form a coherent, tested milestone that should be committed before more work continues. It creates an intermediate Session-branch commit and never means the Session should be completed or merged. Routine conversation and acknowledgements should normally produce an empty response, but status may be refreshed when progress materially changes. Output XML only.`;

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

function extractSuggestedQuestions(xml: string): string[] | undefined {
  const container = extractElement(xml, "suggested-questions");
  if (!container) return undefined;
  const questions = [
    ...container.content.matchAll(/<question(?:\s[^>]*)?>([\s\S]*?)<\/question>/gi),
  ]
    .map((match) =>
      decodeXml(match[1] ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((question, index, all) => question.length > 0 && all.indexOf(question) === index)
    .slice(0, 4);
  return questions.length > 0 ? questions : undefined;
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
    interrupt: extractText(candidate, "interrupt")?.toLowerCase() === "true",
    suggestedQuestions: extractSuggestedQuestions(candidate),
    status: extractText(candidate, "status"),
    title: extractText(candidate, "title"),
    commitMessage: extractText(candidate, "commit-message"),
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
