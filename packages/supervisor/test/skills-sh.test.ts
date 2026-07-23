import { describe, expect, it, vi } from "vitest";
import {
  searchSkillsSh,
  skillInstallSourceFromSearchHit,
} from "../src/resources/skills-sh.js";

describe("skills-sh helpers", () => {
  it("builds owner/repo@skill install sources", () => {
    expect(
      skillInstallSourceFromSearchHit({
        source: "vercel-labs/agent-skills",
        name: "typescript-guide",
      }),
    ).toBe("vercel-labs/agent-skills@typescript-guide");
  });

  it("returns empty results for blank query without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(searchSkillsSh("   ")).resolves.toEqual({
      query: "",
      skills: [],
      count: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
