import { registerPlugin } from "@capacitor/core";

import type { WecodeNativePlugin } from "./definitions.js";

const WecodeNative = registerPlugin<WecodeNativePlugin>("WecodeNative", {
  web: () => import("./web.js").then((m) => new m.WecodeNativeWeb()),
});

export * from "./definitions.js";
export { WecodeNative };
