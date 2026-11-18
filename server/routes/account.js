/**
 * Fase 13 (docs/13-correo-y-segundo-factor.md): confirmar y cambiar el correo, recuperar la contraseña
 * y la verificación en dos pasos (TOTP y códigos de respaldo).
 */
import { Validator, HttpError, validationError } from '../validation.js';
import { transaction } from '../db.js';
import { hashPassword, clearSessionCookie } from '../auth.js';
import { groupSecret, newTotpSecret, otpauthUri, verifyTotp } from '../totp.js';
import {
  accountTools,
  backupCodesLeft,
  disableTwoFactor,
  findEmailToken,
  invalidToken,
  issueEmailToken,
  logSecurityEvent,
  markTokenUsed,
  pendingEmailChange,
  replaceBackupCodes,
  requireVerifiedEmail,
  securityEvents,
  tooMany,
  TOKEN_ROUTE,
  WRONG_CODE,
} from '../account.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isUniqueError = (err) => /UNIQUE constraint failed/i.test(err?.message ?? '');
const emailTakenElsewhere = () =>
  new HttpError(409, 'EMAIL_TAKEN', 'Ese correo ya es el de otra cuenta de CuentaClara', { new_email: 'Ese correo ya es el de otra cuenta de CuentaClara' });

export function registerAccountRoutes(router, { db, limiters, mail, now, secureCookies, cookieName }) {
  const { reauth, notify, secondFactor, checkSecondFactorLimit } = accountTools({ db, limiters, mail, now });
  const ua = (req) => req.headers['user-agent'];
  const userRow = (id) => db.prepare('SELECT id, email, name, email_verified_at, totp_enabled_at FROM users WHERE id = ?').get(id);

  /** Límite de correos que pide una cuenta (reenviar la confirmación, cambiar de correo). */
  function takeMailQuota(user) {
    const key = `user:${user.id}`;
    const wait = limiters.mail.retryAfterMs(key);
    if (wait > 0) throw tooMany(wait, 'Ya te enviamos varios correos.');
    limiters.mail.hit(key);
  }

  // ---------------------------------------------------------------- estado

  router.get('/api/account/security', ({ user }) => {
    const row = db.prepare('SELECT totp_enabled_at FROM users WHERE id = ?').get(user.id);
    return {
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      pendingEmail: pendingEmailChange(db, user.id, now()),
      delivery: mail.mode(),
      twoFactor: {
        enabled: Boolean(row.totp_enabled_at),
        since: row.totp_enabled_at,
        backupCodesLeft: row.totp_enabled_at ? backupCodesLeft(db, user.id) : 0,
      },
      events: securityEvents(db, user.id),
    };
  });

  // ---------------------------------------------------------------- confirmar el correo

  router.post('/api/account/email/resend', ({ user }) => {
    if (user.email_verified_at) throw new HttpError(409, 'ALREADY_VERIFIED', 'Tu correo ya está confirmado');
    takeMailQuota(user);
    const token = issueEmailToken(db, { userId: user.id, purpose: 'verificar', email: user.email, now: now() });
    mail.send(user.email, 'verificar', { name: user.name, link: mail.link(TOKEN_ROUTE.verificar, token) });
    return { sent: true, delivery: mail.mode() };
  });

  /**
   * Abrir el enlace de un correo de confirmación (al registrarse o al cambiar de correo). No hace falta sesión:
   * el enlace se puede abrir en otro dispositivo. Abrirlo de nuevo después de usarlo responde «ya estaba confirmado».
   */
  router.post(
    '/api/auth/email/confirm',
    ({ body, req, ip }) => {
      const clock = now();
      const row = findEmailToken(db, body.token, ['verificar', 'cambiar_correo'], clock);
      if (!row) throw invalidToken();
      const user = userRow(row.user_id);
      if (!user) throw invalidToken();

      if (row.used_at) {
        if (user.email === row.email && user.email_verified_at) return { status: 'ya_confirmado', email: user.email };
        throw invalidToken();
      }

      if (row.purpose === 'verificar') {
        // El enlace era para un correo que la cuenta ya no tiene.
        if (row.email !== user.email) throw invalidToken();
        if (user.email_verified_at) {
          markTokenUsed(db, row, clock);
          return { status: 'ya_confirmado', email: user.email };
        }
        transaction(db, () => {
          if (!markTokenUsed(db, row, clock)) throw invalidToken();
          db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(clock.toISOString(), user.id);
          logSecurityEvent(db, user.id, 'correo_confirmado', { ip, userAgent: ua(req), detail: user.email, now: clock });
        });
        return { status: 'confirmado', email: user.email };
      }

      // Cambio de correo: el correo nuevo queda como el de la cuenta, ya confirmado.
      const oldEmail = user.email;
      const newEmail = row.email;
      if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(newEmail, user.id)) throw emailTakenElsewhere();
      try {
        transaction(db, () => {
          if (!markTokenUsed(db, row, clock)) throw invalidToken();
          db.prepare('INSERT INTO email_changes (user_id, old_email, new_email) VALUES (?, ?, ?)').run(user.id, oldEmail, newEmail);
          db.prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?').run(newEmail, clock.toISOString(), user.id);
          // Los demás enlaces (confirmar el correo anterior, recuperar la contraseña con él) dejan de servir.
          db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND used_at IS NULL').run(user.id);
          logSecurityEvent(db, user.id, 'correo_cambiado', { ip, userAgent: ua(req), detail: `${oldEmail} → ${newEmail}`, now: clock });
        });
      } catch (err) {
        if (isUniqueError(err)) throw emailTakenElsewhere();
        throw err;
      }
      // Aviso al correo anterior (si estaba confirmado), por si no fue la persona.
      notify(user, 'correo_cambiado', { req, ip, newEmail });
      return { status: 'cambiado', email: newEmail };
    },
    { auth: false },
  );

  // ---------------------------------------------------------------- cambiar el correo

  router.post('/api/account/email', async ({ body, user }) => {
    const v = new Validator(body);
    const raw = typeof body.new_email === 'string' ? body.new_email.trim().toLowerCase() : '';
    if (!raw) v.fail('new_email', 'Escribe tu correo nuevo');
    else if (raw.length > 254 || !EMAIL_RE.test(raw)) v.fail('new_email', 'Email no válido');
    else if (raw === user.email.toLowerCase()) v.fail('new_email', 'Es el mismo correo que ya tienes');
    if (typeof body.password !== 'string' || !body.password) v.fail('password', 'Escribe tu contraseña');
    v.check();
    await reauth(user, body.password, 'password', 'Escribe tu contraseña', 'La contraseña no es correcta');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(raw)) throw emailTakenElsewhere();
    takeMailQuota(user);
    const token = issueEmailToken(db, { userId: user.id, purpose: 'cambiar_correo', email: raw, now: now() });
    mail.send(raw, 'cambiar_correo', { name: user.name, link: mail.link(TOKEN_ROUTE.cambiar_correo, token) });
    return { pendingEmail: raw, delivery: mail.mode() };
  });

  // Cancelar un cambio de correo en curso.
  router.delete('/api/account/email/pending', ({ user }) => {
    db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'cambiar_correo' AND used_at IS NULL").run(user.id);
    return undefined;
  });

  // ---------------------------------------------------------------- recuperar la contraseña

  /**
   * «Olvidé mi contraseña». La respuesta es SIEMPRE la misma, exista o no la cuenta, y el correo se envía
   * en segundo plano: ni el texto ni el tiempo de respuesta revelan si un correo tiene cuenta.
   */
  router.post(
    '/api/auth/password/forgot',
    ({ body, ip }) => {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email) throw validationError({ email: 'Escribe tu correo' });
      if (email.length > 254 || !EMAIL_RE.test(email)) throw validationError({ email: 'Email no válido' });
      const wait = limiters.forgot.retryAfterMs(ip);
      if (wait > 0) throw tooMany(wait, 'Demasiados pedidos desde esta conexión.');
      limiters.forgot.hit(ip);
      // Varios pedidos para el mismo correo: no se envían más (no se llena la bandeja de nadie), sin decirlo.
      if (limiters.forgotEmail.take(email)) {
        const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);
        if (user) {
          const token = issueEmailToken(db, { userId: user.id, purpose: 'recuperar', email: user.email, now: now() });
          mail.send(user.email, 'recuperar', { name: user.name, link: mail.link(TOKEN_ROUTE.recuperar, token) });
        }
      }
      return { sent: true, delivery: mail.mode() };
    },
    { auth: false },
  );

  /** Antes de pedir la contraseña nueva: ¿el enlace sirve? Devuelve el correo de la cuenta. */
  router.post(
    '/api/auth/password/reset/check',
    ({ body }) => {
      const row = findEmailToken(db, body.token, ['recuperar'], now());
      if (!row || row.used_at) throw invalidToken();
      const user = userRow(row.user_id);
      if (!user || user.email !== row.email) throw invalidToken();
      return { email: user.email };
    },
    { auth: false },
  );

  router.post(
    '/api/auth/password/reset',
    async ({ body, req, res, ip }) => {
      const clock = now();
      const row = findEmailToken(db, body.token, ['recuperar'], clock);
      if (!row || row.used_at) throw invalidToken();
      const user = userRow(row.user_id);
      if (!user || user.email !== row.email) throw invalidToken();
      const v = new Validator(body);
      v.password('password', { email: user.email, name: user.name });
      v.check();
      const hash = await hashPassword(body.password);
      transaction(db, () => {
        if (!markTokenUsed(db, row, clock)) throw invalidToken();
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
        // Abrir el enlace demuestra que el correo es suyo.
        if (!user.email_verified_at) db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(clock.toISOString(), user.id);
        // Se cierran TODAS las sesiones (también la de este navegador) y los demás enlaces de recuperación.
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
        db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'recuperar' AND used_at IS NULL").run(user.id);
        logSecurityEvent(db, user.id, 'contrasena_restablecida', { ip, userAgent: ua(req), now: clock });
      });
      limiters.login.reset(`${user.email}|${ip}`);
      res.setHeader('Set-Cookie', clearSessionCookie(secureCookies || req.headers['x-forwarded-proto'] === 'https', cookieName));
      notify({ ...user, email_verified_at: user.email_verified_at ?? clock.toISOString() }, 'contrasena_cambiada', { req, ip });
      return undefined;
    },
    { auth: false },
  );

  // ---------------------------------------------------------------- verificación en dos pasos

  const isEnabled = (userId) => Boolean(db.prepare('SELECT totp_enabled_at FROM users WHERE id = ?').get(userId).totp_enabled_at);

  /** Contraseña + código (de la app o de respaldo), para desactivar o generar códigos nuevos. */
  async function passwordAndCode(user, body, req, ip) {
    const missing = {};
    if (typeof body.password !== 'string' || !body.password) missing.password = 'Escribe tu contraseña';
    if (typeof body.code !== 'string' || !body.code.trim()) missing.code = 'Escribe un código de tu app o de respaldo';
    if (Object.keys(missing).length) throw validationError(missing);
    checkSecondFactorLimit(user.id);
    await reauth(user, body.password, 'password', 'Escribe tu contraseña', 'La contraseña no es correcta');
    if (!secondFactor(user, body.code.slice(0, 30), { req, ip })) throw validationError({ code: WRONG_CODE });
  }

  // 1. Con la contraseña: clave nueva (aún sin activar) para escanear con la app.
  router.post('/api/account/2fa/setup', async ({ body, user }) => {
    requireVerifiedEmail(user, 'Confirma tu correo antes de activar la verificación en dos pasos: lo necesitas para recuperar tu cuenta.');
    if (isEnabled(user.id)) throw new HttpError(409, 'TWO_FACTOR_ON', 'La verificación en dos pasos ya está activada');
    await reauth(user, body.password, 'password', 'Escribe tu contraseña', 'La contraseña no es correcta');
    const secret = newTotpSecret();
    db.prepare('UPDATE users SET totp_secret = ?, totp_enabled_at = NULL, totp_last_step = 0 WHERE id = ?').run(secret, user.id);
    return { secret: groupSecret(secret), uri: otpauthUri(secret, user.email) };
  });

  // 2. Con el primer código de la app: se activa y se generan los códigos de respaldo (se muestran una sola vez).
  router.post('/api/account/2fa/enable', ({ body, user, req, ip }) => {
    requireVerifiedEmail(user, 'Confirma tu correo antes de activar la verificación en dos pasos.');
    const row = db.prepare('SELECT totp_secret, totp_enabled_at FROM users WHERE id = ?').get(user.id);
    if (row.totp_enabled_at) throw new HttpError(409, 'TWO_FACTOR_ON', 'La verificación en dos pasos ya está activada');
    if (!row.totp_secret) throw new HttpError(409, 'TWO_FACTOR_NO_SETUP', 'Empieza de nuevo: vuelve a escribir tu contraseña');
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) throw validationError({ code: 'Escribe el código de 6 dígitos de tu app' });
    checkSecondFactorLimit(user.id);
    const clock = now();
    const step = verifyTotp(row.totp_secret, code, clock.getTime(), 0);
    if (step === null) {
      limiters.twoFactor.hit(`user:${user.id}`);
      limiters.twoFactorDay.hit(`user:${user.id}`);
      throw validationError({ code: WRONG_CODE });
    }
    limiters.twoFactor.reset(`user:${user.id}`);
    const backupCodes = transaction(db, () => {
      db.prepare('UPDATE users SET totp_enabled_at = ?, totp_last_step = ? WHERE id = ?').run(clock.toISOString(), step, user.id);
      // Quien tuviera una sesión abierta en otro dispositivo tendrá que entrar de nuevo, ya con el código.
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, user.session_id);
      logSecurityEvent(db, user.id, '2fa_activado', { ip, userAgent: ua(req), now: clock });
      return replaceBackupCodes(db, user.id);
    });
    notify(user, '2fa_activado', { req, ip });
    return { backupCodes };
  });

  router.post('/api/account/2fa/disable', async ({ body, user, req, ip }) => {
    if (!isEnabled(user.id)) throw new HttpError(409, 'TWO_FACTOR_OFF', 'La verificación en dos pasos no está activada');
    await passwordAndCode(user, body, req, ip);
    transaction(db, () => {
      disableTwoFactor(db, user.id);
      logSecurityEvent(db, user.id, '2fa_desactivado', { ip, userAgent: ua(req), now: now() });
    });
    notify(user, '2fa_desactivado', { req, ip });
    return undefined;
  });

  router.post('/api/account/2fa/backup-codes', async ({ body, user, req, ip }) => {
    if (!isEnabled(user.id)) throw new HttpError(409, 'TWO_FACTOR_OFF', 'La verificación en dos pasos no está activada');
    await passwordAndCode(user, body, req, ip);
    const backupCodes = transaction(db, () => {
      logSecurityEvent(db, user.id, 'codigos_nuevos', { ip, userAgent: ua(req), now: now() });
      return replaceBackupCodes(db, user.id);
    });
    return { backupCodes };
  });
}
