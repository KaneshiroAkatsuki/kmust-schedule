CREATE TABLE IF NOT EXISTS institute_sessions (
  id TEXT PRIMARY KEY,
  browser_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS institute_session_browser ON institute_sessions(browser_id);
CREATE TABLE IF NOT EXISTS institute_login_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS institute_finance (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  document_json TEXT NOT NULL
);
