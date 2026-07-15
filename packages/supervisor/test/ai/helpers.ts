import { hasAiTestCredentials } from "@earendil-works/pi-supervisor/test";
import { it } from "vitest";

export const aiIt = hasAiTestCredentials() ? it : it.skip;
