import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectSetup, ProjectSetupProvider } from "./types.js";

function has(cwd: string, file: string): boolean {
  return existsSync(join(cwd, file));
}

function readJson(cwd: string, file: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(cwd, file), "utf8"));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function nodePackageManager(cwd: string): string | undefined {
  const value = readJson(cwd, "package.json")?.packageManager;
  if (typeof value !== "string") return undefined;
  const match = /^(pnpm|yarn|npm|bun)(?:@|$)/.exec(value.trim());
  return match?.[1];
}

function nodeLockfile(cwd: string, packageManager?: string): string | undefined {
  const preferred: Record<string, string[]> = {
    pnpm: ["pnpm-lock.yaml"],
    yarn: ["yarn.lock"],
    npm: ["package-lock.json"],
    bun: ["bun.lock", "bun.lockb"],
  };
  const candidates = packageManager
    ? (preferred[packageManager] ?? [])
    : ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lock", "bun.lockb"];
  return candidates.find((file) => has(cwd, file));
}

function nodeSetup(cwd: string): ProjectSetup {
  const packageManager = nodePackageManager(cwd);
  const lockfile = nodeLockfile(cwd, packageManager);
  const manager =
    packageManager ??
    (lockfile === "pnpm-lock.yaml"
      ? "pnpm"
      : lockfile === "yarn.lock"
        ? "yarn"
        : lockfile === "bun.lock" || lockfile === "bun.lockb"
          ? "bun"
          : "npm");
  const installCommand =
    manager === "pnpm"
      ? lockfile
        ? "pnpm install --frozen-lockfile"
        : "pnpm install"
      : manager === "yarn"
        ? lockfile
          ? has(cwd, ".yarnrc.yml")
            ? "yarn install --immutable"
            : "yarn install --frozen-lockfile"
          : "yarn install"
        : manager === "bun"
          ? lockfile
            ? "bun install --no-save"
            : "bun install"
          : lockfile
            ? "npm ci"
            : "npm install";
  return {
    provider: "node",
    packageManager: manager,
    installCommand,
    dependencyFiles: ["package.json", ...(lockfile ? [lockfile] : [])],
    source: lockfile ?? "package.json",
    ...(lockfile ? { reusableDependencyDirectories: ["node_modules"] } : {}),
  };
}

function pythonSetup(cwd: string): ProjectSetup {
  const dependencyFiles: string[] = [];
  if (has(cwd, "pyproject.toml")) dependencyFiles.push("pyproject.toml");
  if (has(cwd, "uv.lock")) {
    dependencyFiles.push("uv.lock");
    return {
      provider: "python",
      packageManager: "uv",
      installCommand: "uv sync",
      dependencyFiles,
      source: "uv.lock",
    };
  }
  if (has(cwd, "poetry.lock")) {
    dependencyFiles.push("poetry.lock");
    return {
      provider: "python",
      packageManager: "poetry",
      installCommand: "poetry install",
      dependencyFiles,
      source: "poetry.lock",
    };
  }
  if (has(cwd, "Pipfile.lock")) dependencyFiles.push("Pipfile.lock");
  if (has(cwd, "Pipfile")) dependencyFiles.push("Pipfile");
  if (dependencyFiles.includes("Pipfile")) {
    return {
      provider: "python",
      packageManager: "pipenv",
      installCommand: dependencyFiles.includes("Pipfile.lock") ? "pipenv sync" : "pipenv install",
      dependencyFiles,
      source: dependencyFiles.includes("Pipfile.lock") ? "Pipfile.lock" : "Pipfile",
    };
  }
  if (has(cwd, "requirements.txt")) {
    dependencyFiles.push("requirements.txt");
    return {
      provider: "python",
      packageManager: "pip",
      installCommand: "python -m pip install -r requirements.txt",
      dependencyFiles,
      source: "requirements.txt",
    };
  }
  if (has(cwd, "pyproject.toml")) {
    return {
      provider: "python",
      packageManager: "pip",
      installCommand: "python -m pip install -e .",
      dependencyFiles,
      source: "pyproject.toml",
    };
  }
  throw new Error("python provider requires a dependency file");
}

function simpleSetup(
  provider: ProjectSetupProvider,
  packageManager: string,
  installCommand: string | undefined,
  dependencyFiles: string[],
  source: string,
): ProjectSetup {
  return { provider, packageManager, installCommand, dependencyFiles, source };
}

export function detectProjectSetup(cwd: string): ProjectSetup | null {
  if (has(cwd, "package.json")) return nodeSetup(cwd);
  if (
    has(cwd, "pyproject.toml") ||
    has(cwd, "uv.lock") ||
    has(cwd, "poetry.lock") ||
    has(cwd, "Pipfile") ||
    has(cwd, "requirements.txt")
  ) {
    return pythonSetup(cwd);
  }
  if (has(cwd, "go.mod")) {
    return simpleSetup(
      "go",
      "go",
      "go mod download",
      ["go.mod", ...(has(cwd, "go.sum") ? ["go.sum"] : [])],
      "go.mod",
    );
  }
  if (has(cwd, "Cargo.toml")) {
    return simpleSetup(
      "rust",
      "cargo",
      "cargo fetch",
      ["Cargo.toml", ...(has(cwd, "Cargo.lock") ? ["Cargo.lock"] : [])],
      "Cargo.toml",
    );
  }
  if (has(cwd, "pom.xml")) {
    return simpleSetup("java", "maven", "mvn dependency:go-offline", ["pom.xml"], "pom.xml");
  }
  if (has(cwd, "build.gradle") || has(cwd, "build.gradle.kts")) {
    const buildFile = has(cwd, "build.gradle") ? "build.gradle" : "build.gradle.kts";
    const command = has(cwd, "gradlew.bat")
      ? "gradlew.bat dependencies"
      : process.platform === "win32"
        ? "gradle dependencies"
        : "./gradlew dependencies";
    return simpleSetup("java", "gradle", command, [buildFile], buildFile);
  }
  if (has(cwd, "composer.json")) {
    return simpleSetup(
      "php",
      "composer",
      "composer install --no-interaction",
      ["composer.json", ...(has(cwd, "composer.lock") ? ["composer.lock"] : [])],
      "composer.json",
    );
  }
  if (has(cwd, "Gemfile")) {
    return simpleSetup(
      "ruby",
      "bundler",
      "bundle install",
      ["Gemfile", ...(has(cwd, "Gemfile.lock") ? ["Gemfile.lock"] : [])],
      "Gemfile",
    );
  }
  if (has(cwd, "deno.json") || has(cwd, "deno.jsonc") || has(cwd, "deno.lock")) {
    const dependencyFiles = [
      ...(has(cwd, "deno.json") ? ["deno.json"] : []),
      ...(has(cwd, "deno.jsonc") ? ["deno.jsonc"] : []),
      ...(has(cwd, "deno.lock") ? ["deno.lock"] : []),
    ];
    return simpleSetup("deno", "deno", undefined, dependencyFiles, dependencyFiles[0]!);
  }
  if (has(cwd, "vcpkg.json")) {
    return simpleSetup(
      "cpp",
      "vcpkg",
      "vcpkg install",
      ["vcpkg.json", ...(has(cwd, "vcpkg-configuration.json") ? ["vcpkg-configuration.json"] : [])],
      "vcpkg.json",
    );
  }
  if (has(cwd, "conanfile.py") || has(cwd, "conanfile.txt")) {
    const file = has(cwd, "conanfile.py") ? "conanfile.py" : "conanfile.txt";
    return simpleSetup("cpp", "conan", "conan install .", [file], file);
  }
  return null;
}
