CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,               -- SHA-256 del token (el token solo vive en la cookie)
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,               -- epoch en milisegundos
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE settings (
  user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name     TEXT NOT NULL DEFAULT '',
  nif               TEXT NOT NULL DEFAULT '',
  address           TEXT NOT NULL DEFAULT '',
  default_vat_rate  REAL NOT NULL DEFAULT 21 CHECK (default_vat_rate BETWEEN 0 AND 100),
  default_irpf_rate REAL NOT NULL DEFAULT 15 CHECK (default_irpf_rate BETWEEN 0 AND 100),
  irpf_reserve_rate REAL NOT NULL DEFAULT 20 CHECK (irpf_reserve_rate BETWEEN 0 AND 100),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE invoices (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year           INTEGER NOT NULL,
  seq            INTEGER NOT NULL,
  number         TEXT NOT NULL,
  client_name    TEXT NOT NULL,
  client_nif     TEXT NOT NULL DEFAULT '',
  client_address TEXT NOT NULL DEFAULT '',
  issue_date     TEXT NOT NULL,
  due_date       TEXT,
  concept        TEXT NOT NULL,
  base_cents     INTEGER NOT NULL CHECK (base_cents > 0),
  vat_rate       REAL NOT NULL CHECK (vat_rate BETWEEN 0 AND 100),
  irpf_rate      REAL NOT NULL CHECK (irpf_rate BETWEEN 0 AND 100),
  status         TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'cobrada')),
  paid_date      TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, year, seq)
);
CREATE INDEX idx_invoices_user_year ON invoices(user_id, year);

CREATE TABLE movements (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('ingreso', 'gasto')),
  date        TEXT NOT NULL,
  concept     TEXT NOT NULL,
  category    TEXT NOT NULL,
  base_cents  INTEGER NOT NULL CHECK (base_cents > 0),
  vat_rate    REAL NOT NULL CHECK (vat_rate BETWEEN 0 AND 100),
  irpf_rate   REAL NOT NULL DEFAULT 0 CHECK (irpf_rate BETWEEN 0 AND 100),
  deductible  INTEGER NOT NULL DEFAULT 1 CHECK (deductible IN (0, 1)),
  notes       TEXT NOT NULL DEFAULT '',
  invoice_id  INTEGER UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_movements_user_date ON movements(user_id, date);
