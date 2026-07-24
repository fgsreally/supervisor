import { describe, expect, it } from "vitest";
import { getExternalProjectSource, findProjectByPath } from "./project-path";

const projects = [
  { id: "1", name: "frontend", cwd: "D:\\code\\frontend" },
  { id: "2", name: "backend", cwd: "D:\\code\\backend" },
];

describe("project-path", () => {
  it("matches longest project cwd", () => {
    const match = findProjectByPath("D:\\code\\backend\\src\\api.ts", projects);
    expect(match?.project.name).toBe("backend");
    expect(match?.relativePath.replace(/\\/g, "/")).toBe("src/api.ts");
  });

  it("shows source only for paths outside current workspace", () => {
    expect(
      getExternalProjectSource("D:\\code\\backend\\src\\api.ts", projects, "D:\\code\\frontend"),
    ).toBe("backend");
    expect(
      getExternalProjectSource("D:\\code\\frontend\\App.vue", projects, "D:\\code\\frontend"),
    ).toBeNull();
    expect(getExternalProjectSource("src/App.vue", projects, "D:\\code\\frontend")).toBeNull();
  });
});
