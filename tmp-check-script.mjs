import { readFileSync } from "node:fs";
const line = readFileSync("D:/myproject/supervisor-workspace/supervisor/package.json", "utf8").split(
  "\n",
)[14];
const m = line.match(/ui run ([^\\"]+)/);
console.log("matched:", JSON.stringify(m?.[1]));
console.log("codes:", [...(m?.[1] ?? "")].map((c) => c.charCodeAt(0)));
