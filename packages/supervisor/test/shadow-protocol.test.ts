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
  <interrupt>true</interrupt>
  <status>Fixing the payment callback; regression tests are still running.</status>
  <suggested-questions>
    <question>What should I test next?</question>
    <question>Can this be deployed safely?</question>
  </suggested-questions>
  <title>Shadow redesign</title>
  <commit-message>feat: checkpoint shadow redesign</commit-message>
</shadow>
\`\`\`
`);

    expect(result).toEqual({
      shadowMemory: { action: "append", content: "remember <this>" },
      message: "check the requirement",
      interrupt: true,
      status: "Fixing the payment callback; regression tests are still running.",
      suggestedQuestions: ["What should I test next?", "Can this be deployed safely?"],
      title: "Shadow redesign",
      commitMessage: "feat: checkpoint shadow redesign",
    });
  });

  it("accepts empty responses and an empty root", () => {
    expect(parseShadowProtocolResponse("")).toEqual({});
    expect(parseShadowProtocolResponse("<shadow />")).toEqual({
      shadowMemory: undefined,
      message: undefined,
      interrupt: false,
      suggestedQuestions: undefined,
      status: undefined,
      title: undefined,
      commitMessage: undefined,
    });
  });

  it("rejects non-protocol output and only interrupts on true", () => {
    expect(parseShadowProtocolResponse("nothing to report")).toBeNull();
    expect(
      parseShadowProtocolResponse("<shadow><interrupt>false</interrupt></shadow>")?.interrupt,
    ).toBe(false);
  });

  it("injects the protocol separately from the agent prompt", () => {
    const prompt = getShadowProtocolPrompt();
    expect(prompt).toContain("<shadow-memory");
    expect(prompt).toContain("<suggested-questions>");
    expect(prompt).toContain("<status>");
    expect(prompt).not.toContain("<suggestion>");
    expect(prompt).not.toContain("<urgency>");
    expect(prompt).toContain("<title>");
    expect(prompt).toContain("<commit-message>");
    expect(prompt).toContain("default and expected response is an empty string");
    expect(prompt).toContain("title is exceptional");
    expect(prompt).toContain("genuinely worth retaining");
  });
});
