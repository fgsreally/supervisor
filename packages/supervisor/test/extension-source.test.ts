import { describe, expect, it } from "vitest";
import {
  parseExtensionSource,
  parseGithubUrl,
  repositoryToGitSource,
} from "../src/resources/extension-installer.js";

describe("extension source parsing", () => {
  it("parses plain GitHub repo URLs", () => {
    expect(parseGithubUrl("https://github.com/acme/my-ext")).toEqual({
      cloneUrl: "https://github.com/acme/my-ext.git",
      idHint: "my-ext",
      ref: undefined,
      subpath: undefined,
    });
  });

  it("parses GitHub repo URLs with branch and subpath", () => {
    expect(parseGithubUrl("https://github.com/acme/monorepo/tree/main/packages/my-ext")).toEqual({
      cloneUrl: "https://github.com/acme/monorepo.git",
      ref: "main",
      subpath: "packages/my-ext",
      idHint: "my-ext",
    });
  });

  it("routes GitHub URLs through parseExtensionSource", () => {
    const parsed = parseExtensionSource("https://github.com/acme/my-ext");
    expect(parsed).toEqual({
      kind: "git",
      cloneUrl: "https://github.com/acme/my-ext.git",
      idHint: "my-ext",
      ref: undefined,
      subpath: undefined,
    });
  });

  it("parses package.json repository fields", () => {
    expect(repositoryToGitSource("github:acme/my-ext")).toEqual({
      kind: "git",
      cloneUrl: "https://github.com/acme/my-ext.git",
      idHint: "my-ext",
      ref: undefined,
      subpath: undefined,
    });

    expect(
      repositoryToGitSource({
        type: "git",
        url: "https://github.com/acme/monorepo.git",
        directory: "packages/my-ext",
      }),
    ).toEqual({
      kind: "git",
      cloneUrl: "https://github.com/acme/monorepo.git",
      subpath: "packages/my-ext",
      idHint: "my-ext",
      ref: undefined,
    });
  });
});
