import { decryptApiKey } from "../../utils/encrypt.js";

export function resolveApiKey(provider: string, envName: string, encrypted?: string): string {
  const key = process.env[envName];
  if (key) return key;
  if (encrypted) return decryptApiKey(encrypted);
  throw new Error(`${provider} API key is not configured`);
}
