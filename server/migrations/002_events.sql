CREATE TABLE events (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL,
  all_day     INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  start_time  TEXT,
  end_time    TEXT,
  category    TEXT NOT NULL DEFAULT 'otro' CHECK (category IN ('reunion', 'fiscal', 'cobro', 'otro')),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_events_user_date ON events(user_id, date);
