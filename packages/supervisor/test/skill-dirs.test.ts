import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverSkillDescriptors,
  getNpxGlobalSkillsDirectories,
  getProjectSkillsDirectory,
  listGlobalSkillRoots,
  NPX_SKILLS_EXTERNAL,
} from "../src/agent/skill-dirs.js";
import { skillResourceHandler } from "../src/agent/skill-resource.js";

let root: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;
let originalXdg: string | undefined;
let originalSupervisorHome: string | undefined;

function writeSkill(dir: string, name: string, body = `Instructions for ${name}`) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n${body}`,
    "utf8",
  );
}

beforeEach(() => {
  root = join(tmpdir(), `supervisor-skill-dirs-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  originalXdg = process.env.XDG_CONFIG_HOME;
  originalSupervisorHome = process.env.SUPERVISOR_HOME;
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  delete process.env.XDG_CONFIG_HOME;
  process.env.SUPERVISOR_HOME = join(root, ".supervisor");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  if (originalSupervisorHome === undefined) delete process.env.SUPERVISOR_HOME;
  else process.env.SUPERVISOR_HOME = originalSupervisorHome;
});

describe("skill-dirs", () => {
  it("lists Supervisor global root before npx canonical global dirs", () => {
    const supervisorSkills = join(root, ".supervisor", "global", "skills");
    const agentsSkills = join(root, ".agents", "skills");
    mkdirSync(supervisorSkills, { recursive: true });
    mkdirSync(agentsSkills, { recursive: true });

    const roots = listGlobalSkillRoots();
    expect(roots[0]).toMatchObject({ path: resolve(supervisorSkills), external: false });
    expect(roots.some((r) => r.path === resolve(agentsSkills) && r.external)).toBe(true);
    expect(getNpxGlobalSkillsDirectories()).toContain(resolve(agentsSkills));
  });

  it("discovers skills across roots with Supervisor slug winning", () => {
    const supervisorSkills = join(root, ".supervisor", "global", "skills");
    const agentsSkills = join(root, ".agents", "skills");
    writeSkill(join(supervisorSkills, "shared"), "shared", "from supervisor");
    writeSkill(join(agentsSkills, "shared"), "shared", "from npx");
    writeSkill(join(agentsSkills, "npx-only"), "npx-only", "external only");

    const found = discoverSkillDescriptors(listGlobalSkillRoots());
    expect(found).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "shared",
          sourcePath: resolve(supervisorSkills, "shared"),
          external: false,
        }),
        expect.objectContaining({
          slug: "npx-only",
          sourcePath: resolve(agentsSkills, "npx-only"),
          external: true,
        }),
      ]),
    );
    expect(found.filter((s) => s.slug === "shared")).toHaveLength(1);
  });

  it("skillResourceHandler.discover marks npx skills as external", () => {
    const supervisorSkills = join(root, ".supervisor", "global", "skills");
    const agentsSkills = join(root, ".agents", "skills");
    writeSkill(join(supervisorSkills, "local"), "local");
    writeSkill(join(agentsSkills, "from-npx"), "from-npx");

    const discovered = skillResourceHandler.discover();
    expect(discovered.find((s) => s.slug === "local")?.meta).toEqual({});
    expect(discovered.find((s) => s.slug === "from-npx")?.meta).toEqual({
      external: NPX_SKILLS_EXTERNAL,
    });
  });

  it("resolves project skills directory under cwd/.agents/skills", () => {
    const cwd = join(root, "proj");
    expect(getProjectSkillsDirectory(cwd)).toBe(join(cwd, ".agents", "skills"));
  });
});
