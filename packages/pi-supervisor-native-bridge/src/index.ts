import { registerPlugin } from "@capacitor/core";

import type { SupervisorNativePlugin } from "./definitions.js";

const SupervisorNative = registerPlugin<SupervisorNativePlugin>("SupervisorNative", {
  web: () => import("./web.js").then((m) => new m.SupervisorNativeWeb()),
});

export * from "./definitions.js";
export { SupervisorNative };
