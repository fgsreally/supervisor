/**
 * Clean setup: minimax-cn only → one agent → one skill → one session → readme.md
 *
 * Skill lives under agent home (~/.pi/supervisor/agents/{id}/skills/), NOT workspace.
 */
import Database from "better-sqlite3";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, unlinkSync, rmSync, mkdirSync, writeFileSync, cpSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_FIXTURE = join(__dirname, "fixtures", "neko-doc-writer");

const API = "http://127.0.0.1:3030";
const WORKSPACE = "D:/github/pi-workspace";
const README = `${WORKSPACE}/readme.md`;
const AGENT_ID = "pi-agent";
const PROVIDER_ID = "minimax-cn";
const AGENT_HOME = join(homedir(), ".pi", "supervisor", "agents", AGENT_ID);
const AGENT_SKILL_DIR = join(AGENT_HOME, "skills", "neko-doc-writer");

function ensureAgentSkill() {
  mkdirSync(join(AGENT_HOME, "skills"), { recursive: true });
  rmSync(AGENT_SKILL_DIR, { recursive: true, force: true });
  cpSync(SKILL_FIXTURE, AGENT_SKILL_DIR, { recursive: true });
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function cleanup() {
  const sessions = await api("GET", "/sessions");
  for (const s of sessions) {
    try {
      await api("DELETE", `/sessions/${s.id}`);
    } catch (e) {
      console.warn("delete session", s.id, e.message);
    }
  }

  for (const id of ["webui-e2e-agent", "coding-assistant"]) {
    try {
      await api("DELETE", `/agents/${id}`);
    } catch {
      // ignore
    }
  }

  for (const id of ["moonshotai", "moonshotai-cn"]) {
    try {
      await api("DELETE", `/providers/${id}`);
    } catch {
      // ignore
    }
  }

  // Remove legacy workspace-local skills (skills belong in agent home)
  for (const dir of ["workspace-demo", "readme-writer", "neko-doc-writer"]) {
    try {
      rmSync(`${WORKSPACE}/.pi/supervisor/skills/${dir}`, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  try {
    unlinkSync(`${WORKSPACE}/hello-e2e.txt`);
  } catch {
    // ignore
  }
  try {
    unlinkSync(README);
  } catch {
    // ignore
  }
}

async function ensureAgent() {
  ensureAgentSkill();
  try {
    await api("GET", `/agents/${AGENT_ID}`);
    await api("PATCH", `/agents/${AGENT_ID}`, {
      name: "Pi Agent",
      description: "MiniMax coding agent",
      providerId: PROVIDER_ID,
      modelId: "MiniMax-M2.7",
      toolsPreset: "coding",
    });
  } catch {
    await api("POST", "/agents", {
      id: AGENT_ID,
      name: "Pi Agent",
      description: "MiniMax coding agent",
      providerId: PROVIDER_ID,
      modelId: "MiniMax-M2.7",
      toolsPreset: "coding",
      systemMd: "Use tools immediately when asked to create files. Follow loaded skills.",
    });
  }
  await api("PUT", `/agents/${AGENT_ID}/system-md`, {
    content: "Use tools immediately when asked to create files. Follow loaded skills.",
  });
}

async function promptSession(sessionId, message) {
  const res = await fetch(`${API}/sessions/${sessionId}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`prompt failed ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let error = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const part of buf.split("\n\n")) {
      if (!part.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(part.slice(6));
        if (payload.type === "error") error = payload.error;
      } catch {
        // partial chunk
      }
    }
    buf = buf.split("\n\n").pop() ?? "";
  }
  if (error) throw new Error(error);
}

function loadMinimaxKeyFromDb() {
  const db = new Database(join(homedir(), ".pi", "supervisor.db"));
  const row = db.prepare("SELECT api_key FROM providers WHERE id = ?").get(PROVIDER_ID);
  db.close();
  return row?.api_key ?? null;
}

async function main() {
  await api("GET", "/healthz");
  console.log("1. cleanup...");
  await cleanup();

  const providers = await api("GET", "/providers");
  const minimax = providers.find((p) => p.id === PROVIDER_ID);
  if (!minimax) throw new Error(`provider ${PROVIDER_ID} not found`);
  console.log("2. provider:", PROVIDER_ID, minimax.name);

  console.log("3. agent...");
  await ensureAgent();
  const agent = await api("GET", `/agents/${AGENT_ID}`);
  console.log("   agent:", agent.name, agent.providerId, agent.modelId);
  console.log("   home:", agent.homeDir);
  console.log("   skill:", AGENT_SKILL_DIR);

  console.log("4. session...");
  const session = await api("POST", "/sessions", {
    cwd: WORKSPACE,
    agentId: AGENT_ID,
    meta: { name: "Demo" },
  });
  console.log("   session:", session.id, session.meta?.name);

  console.log("5. prompt...");
  await promptSession(
    session.id,
    "请在工作目录创建 readme.md，简要介绍 pi-workspace 项目。文档正文使用猫娘语气，用 write 工具写入，不要提问。",
  );

  const content = readFileSync(README, "utf8").trim();
  if (!content) {
    throw new Error("readme.md is empty");
  }
  if (!content.includes("喵")) {
    throw new Error(`readme.md missing neko tone marker: ${JSON.stringify(content.slice(0, 200))}`);
  }
  console.log("OK readme.md (neko tone):", content.slice(0, 120).replace(/\n/g, " ") + "...");
  console.log("session id:", session.id);
}

const dbKey = loadMinimaxKeyFromDb();
if (dbKey && !process.env.MINIMAX_CN_API_KEY) {
  process.env.MINIMAX_CN_API_KEY = dbKey;
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
