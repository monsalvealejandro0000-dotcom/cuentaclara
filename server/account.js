/**
 * Seguridad de la cuenta (fase 13, docs/13-correo-y-segundo-factor.md): enlaces enviados por correo,
 * comprobación de la contraseña actual, segundo factor y actividad de seguridad.
 */
import crypto from 'node:crypto';
import { HttpError, validationError } from './validation.js';
import { verifyPassword } from './auth.js';
import { backupCodeHash, newBackupCodes, normalizeBackupCode, verifyTotp } from './totp.js';
import { browserName, whenText } from './mail.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Lo que la interfaz sabe de la cuenta. */
export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  emailVerified: Boolean(u.email_verified_at),
  twoFactor: Boolean(u.totp_enabled_at),
});

export const tooMany = (wait, message) =>
  new HttpError(429, 'TOO_MANY_ATTEMPTS', `${message} Vuelve a intentarlo en ${Math.ceil(wait / 60000)} min.`, undefined, {
    'Retry-After': String(Math.ceil(wait / 1000)),
  });

/** 403 si el correo de la cuenta no está confirmado (decisión 2 de la fase 13). */
export function requireVerifiedEmail(user, message) {
  if (!user.email_verified_at) throw new HttpError(403, 'EMAIL_UNVERIFIED', message);
}

// ---------------------------------------------------------------- enlaces por correo

/** Cuánto dura cada enlace. */
export const TOKEN_TTL_MS = {
  verificar: 24 * 60 * 60 * 1000,
  recuperar: 30 * 60 * 1000,
  cambiar_correo: 24 * 60 * 60 * 1000,
};

/** Ruta de la interfaz que abre cada enlace. */
export const TOKEN_ROUTE = { verificar: '/confirmar-correo', recuperar: '/restablecer', cambiar_correo: '/confirmar-correo' };

export const invalidToken = () =>
  new HttpError(400, 'TOKEN_INVALID', 'Este enlace ya no sirve: venció, ya se usó o está incompleto. Pide uno nuevo.');

/**
 * Crea un enlace de un solo uso. Devuelve el código (va en el correo); en la base de datos solo queda su huella.
 * Pedir uno nuevo anula los anteriores del mismo tipo que no se hayan usado.
 */
export function issueEmailToken(db, { userId, purpose, email, now }) {
  const ms = now.getTime();
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM email_tokens WHERE expires_at <= ?').run(ms);
  db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL').run(userId, purpose);
  db.prepare('INSERT INTO email_tokens (user_id, purpose, token_sha256, email, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    purpose,
    sha256(token),
    String(email).toLowerCase(),
    ms + TOKEN_TTL_MS[purpose],
  );
  return token;
}

/** Enlace vigente (usado o no) con uno de esos propósitos, o null. */
export function findEmailToken(db, token, purposes, now) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = db.prepare('SELECT * FROM email_tokens WHERE token_sha256 = ?').get(sha256(token));
  if (!row || !purposes.includes(row.purpose) || row.expires_at <= now.getTime()) return null;
  return row;
}

/** Marca el enlace como usado. false si otra petición lo usó justo antes. */
export const markTokenUsed = (db, row, now) =>
  db.prepare('UPDATE email_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now.toISOString(), row.id).changes === 1;

/** Correo nuevo pendiente de confirmar (cambio de correo en curso), o null. */
export function pendingEmailChange(db, userId, now) {
  return (
    db
      .prepare("SELECT email FROM email_tokens WHERE user_id = ? AND purpose = 'cambiar_correo' AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1")
      .get(userId, now.getTime())?.email ?? null
  );
}

// ---------------------------------------------------------------- actividad de seguridad

const EVENT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export const EVENT_LABELS = {
  correo_confirmado: 'Correo confirmado',
  correo_cambiado: 'Correo cambiado',
  contrasena_cambiada: 'Contraseña cambiada',
  contrasena_restablecida: 'Contraseña restablecida con el enlace del correo',
  '2fa_activado': 'Verificación en dos pasos activada',
  '2fa_desactivado': 'Verificación en dos pasos desactivada',
  '2fa_quitado_admin': 'Verificación en dos pasos quitada por el administrador, a tu solicitud',
  codigos_nuevos: 'Códigos de respaldo nuevos',
  codigo_respaldo_usado: 'Entrada con un código de respaldo',
  '2fa_bloqueado': '5 códigos incorrectos después de escribir bien la contraseña',
  sesiones_cerradas_admin: 'Sesiones cerradas por el administrador',
};

/** Anota un cambio de seguridad. Borra de paso los de hace más de 12 meses (de todas las cuentas). */
export function logSecurityEvent(db, userId, type, { ip = '', userAgent = '', detail = '', now = new Date() } = {}) {
  db.prepare('DELETE FROM security_events WHERE created_at < ?').run(new Date(now.getTime() - EVENT_RETENTION_MS).toISOString());
  db.prepare('INSERT INTO security_events (user_id, type, detail, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    userId,
    type,
    String(detail).slice(0, 300),
    String(ip || '').slice(0, 64),
    String(userAgent || '').slice(0, 300),
    now.toISOString(),
  );
}

export function securityEvents(db, userId, limit = 50) {
  return db
    .prepare('SELECT id, type, detail, ip, user_agent, created_at FROM security_events WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit)
    .map((r) => ({ id: r.id, type: r.type, label: EVENT_LABELS[r.type] ?? r.type, detail: r.detail, ip: r.ip, userAgent: r.user_agent, at: r.created_at }));
}

// ---------------------------------------------------------------- segundo factor

export const backupCodesLeft = (db, userId) => db.prepare('SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ? AND used_at IS NULL').get(userId).n;

/** Genera 10 códigos de respaldo nuevos (los anteriores dejan de servir). Devuelve los códigos en claro: se muestran una sola vez. */
export function replaceBackupCodes(db, userId) {
  const codes = newBackupCodes();
  db.prepare('DELETE FROM backup_codes WHERE user_id = ?').run(userId);
  const insert = db.prepare('INSERT INTO backup_codes (user_id, code_sha256) VALUES (?, ?)');
  for (const c of codes) insert.run(userId, backupCodeHash(userId, normalizeBackupCode(c)));
  return codes;
}

/** Quita la verificación en dos pasos: clave y códigos de respaldo. */
export function disableTwoFactor(db, userId) {
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = 0 WHERE id = ?').run(userId);
  db.prepare('DELETE FROM backup_codes WHERE user_id = ?').run(userId);
}

/**
 * Comprueba un código de la app (6 dígitos) o de respaldo y lo gasta (ninguno sirve dos veces).
 * Devuelve { kind: 'totp' } o { kind: 'backup', left } si es válido; null si no.
 */
export function consumeSecondFactor(db, userId, code, ms) {
  const row = db.prepare('SELECT totp_secret, totp_last_step FROM users WHERE id = ? AND totp_enabled_at IS NOT NULL').get(userId);
  if (!row) return null;
  const clean = String(code ?? '').replace(/\s/g, '');
  if (/^\d{6}$/.test(clean)) {
    const step = verifyTotp(row.totp_secret, clean, ms, row.totp_last_step);
    if (step === null) return null;
    const r = db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?').run(step, userId, step);
    return r.changes ? { kind: 'totp' } : null;
  }
  const normalized = normalizeBackupCode(code);
  if (!normalized) return null;
  const r = db
    .prepare('UPDATE backup_codes SET used_at = ? WHERE user_id = ? AND code_sha256 = ? AND used_at IS NULL')
    .run(new Date(ms).toISOString(), userId, backupCodeHash(userId, normalized));
  return r.changes ? { kind: 'backup', left: backupCodesLeft(db, userId) } : null;
}

/**
 * Herramientas compartidas por las rutas de cuenta e inicio de sesión.
 * - reauth: contraseña actual, con límite de fallos por cuenta (cambiar contraseña o correo, eliminar la cuenta, 2FA).
 * - secondFactor: código de la app o de respaldo, con límites por cuenta; al bloquearse avisa por correo.
 * - notify: aviso de seguridad por correo, solo si el correo está confirmado.
 */
export function accountTools({ db, limiters, mail, now }) {
  async function reauth(user, password, field, emptyMessage, wrongMessage) {
    if (typeof password !== 'string' || !password) throw validationError({ [field]: emptyMessage });
    const key = `user:${user.id}`;
    const wait = limiters.reauth.retryAfterMs(key);
    if (wait > 0) throw tooMany(wait, 'Demasiados intentos con una contraseña incorrecta.');
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!(await verifyPassword(password.slice(0, 200), row.password_hash))) {
      limiters.reauth.hit(key);
      throw validationError({ [field]: wrongMessage });
    }
    limiters.reauth.reset(key);
  }

  /** Aviso de seguridad. `user` necesita email, name y email_verified_at. */
  function notify(user, kind, { req, ip, ...data } = {}) {
    if (!user.email_verified_at) return;
    mail.send(user.email, kind, { name: user.name, when: whenText(now()), browser: browserName(req?.headers['user-agent']), ip: ip ?? '', ...data });
  }

  /** Lanza 429 si la cuenta está bloqueada por códigos incorrectos. */
  function checkSecondFactorLimit(userId) {
    const key = `user:${userId}`;
    const wait = Math.max(limiters.twoFactor.retryAfterMs(key), limiters.twoFactorDay.retryAfterMs(key));
    if (wait > 0) throw tooMany(wait, 'Demasiados códigos incorrectos.');
  }

  /** Comprueba y gasta un código. null si es incorrecto (y cuenta el fallo). */
  function secondFactor(user, code, { req, ip }) {
    checkSecondFactorLimit(user.id);
    const key = `user:${user.id}`;
    const result = consumeSecondFactor(db, user.id, code, now().getTime());
    if (result) {
      limiters.twoFactor.reset(key);
      return result;
    }
    limiters.twoFactor.hit(key);
    limiters.twoFactorDay.hit(key);
    // Justo se bloqueó: alguien sabe la contraseña y está probando códigos. Se avisa a la persona.
    if (limiters.twoFactor.retryAfterMs(key) > 0) {
      logSecurityEvent(db, user.id, '2fa_bloqueado', { ip, userAgent: req?.headers['user-agent'], now: now() });
      notify(user, '2fa_bloqueado', { req, ip });
    }
    return null;
  }

  return { reauth, notify, secondFactor, checkSecondFactorLimit };
}

/** Mensaje del campo «código» cuando no es válido. */
export const WRONG_CODE = 'Código incorrecto. Si es el que ves en tu app, revisa que la hora de tu celular sea automática.';
