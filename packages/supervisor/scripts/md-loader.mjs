import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (resolved.url.endsWith(".md")) {
    return { ...resolved, shortCircuit: true };
  }
  return resolved;
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".md")) {
    const content = await readFile(fileURLToPath(url), "utf8");
    return {
      format: "module",
      source: `export default ${JSON.stringify(content)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
