import { describe, expect, it } from "vitest";
import {
  agentSkillUrl,
  parseSupervisorResourceUrl,
  sessionResourceUrl,
} from "../src/resources/protocol/index.js";

describe("resource protocol", () => {
  it("builds session and agent URLs", () => {
    expect(sessionResourceUrl(42, "messages")).toBe("pi-supervisor://sessions/42/messages");
    expect(agentSkillUrl(7, "deploy")).toBe("pi-supervisor://agents/7/skills/deploy");
  });

  it("parses session and agent resource URLs", () => {
    expect(parseSupervisorResourceUrl("pi-supervisor://sessions/34/result")).toEqual({
      kind: "session",
      sessionId: 34,
      resource: "result",
    });
    expect(parseSupervisorResourceUrl("pi-supervisor://agents/7/skills/deploy")).toEqual({
      kind: "agent",
      agentId: 7,
      resource: "skills",
      skillName: "deploy",
    });
  });
});
