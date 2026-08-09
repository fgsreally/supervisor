CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  parent_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  output TEXT NOT NULL DEFAULT '',
  progress TEXT,
  result TEXT,
  error TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jobs_session_created
  ON jobs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
