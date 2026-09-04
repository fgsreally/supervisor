import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(root, "dev.log");
const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node scripts/tee-log.mjs <command>...");
  process.exit(1);
}

const out = createWriteStream(logPath, { flags: "w" });
out.write(`---- ${new Date().toISOString()} ${args.join(" ")}\n`);

function quote(arg) {
  if (!/[ \t"]/.test(arg)) return arg;
  return `"${arg.replaceAll('"', '\\"')}"`;
}

const pathSep = process.platform === "win32" ? ";" : ":";
const child = spawn(args.map(quote).join(" "), {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PATH: `${resolve(root, "node_modules/.bin")}${pathSep}${process.env.PATH ?? ""}`,
  },
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  windowsHide: true,
});

function tap(src, dest) {
  src.on("data", (chunk) => {
    dest.write(chunk);
    out.write(chunk);
  });
}
tap(child.stdout, process.stdout);
tap(child.stderr, process.stderr);

function shutdown() {
  if (!child.killed) child.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

child.on("exit", (code) => {
  out.end();
  process.exit(code ?? 1);
});
