import { describe, expect, it } from "vitest";
import { detectListenPort } from "../src/utils/listen-port.js";

describe("supervisor: detectListenPort", () => {
  it("reads Vite Local URL", () => {
    expect(
      detectListenPort(`
  VITE v5.4.21  ready in 312 ms

  ➜  Local:   http://localhost:4396/
  ➜  Network: http://192.168.1.8:4396/
`),
    ).toBe(4396);
  });

  it("does not treat Vite ready-in milliseconds as a port", () => {
    expect(detectListenPort("  VITE v5.4.21  ready in 312 ms\n")).toBeUndefined();
  });

  it("reads listening on port", () => {
    expect(detectListenPort("Server listening on port 8080")).toBe(8080);
  });
});
