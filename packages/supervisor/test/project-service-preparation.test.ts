import { describe, expect, it } from "vitest";
import { buildSessionServicesPrompt } from "../src/core/session-services.js";
import {
  buildProjectServicePreparationPrompt,
  preparationToServices,
} from "../src/extension/builtin/project-services/preparation.js";

describe("project service preparation", () => {
  it("requires Watson to inspect the project without starting it", () => {
    const prompt = buildProjectServicePreparationPrompt(43219);
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("只读探查");
    expect(prompt).toContain("${PORT}");
    expect(prompt).toContain("43219");
    expect(prompt).toContain("禁止使用 3000、5173");
  });

  it("turns the structured result into one session-owned port registration", () => {
    expect(
      preparationToServices(
        {
          detected: true,
          installCommand: "pnpm install",
          startCommand: "pnpm dev -- --host 0.0.0.0 --port ${PORT}",
          stopCommand: "",
          destroyCommand: "",
          appName: "web",
          appPath: "/preview",
        },
        43219,
      ),
    ).toEqual({
      status: "unregistered",
      installCommand: "pnpm install",
      startCommand: "pnpm dev -- --host 0.0.0.0 --port ${PORT}",
      stopCommand: undefined,
      destroyCommand: undefined,
      apps: [{ name: "web", port: 43219, path: "/preview" }],
    });
  });

  it("rejects fixed-port startup commands", () => {
    expect(() =>
      preparationToServices(
        {
          detected: true,
          installCommand: "",
          startCommand: "vite --port 5173",
          stopCommand: "",
          destroyCommand: "",
          appName: "web",
          appPath: "/",
        },
        43219,
      ),
    ).toThrow("${PORT}");
  });

  it("injects the resolved command and active entry into the coding prompt", () => {
    const prompt = buildSessionServicesPrompt({
      status: "active",
      startCommand: "vite --port ${PORT}",
      resolvedStartCommand: "vite --port 43219",
      apps: [{ name: "web", port: 43219, path: "/" }],
    });
    expect(prompt).toContain("已由 Supervisor 启动");
    expect(prompt).toContain("vite --port 43219");
    expect(prompt).toContain("web@127.0.0.1:43219/");
  });
});
