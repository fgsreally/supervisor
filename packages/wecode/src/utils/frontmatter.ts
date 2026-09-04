import { parse } from "yaml";

type ParsedFrontmatter<T extends Record<string, unknown>> = {
  frontmatter: T;
  body: string;
};

const normalizeNewlines = (value: string): string =>
  value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const extractFrontmatter = (content: string): { yamlString: string | null; body: string } => {
  const normalized = normalizeNewlines(content);

  if (!normalized.startsWith("---")) {
    return { yamlString: null, body: normalized };
  }

  let endIndex = normalized.indexOf("\n---", 3);
  let delimiterLength = 4;
  if (endIndex === -1) {
    const inlineMatch = /---(?=\n|$)/g;
    inlineMatch.lastIndex = 3;
    const match = inlineMatch.exec(normalized);
    if (match && normalized.slice(3, match.index).includes("\n")) {
      endIndex = match.index;
      delimiterLength = 3;
    }
  }
  if (endIndex === -1) {
    return { yamlString: null, body: normalized };
  }

  return {
    yamlString: normalized.slice(4, endIndex),
    body: normalized.slice(endIndex + delimiterLength).trim(),
  };
};

export const parseFrontmatter = <T extends Record<string, unknown> = Record<string, unknown>>(
  content: string,
): ParsedFrontmatter<T> => {
  const { yamlString, body } = extractFrontmatter(content);
  if (!yamlString) {
    return { frontmatter: {} as T, body };
  }
  const parsed = parse(yamlString);
  return { frontmatter: (parsed ?? {}) as T, body };
};

export const stripFrontmatter = (content: string): string => parseFrontmatter(content).body;
