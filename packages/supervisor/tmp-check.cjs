const Database = require("better-sqlite3");
const db = new Database(require("os").homedir() + "/.pi/supervisor.db");
const sessions = db.prepare("SELECT id, agent_id, meta FROM sessions").all();
console.log("count:", sessions.length);
for (const s of sessions) {
  console.log("id:", s.id, "agent_id:", s.agent_id);
  try { JSON.parse(s.meta); console.log("  => OK"); }
  catch(e) { console.log("  => FAIL:", e.message); }
}
db.close();
