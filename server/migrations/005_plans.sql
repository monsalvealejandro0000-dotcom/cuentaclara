-- Fase 9: planes Gratis y Pro, y avisos de declaración (docs/09-planes.md).
-- Solo añade tablas nuevas: no cambia ningún dato existente. Sin fila en `plans`, la cuenta es Gratis.

-- Pro activo si pro_source no es NULL y (pro_until es NULL o pro_until >= hoy).
-- trial_until: último día de la prueba gratis; si no es NULL, la prueba ya se usó.
CREATE TABLE plans (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pro_source  TEXT CHECK (pro_source IN ('prueba', 'administrador')),
  pro_until   TEXT,
  trial_until TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Qué avisos quiere ver cada usuario (por defecto, los dos).
CREATE TABLE reminder_settings (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vat        INTEGER NOT NULL DEFAULT 1 CHECK (vat IN (0, 1)),
  renta      INTEGER NOT NULL DEFAULT 1 CHECK (renta IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Estado de cada declaración: presentada y/o día exacto anotado como evento del calendario.
-- decl_key: 'iva-2026-cuatrimestral-3' o 'renta-2026'.
CREATE TABLE reminder_states (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decl_key   TEXT NOT NULL,
  filed_on   TEXT,
  event_id   INTEGER REFERENCES events(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, decl_key)
);
