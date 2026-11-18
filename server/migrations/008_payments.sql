-- Fase 11: cobro manual de los planes (docs/11-cobro-manual.md).
-- No cambia ningún dato existente: añade el origen «pago» al plan y dos tablas nuevas.

-- 1) Nuevo origen del plan: 'pago'. SQLite no permite cambiar un CHECK, así que la tabla se rehace
--    copiando todas sus filas tal cual.
CREATE TABLE plans_new (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pro_source  TEXT CHECK (pro_source IN ('prueba', 'administrador', 'pago')),
  pro_until   TEXT,
  trial_until TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  tier        TEXT NOT NULL DEFAULT 'pro' CHECK (tier IN ('pro', 'contador'))
);
INSERT INTO plans_new (user_id, pro_source, pro_until, trial_until, updated_at, tier)
  SELECT user_id, pro_source, pro_until, trial_until, updated_at, tier FROM plans;
DROP TABLE plans;
ALTER TABLE plans_new RENAME TO plans;

-- 2) Referencia de pago fija de cada cuenta (CC-XXXXXX), la que el cliente escribe en la descripción del pago.
CREATE TABLE payment_refs (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE
);

-- 3) Avisos de pago. El valor esperado lo calcula el servidor; el plan solo lo activa el administrador.
CREATE TABLE payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference      TEXT NOT NULL,
  tier           TEXT NOT NULL CHECK (tier IN ('pro', 'contador')),
  months         INTEGER NOT NULL CHECK (months IN (1, 3, 6, 12)),
  expected_cents INTEGER NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  method         TEXT NOT NULL,
  paid_on        TEXT NOT NULL,
  receipt        TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobado', 'rechazado', 'cancelado')),
  reason         TEXT NOT NULL DEFAULT '',
  plan_until     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at    TEXT
);
CREATE INDEX idx_payments_user ON payments(user_id, created_at);
-- Un solo aviso pendiente por cuenta.
CREATE UNIQUE INDEX idx_payments_one_pending ON payments(user_id) WHERE status = 'pendiente';
