import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";

const dbPath = join(homedir(), ".pi", "supervisor.db");
console.log("DB path:", dbPath);

const db = new Database(dbPath, { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:", tables);

for (const { name } of tables) {
  if (name === "sqlite_sequence") continue;
  const count = db.prepare(`SELECT COUNT(*) as c FROM [${name}]`).get();
  console.log(`${name}: ${count.c} rows`);
  if (name === "sessions") {
    const rows = db.prepare("SELECT id, agent_id, meta FROM sessions").all();
    console.log("Sessions:", JSON.stringify(rows, null, 2));
  }
}
db.close();
