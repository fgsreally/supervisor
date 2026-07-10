import { describe, expect, it } from "vitest";
import { decodeHtmlText, htmlToText } from "../src/extension-system/extensions/web/html.js";
import { assertSafeUrl } from "../src/extension-system/extensions/web/ssrf.js";

describe("web extension: ssrf", () => {
  it("blocks private IPv4 literals", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toThrow(/SSRF protection/);
    await expect(assertSafeUrl("http://192.168.1.1/")).rejects.toThrow(/SSRF protection/);
    await expect(assertSafeUrl("http://10.0.0.1/")).rejects.toThrow(/SSRF protection/);
  });

  it("blocks metadata hostnames", async () => {
    await expect(assertSafeUrl("http://metadata.google.internal/")).rejects.toThrow(
      /SSRF protection/,
    );
  });

  it("allows public hostnames", async () => {
    await expect(assertSafeUrl("https://example.com/")).resolves.toBeUndefined();
  });
});

describe("web extension: html", () => {
  it("strips tags and decodes entities", () => {
    expect(decodeHtmlText("<b>Hello</b> &amp; world")).toBe("Hello & world");
  });

  it("extracts title and body text", () => {
    const html = "<html><head><title>Test Page</title></head><body><p>Hello</p></body></html>";
    expect(htmlToText(html)).toBe("# Test Page\n\nHello");
  });
});
