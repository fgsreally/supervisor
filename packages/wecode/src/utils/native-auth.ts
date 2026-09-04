import { AuthStorage } from "@earendil-works/pi-coding-agent";
import type { OAuthLoginCallbacks, OAuthProviderId } from "@earendil-works/pi-ai";

export const NATIVE_OAUTH_PROVIDERS = new Set<OAuthProviderId>([
  "openai-codex",
  "anthropic",
  "github-copilot",
]);

const authStorage = AuthStorage.create();

export type NativeLoginState = {
  provider: OAuthProviderId;
  status: "starting" | "waiting" | "complete" | "error";
  url: string | null;
  instructions: string | null;
  error: string | null;
};

const logins = new Map<string, NativeLoginState>();

function requireOAuthProvider(provider: string): OAuthProviderId {
  if (!NATIVE_OAUTH_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported native OAuth provider: ${provider}`);
  }
  return provider;
}

export function nativeAuthStatus(provider: string) {
  const providerId = requireOAuthProvider(provider);
  const configured = authStorage.hasAuth(providerId);
  return { provider: providerId, configured, status: configured ? "configured" : "not_configured" };
}

export async function getNativeApiKey(provider: string): Promise<string | undefined> {
  return authStorage.getApiKey(requireOAuthProvider(provider));
}

export function startNativeLogin(provider: string): { id: string; state: NativeLoginState } {
  const providerId = requireOAuthProvider(provider);
  const id = `${providerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const state: NativeLoginState = {
    provider: providerId,
    status: "starting",
    url: null,
    instructions: null,
    error: null,
  };
  logins.set(id, state);

  const callbacks: OAuthLoginCallbacks = {
    onAuth: (info) => {
      state.status = "waiting";
      state.url = info.url;
      state.instructions = info.instructions ?? null;
    },
    onPrompt: async (prompt) => {
      throw new Error(prompt.message || "OAuth login requires additional input");
    },
    onProgress: (message) => {
      state.instructions = message;
    },
  };

  void authStorage
    .login(providerId, callbacks)
    .then(() => {
      state.status = "complete";
      state.url = null;
      state.instructions = null;
    })
    .catch((error: unknown) => {
      state.status = "error";
      state.error = error instanceof Error ? error.message : String(error);
    });

  return { id, state };
}

export function getNativeLogin(id: string): NativeLoginState | undefined {
  return logins.get(id);
}

export function logoutNative(provider: string): void {
  authStorage.logout(requireOAuthProvider(provider));
}
