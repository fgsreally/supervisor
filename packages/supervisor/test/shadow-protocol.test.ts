import { describe, expect, it } from "vitest";
import {
  getShadowProtocolPrompt,
  parseShadowProtocolResponse,
} from "../src/extension/builtin/shadow/protocol.js";

describe("shadow XML protocol", () => {
  it("parses every supported field", () => {
    const result = parseShadowProtocolResponse(`
\`\`\`xml
<shadow>
  <shadow-memory action="append">remember &lt;this&gt;</shadow-memory>
  <message>check the requirement</message>
  <urgency>high</urgency>
  <suggestion>Ask it to add a regression test</suggestion>
  <title>Shadow redesign</title>
</shadow>
\`\`\`
`);

    expect(result).toEqual({
      shadowMemory: { action: "append", content: "remember <this>" },
      message: "check the requirement",
      urgency: "high",
      suggestion: "Ask it to add a regression test",
      title: "Shadow redesign",
    });
  });

  it("accepts empty responses and an empty root", () => {
    expect(parseShadowProtocolResponse("")).toEqual({});
    expect(parseShadowProtocolResponse("<shadow />")).toEqual({
      shadowMemory: undefined,
      message: undefined,
      urgency: undefined,
      suggestion: undefined,
      title: undefined,
    });
  });

  it("rejects non-protocol output and invalid enum values", () => {
    expect(parseShadowProtocolResponse("nothing to report")).toBeNull();
    expect(
      parseShadowProtocolResponse("<shadow><urgency>80</urgency></shadow>")?.urgency,
    ).toBeUndefined();
  });

  it("injects the protocol separately from the agent prompt", () => {
    const prompt = getShadowProtocolPrompt();
    expect(prompt).toContain("<shadow-memory");
    expect(prompt).toContain("<suggestion>");
    expect(prompt).toContain("<title>");
    expect(prompt).toContain("default and expected response is an empty string");
    expect(prompt).toContain("title is exceptional");
  });
});
