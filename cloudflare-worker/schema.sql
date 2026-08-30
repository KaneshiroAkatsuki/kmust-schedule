CREATE TABLE IF NOT EXISTS schedule_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  courses_json TEXT NOT NULL
);
