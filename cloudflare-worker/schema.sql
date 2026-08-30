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
