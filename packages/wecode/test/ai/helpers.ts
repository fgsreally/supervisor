import { hasAiTestCredentials } from "wecode/test";
import { it } from "vitest";

export const aiIt = hasAiTestCredentials() ? it : it.skip;
