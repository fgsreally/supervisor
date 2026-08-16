import { describe, expect, it } from "vitest";
import { createSupervisorCli, getSupervisorCliHelp } from "../src/cli-definition.js";

describe("CAC CLI definition", () => {
  it("parses module commands and global options", () => {
    const cli = createSupervisorCli();
    const parsed = cli.parse(
      ["node", "pi-supervisor", "extensions", "bind", "1", "supervisor-admin"],
      { run: false },
    );
    expect(cli.matchedCommandName).toBe("extensions");
    expect(parsed.args).toEqual(["bind", "1", "supervisor-admin"]);
    expect(parsed.options.port).toBe("3030");
  });

  it("generates module help from the CAC registry", () => {
    expect(getSupervisorCliHelp("extensions")).toContain(
      "pi-supervisor extensions <action> [...args]",
    );
    expect(getSupervisorCliHelp()).toContain("extensions <action> [...args]");
  });
});
