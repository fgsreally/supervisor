import { describe, expect, it } from "vitest";
import { parseShadowProtocolResponse } from "../src/shadow/protocol.js";

describe("shadow protocol", () => {
	it("parses fenced JSON responses", () => {
		const result = parseShadowProtocolResponse(`
Here is the result:
\`\`\`json
{
  "memory": { "append": "remember this" },
  "parent": { "message": "fix it", "level": 80 }
}
\`\`\`
`);
		expect(result?.memory?.append).toBe("remember this");
		expect(result?.parent?.message).toBe("fix it");
		expect(result?.parent?.level).toBe(80);
	});
});
