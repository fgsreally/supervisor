import { describe, expect, it } from "vitest";
import {
  getAutocompleteContext,
  getAutocompleteSuggestions,
  joinWorkspacePath,
} from "./chat-autocomplete";

describe("path helpers", () => {
  it("joins absolute paths for windows and posix roots", () => {
    expect(joinWorkspacePath("D:\\code\\app", "src/api")).toBe("D:\\code\\app\\src\\api");
    expect(joinWorkspacePath("/home/me/app", "src/api")).toBe("/home/me/app/src/api");
    expect(joinWorkspacePath("/home/me/app", ".")).toBe("/home/me/app");
  });
});

describe("at / atat context", () => {
  it("detects @ and @@ triggers", () => {
    expect(getAutocompleteContext("@", 1)?.trigger).toBe("at");
    expect(getAutocompleteContext("@@", 2)?.trigger).toBe("atat");
    expect(getAutocompleteContext("see @@back", 10)?.trigger).toBe("atat");
  });

  it("uses flat fuzzy file list for @ and project list for @@", () => {
    const atItems = getAutocompleteSuggestions(
      { trigger: "at", prefix: "@src", replaceStart: 0, replaceEnd: 4 },
      {
        workspaceFiles: [
          { path: "src/", isDirectory: true },
          { path: "src/a.ts", isDirectory: false },
          { path: "readme.md", isDirectory: false },
        ],
        browse: { atatProject: null },
        skills: [],
        prompts: [],
      },
    );
    expect(atItems.every((i) => i.kind === "file")).toBe(true);
    expect(atItems.some((i) => i.label === "src/a.ts" || i.label === "src/")).toBe(true);
    expect(atItems.some((i) => i.label === "readme.md")).toBe(false);

    const atatItems = getAutocompleteSuggestions(
      { trigger: "atat", prefix: "@@", replaceStart: 0, replaceEnd: 2 },
      {
        workspaceFiles: [],
        projects: [
          { id: "1", name: "frontend", cwd: "/a/fe" },
          { id: "2", name: "backend", cwd: "/a/be" },
        ],
        currentWorkspaceCwd: "/a/fe/worktree-1",
        currentProjectId: "1",
        browse: { atatProject: null },
        skills: [],
        prompts: [],
      },
    );
    expect(atatItems).toHaveLength(1);
    expect(atatItems[0]?.kind).toBe("project");
    expect(atatItems[0]?.label).toBe("backend");
  });
});
