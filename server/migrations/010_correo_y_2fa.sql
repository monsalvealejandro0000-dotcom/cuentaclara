-- Fase 13: confirmar el correo, recuperar la contraseña y verificación en dos pasos (docs/13-correo-y-segundo-factor.md).
-- Las cuentas que ya existían quedan con el correo SIN confirmar: verán el aviso «Confirma tu correo».

-- Cuándo se confirmó el correo actual (NULL = sin confirmar).
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
-- Verificación en dos pasos (TOTP, RFC 6238): clave secreta en base32. Con totp_enabled_at NULL está a medio
-- configurar (aún no se ha comprobado un código). totp_last_step: último intervalo de 30 s usado, para que un
-- mismo código no sirva dos veces.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;
ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0;

-- Enlaces enviados por correo. Solo se guarda la huella SHA-256 del código: con la base de datos no se pueden usar.
-- `email`: a qué correo se envió (en un cambio de correo, el nuevo). Un solo uso (used_at) y caducidad corta.
CREATE TABLE email_tokens (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL CHECK (purpose IN ('verificar', 'recuperar', 'cambiar_correo')),
  token_sha256 TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL,
  expires_at   INTEGER NOT NULL,              -- epoch en milisegundos
  used_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_email_tokens_user ON email_tokens(user_id, purpose);

-- Códigos de respaldo de la verificación en dos pasos: huella SHA-256 (con el id de la cuenta), un solo uso.
CREATE TABLE backup_codes (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_sha256 TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_backup_codes_user ON backup_codes(user_id);

-- Correos anteriores de cada cuenta: sus aceptaciones (consents, guardadas con el correo de ese momento)
-- siguen valiendo después de cambiar de correo. Se borran con la cuenta.
CREATE TABLE email_changes (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_email  TEXT NOT NULL,
  new_email  TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_email_changes_user ON email_changes(user_id);

-- Actividad de seguridad que la persona ve en Configuración. Se borra a los 12 meses y con la cuenta.
CREATE TABLE security_events (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN (
               'correo_confirmado', 'correo_cambiado', 'contrasena_cambiada', 'contrasena_restablecida',
               '2fa_activado', '2fa_desactivado', '2fa_quitado_admin', 'codigos_nuevos', 'codigo_respaldo_usado',
               '2fa_bloqueado', 'sesiones_cerradas_admin')),
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_security_events_user ON security_events(user_id, created_at);
