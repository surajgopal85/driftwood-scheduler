CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY, json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY, json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policy (
  id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL
);
-- Rules are append-only. An edit inserts a new row with supersedes=<old id>
-- and closes the old row's effective_to. Never UPDATE a rule's content.
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  worker_id TEXT,
  supersedes TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rules_key ON rules(key, effective_to);
CREATE TABLE IF NOT EXISTS pto (
  id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY, start_date TEXT NOT NULL, days INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, date TEXT NOT NULL, shift_id TEXT NOT NULL,
  worker_id TEXT NOT NULL, json TEXT NOT NULL,
  FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS assignments_schedule ON assignments(schedule_id);
