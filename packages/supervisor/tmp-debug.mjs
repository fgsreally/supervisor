import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";

const dbPath = join(homedir(), ".pi", "supervisor.db");
console.log("DB:", dbPath);

const db = new Database(dbPath);
const sessions = db.prepare("SELECT id, agent_id, meta FROM sessions").all();
console.log("count:", sessions.length);

for (const s of sessions) {
  console.log("---");
  console.log("id:", s.id);
  console.log("agent_id:", s.agent_id);
  console.log("meta raw (first 300):", JSON.stringify(s.meta).slice(0, 300));
  console.log("meta length:", s.meta.length);
}

const rows = db.prepare("SELECT id, meta FROM sessions WHERE agent_id = 'pi-assistant'").all();
console.log("\npi-assistant sessions:", rows.length);
for (const r of rows) {
  console.log("id:", r.id, "meta starts with:", r.meta.substring(0, 50));
  try {
    const p = JSON.parse(r.meta);
    console.log("  parse OK, builtin:", p.builtin);
  } catch (e) {
    console.log("  PARSE FAIL:", e.message);
  }
}

db.close();
