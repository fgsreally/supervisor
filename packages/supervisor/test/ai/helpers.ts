import { hasAiTestCredentials } from "pi-supervisor/test";
import { it } from "vitest";

export const aiIt = hasAiTestCredentials() ? it : it.skip;
