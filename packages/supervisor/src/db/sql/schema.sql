CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  icon TEXT,
  protocol TEXT NOT NULL,
  base_url TEXT,
  api_key TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  name TEXT,
  context_window INTEGER NOT NULL DEFAULT 128000,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (provider_id, model_id)
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  avatar TEXT,
  backend_type TEXT NOT NULL DEFAULT 'native',
  model_id INTEGER REFERENCES models(id) ON DELETE SET NULL,
  system_prompt TEXT,
  tools_preset TEXT NOT NULL DEFAULT 'coding',
  home_dir TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  external_config TEXT,
  permission_rules TEXT NOT NULL DEFAULT '{}',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  cwd TEXT NOT NULL UNIQUE,
  home_dir TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'initializing',
  thinking_level TEXT NOT NULL DEFAULT 'none',
  cwd TEXT NOT NULL DEFAULT '',
  leaf_id TEXT,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  spawn_type TEXT,
  created_by TEXT NOT NULL DEFAULT 'user',
  title TEXT,
  system_prompt TEXT,
  avatar TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 0,
  external_session_id TEXT,
  error_msg TEXT,
  stage TEXT,
  shadow_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);

CREATE TABLE IF NOT EXISTS timeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  status TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_type_entity
  ON timeline_events(type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_timeline_events_project
  ON timeline_events(project_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL UNIQUE,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_entry_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  is_old INTEGER NOT NULL DEFAULT 0,
  origin_msg TEXT,
  role TEXT,
  search_text TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, role);
CREATE INDEX IF NOT EXISTS idx_messages_search_text
  ON messages(search_text) WHERE search_text IS NOT NULL;

CREATE TABLE IF NOT EXISTS session_input_queue (
  id TEXT PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  level INTEGER NOT NULL,
  origin_msg TEXT,
  images TEXT,
  enqueued_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_input_queue_session
  ON session_input_queue(session_id, level DESC, enqueued_at ASC);

CREATE TABLE IF NOT EXISTS todo_task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  parent_id INTEGER REFERENCES todo_task(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  depends_on TEXT NOT NULL DEFAULT '[]',
  subagent_ids TEXT NOT NULL DEFAULT '[]',
  phase TEXT NOT NULL DEFAULT 'draft',
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todo_task_status ON todo_task(status);
CREATE INDEX IF NOT EXISTS idx_todo_task_parent ON todo_task(parent_id);
CREATE INDEX IF NOT EXISTS idx_todo_task_session ON todo_task(session_id);
CREATE INDEX IF NOT EXISTS idx_todo_task_project ON todo_task(project_id);

DROP TABLE IF EXISTS extensions;

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT,
  description TEXT,
  source_path TEXT,
  version TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(kind, slug)
);

CREATE INDEX IF NOT EXISTS idx_resources_kind ON resources(kind);

CREATE TABLE IF NOT EXISTS agent_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(agent_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_resources_agent ON agent_resources(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_resources_resource ON agent_resources(resource_id);

CREATE TABLE IF NOT EXISTS push_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  push_token TEXT NOT NULL,
  manufacturer_push_token TEXT,
  manufacturer TEXT,
  model TEXT,
  app_version TEXT,
  last_seen INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_devices_platform ON push_devices(platform);
CREATE INDEX IF NOT EXISTS idx_push_devices_last_seen ON push_devices(last_seen);
