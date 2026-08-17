import { describe, expect, it } from "vitest";
import { delimiter, join } from "node:path";
import {
  appsToPortEnv,
  findProjectBinDir,
  withProjectPath,
} from "../src/core/session-registered-services.js";
import {
  collectReservedServicePorts,
  parseSessionServicesMeta,
} from "../src/core/session-services.js";
import { substitutePortPlaceholders } from "../src/core/session-service-runtime.js";
import { validateNumberedPortPlaceholders } from "../src/extension/builtin/service/index.js";

describe("numbered session service ports", () => {
  it("accepts consecutive PORT1..N placeholders only", () => {
    expect(validateNumberedPortPlaceholders("server --ui ${PORT1} --api %PORT2%")).toEqual([
      "PORT1",
      "PORT2",
    ]);
    expect(validateNumberedPortPlaceholders("server --port ${PORT2}")).toBeNull();
    expect(validateNumberedPortPlaceholders("server --port 5173")).toBeNull();
  });

  it("collects ports reserved by other sessions", () => {
    expect(
      collectReservedServicePorts(
        [
          {
            id: 136,
            meta: JSON.stringify({
              services: {
                status: "active",
                startCommand: "pnpm dev --port ${PORT1}",
                apps: [{ name: "web", port: 4396, portEnv: { PORT1: 4396 }, path: "/" }],
              },
            }),
          },
          {
            id: 137,
            meta: JSON.stringify({
              services: {
                status: "idle",
                startCommand: "pnpm dev --port ${PORT1}",
                apps: [{ name: "dev", port: 4428, portEnv: { PORT1: 4428 }, path: "/" }],
              },
            }),
          },
        ],
        137,
      ),
    ).toEqual([4396]);
  });

  it("persists numbered ports and substitutes them on later starts", () => {
    const services = parseSessionServicesMeta({
      services: {
        status: "idle",
        startCommand: "server --ui ${PORT1} --api ${PORT2}",
        apps: [
          {
            name: "web",
            port: 4396,
            portEnv: { PORT1: 4396, PORT2: 4397 },
            path: "/",
          },
        ],
      },
    });

    expect(services?.apps?.[0]?.portEnv).toEqual({ PORT1: 4396, PORT2: 4397 });
    const env = appsToPortEnv(services?.apps);
    expect(substitutePortPlaceholders(services!.startCommand, env)).toBe(
      "server --ui 4396 --api 4397",
    );
  });

  it("prefers the nearest project node_modules bin over the Supervisor PATH", () => {
    const cwd = join(process.cwd(), ".supervisor", "worktrees", "test");
    const projectBin = join(process.cwd(), "node_modules", ".bin");
    expect(findProjectBinDir(cwd)).toBe(projectBin);
    const existingPath = join("supervisor", "node_modules", ".bin");
    const env = withProjectPath(cwd, { Path: existingPath });
    expect(env.Path).toBe(`${projectBin}${delimiter}${existingPath}`);
  });
});
