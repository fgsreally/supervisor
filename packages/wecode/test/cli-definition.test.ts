import { describe, expect, it } from "vitest";
import { createWecodeCli, getWecodeCliHelp } from "../src/cli-definition.js";

describe("CAC CLI definition", () => {
  it("parses module commands and global options", () => {
    const cli = createWecodeCli();
    const parsed = cli.parse(
      ["node", "wecode", "plugins", "bind", "1", "wecode-admin"],
      { run: false },
    );
    expect(cli.matchedCommandName).toBe("plugins");
    expect(parsed.args).toEqual(["bind", "1", "wecode-admin"]);
    expect(parsed.options.port).toBe("3030");
  });

  it("generates module help from the CAC registry", () => {
    expect(getWecodeCliHelp("plugins")).toContain(
      "wecode plugins <action> [...args]",
    );
    expect(getWecodeCliHelp()).toContain("plugins <action> [...args]");
  });
});
