CREATE TABLE IF NOT EXISTS session_cleanup_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  project_id INTEGER,
  step TEXT NOT NULL,
  error TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_session_cleanup_failures_status_created
  ON session_cleanup_failures(status, created_at);
CREATE INDEX IF NOT EXISTS idx_session_cleanup_failures_session
  ON session_cleanup_failures(session_id, created_at);
