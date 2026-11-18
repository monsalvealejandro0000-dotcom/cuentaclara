-- Fase 10: plan Contador (docs/10-plan-contador.md). Solo añade una columna y tablas nuevas.

-- Nivel del plan de pago: 'pro' (lo de siempre) o 'contador' (incluye todo Pro y el panel de clientes).
ALTER TABLE plans ADD COLUMN tier TEXT NOT NULL DEFAULT 'pro' CHECK (tier IN ('pro', 'contador'));

-- Vínculo cliente → contador. Uno por cliente. El contador queda fijado al aceptar (accountant_user_id).
-- Si se elimina la cuenta del cliente o la del contador, el vínculo se borra.
CREATE TABLE accountant_links (
  id                 INTEGER PRIMARY KEY,
  client_user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  accountant_email   TEXT NOT NULL COLLATE NOCASE,
  accountant_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'activo', 'rechazado')),
  invited_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  accepted_at        TEXT,
  last_access_at     TEXT,
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_accountant_links_email ON accountant_links(accountant_email);
CREATE INDEX idx_accountant_links_accountant ON accountant_links(accountant_user_id);

-- Invitaciones enviadas por día (límite de 10 por cuenta y día).
CREATE TABLE accountant_invites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_on TEXT NOT NULL
);
CREATE INDEX idx_accountant_invites_user_day ON accountant_invites(user_id, invited_on);
