CREATE TABLE IF NOT EXISTS schedule_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  courses_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weather_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at TEXT NOT NULL,
  weather_json TEXT NOT NULL
);

-- v2 stores courses and the recycle bin in one revisioned document.  The
-- original schedule_state table stays in place so existing deployments can be
-- migrated lazily without losing the live timetable.
CREATE TABLE IF NOT EXISTS schedule_document_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  document_json TEXT NOT NULL
);
