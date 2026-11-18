-- Fase 12: documentos legales, registro de consentimientos y PQR (docs/12-legal-y-seguridad.md).
-- Solo añade tablas nuevas: no cambia ningún dato existente.

-- Texto exacto de cada versión publicada de cada documento legal, por su huella SHA-256.
CREATE TABLE legal_texts (
  sha256        TEXT PRIMARY KEY,
  doc           TEXT NOT NULL,
  version       TEXT NOT NULL,
  content       TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Registro de aceptaciones y revocaciones: quién, qué, cuándo y cómo.
-- Sin clave foránea a users: la prueba se conserva aunque la persona elimine su cuenta.
-- hash = SHA-256 de la fila + prev_hash (huella de la fila anterior): manipularla rompe la cadena.
CREATE TABLE consents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('terminos', 'privacidad', 'reembolsos', 'compartir_contador')),
  action      TEXT NOT NULL DEFAULT 'acepta' CHECK (action IN ('acepta', 'revoca')),
  version     TEXT NOT NULL,
  text_sha256 TEXT NOT NULL REFERENCES legal_texts(sha256),
  context     TEXT NOT NULL CHECK (context IN ('registro', 'actualizacion', 'pago', 'contador')),
  label       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL,
  user_agent  TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_consents_user ON consents(user_id, purpose);

-- Solo se pueden añadir filas: ni la app ni un error de programación pueden cambiar o borrar la prueba.
CREATE TRIGGER consents_no_update BEFORE UPDATE ON consents
BEGIN SELECT RAISE(ABORT, 'El registro de consentimientos no se puede modificar'); END;
CREATE TRIGGER consents_no_delete BEFORE DELETE ON consents
BEGIN SELECT RAISE(ABORT, 'El registro de consentimientos no se puede borrar'); END;
CREATE TRIGGER legal_texts_no_update BEFORE UPDATE ON legal_texts
BEGIN SELECT RAISE(ABORT, 'Los textos legales publicados no se pueden modificar'); END;
CREATE TRIGGER legal_texts_no_delete BEFORE DELETE ON legal_texts
BEGIN SELECT RAISE(ABORT, 'Los textos legales publicados no se pueden borrar'); END;

-- Peticiones, quejas y reclamos (art. 50 lit. g de la Ley 1480 de 2011, modificado por la Ley 2439 de 2024;
-- consultas y reclamos de datos personales, arts. 14 y 15 de la Ley 1581 de 2012).
-- Radicado = PQR-<año>-<id con 5 cifras>. Si la persona elimina su cuenta, la PQR se conserva (user_id pasa a NULL).
CREATE TABLE pqrs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email        TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('peticion', 'queja', 'reclamo', 'datos')),
  subject      TEXT NOT NULL,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'radicada' CHECK (status IN ('radicada', 'respondida')),
  response     TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT
);
CREATE INDEX idx_pqrs_user ON pqrs(user_id, created_at);
