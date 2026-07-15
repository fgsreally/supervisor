import { hasAiTestCredentials } from "@earendil-works/pi-supervisor/testing/ai";
import { it } from "vitest";

export const aiIt = hasAiTestCredentials() ? it : it.skip;
