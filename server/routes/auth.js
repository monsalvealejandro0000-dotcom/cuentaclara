import crypto from 'node:crypto';
import { Validator, HttpError, validationError } from '../validation.js';
import { transaction } from '../db.js';
import { reply } from '../router.js';
import { createSettings } from './settings.js';
import { appendConsents, accountConsentEntries, checkVersions, pendingConsents, REQUIRED_DOCS } from '../legal.js';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  burnVerification,
  createSession,
  deleteSessionByToken,
  purgeExpiredSessions,
  sessionCookie,
  clearSessionCookie,
} from '../auth.js';
import { accountTools, issueEmailToken, logSecurityEvent, publicUser, tooMany, TOKEN_ROUTE, WRONG_CODE } from '../account.js';

const isUniqueError = (err) => /UNIQUE constraint failed/i.test(err?.message ?? '');
const emailTaken = () =>
  new HttpError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con este email', { email: 'Ya existe una cuenta con este email' });

/** El paso del código (verificación en dos pasos) dura 5 minutos y admite 5 intentos; luego hay que volver a escribir la contraseña. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_ATTEMPTS = 5;
const challengeExpired = (message = 'La verificación caducó. Vuelve a escribir tu contraseña.') =>
  new HttpError(401, 'TWO_FACTOR_EXPIRED', message);

const USER_COLUMNS = 'id, email, name, password_hash, email_verified_at, totp_enabled_at';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function registerAuthRoutes(router, { db, limiters, secureCookies, cookieName, legal, now, logger, mail, avisos }) {
  const secure = (req) => secureCookies || req.headers['x-forwarded-proto'] === 'https';
  const setSession = (req, res, userId) => {
    const { token } = createSession(db, userId);
    res.setHeader('Set-Cookie', sessionCookie(token, secure(req), cookieName));
  };
  const { reauth, notify, secondFactor } = accountTools({ db, limiters, mail, now });

  /**
   * Pasos de inicio de sesión a medio camino (contraseña correcta, falta el código). Viven en memoria: el
   * código del paso va en la respuesta (no en una cookie) y la interfaz lo guarda solo mientras pide el código.
   */
  const challenges = new Map();
  const pruneChallenges = (ms) => {
    for (const [k, v] of challenges) if (v.expires <= ms) challenges.delete(k);
  };

  router.post(
    '/api/auth/register',
    async ({ body, req, res, ip }) => {
      const v = new Validator(body);
      const name = v.string('name', { required: true, max: 100 });
      const email = v.email('email');
      v.password('password', { email, name });
      // Dos casillas separadas, sin marcar por defecto: términos y autorización de datos (Ley 1581 de 2012).
      if (body.accept_terms !== true) v.fail('accept_terms', 'Para crear tu cuenta debes aceptar los Términos y condiciones');
      if (body.accept_privacy !== true) v.fail('accept_privacy', 'Para crear tu cuenta debes autorizar el tratamiento de tus datos');
      const data = v.check();
      checkVersions(legal, body.versions, REQUIRED_DOCS);

      // Límite por IP: frena la creación masiva de cuentas y que se use el registro para averiguar qué correos existen.
      const wait = limiters.register.retryAfterMs(ip);
      if (wait > 0) {
        logger.warn?.(`[seguridad] registro bloqueado por límite para la IP ${ip}`);
        throw tooMany(wait, 'Demasiados registros desde esta conexión.');
      }
      limiters.register.hit(ip);

      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) throw emailTaken();
      const passwordHash = await hashPassword(data.password);
      let user;
      let token;
      try {
        user = transaction(db, () => {
          const r = db
            .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
            .run(data.email, data.name, passwordHash);
          const id = Number(r.lastInsertRowid);
          createSettings(db, id);
          // La cuenta y la prueba de su consentimiento se guardan juntas: si una falla, no queda ninguna.
          appendConsents(db, legal, accountConsentEntries(), {
            userId: id,
            email: data.email,
            ip,
            userAgent: req.headers['user-agent'],
            context: 'registro',
            now: now(),
          });
          token = issueEmailToken(db, { userId: id, purpose: 'verificar', email: data.email, now: now() });
          return { id, email: data.email, name: data.name, email_verified_at: null, totp_enabled_at: null };
        });
      } catch (err) {
        if (isUniqueError(err)) throw emailTaken();
        throw err;
      }
      // Fase 13: enlace para confirmar el correo. La cuenta se puede usar desde ya (con el aviso «Confirma tu correo»).
      mail.send(user.email, 'verificar', { name: user.name, link: mail.link(TOKEN_ROUTE.verificar, token) });
      setSession(req, res, user.id);
      // Aviso al administrador (server/avisos.js): solo el número de la cuenta.
      avisos.cuentaNueva(user);
      return reply(201, { user: publicUser(user), consent: { pending: [] }, delivery: mail.mode() });
    },
    { auth: false },
  );

  router.post(
    '/api/auth/login',
    async ({ body, req, res, ip }) => {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const missing = {};
      if (!email) missing.email = 'Este campo es obligatorio';
      if (!password) missing.password = 'Este campo es obligatorio';
      if (Object.keys(missing).length) throw validationError(missing);
      if (email.length > 254 || password.length > 200) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos');

      // Dos límites: por correo + IP (5 fallos) y por IP sumando todos los correos (30 fallos).
      const key = `${email}|${ip}`;
      const wait = Math.max(limiters.login.retryAfterMs(key), limiters.loginIp.retryAfterMs(ip));
      if (wait > 0) throw tooMany(wait, 'Demasiados intentos fallidos.');

      const row = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).get(email);
      const ok = row ? await verifyPassword(password, row.password_hash) : await burnVerification(password);
      if (!ok) {
        limiters.login.hit(key);
        limiters.loginIp.hit(ip);
        if (limiters.loginIp.retryAfterMs(ip) > 0) logger.warn?.(`[seguridad] inicios de sesión bloqueados para la IP ${ip}`);
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos');
      }
      limiters.login.reset(key);
      // Contraseña guardada con un cifrado más débil que el actual: se vuelve a cifrar ahora que la tenemos.
      if (needsRehash(row.password_hash)) {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), row.id);
      }
      // Fase 13: con la verificación en dos pasos activa, todavía no hay sesión: falta el código.
      if (row.totp_enabled_at) {
        const ms = now().getTime();
        pruneChallenges(ms);
        const ticket = crypto.randomBytes(32).toString('base64url');
        challenges.set(sha256(ticket), { userId: row.id, expires: ms + CHALLENGE_TTL_MS, attempts: 0 });
        return { twoFactor: { ticket, expiresInSec: CHALLENGE_TTL_MS / 1000 } };
      }
      purgeExpiredSessions(db);
      setSession(req, res, row.id);
      avisos.entrada(row);
      return { user: publicUser(row), consent: { pending: pendingConsents(db, legal, row) } };
    },
    { auth: false },
  );

  // Segundo paso del inicio de sesión: código de la app de autenticación o código de respaldo.
  router.post(
    '/api/auth/login/2fa',
    ({ body, req, res, ip }) => {
      const ticketKey = typeof body.ticket === 'string' && body.ticket.length <= 64 ? sha256(body.ticket) : null;
      const entry = ticketKey ? challenges.get(ticketKey) : null;
      const ms = now().getTime();
      if (!entry || entry.expires <= ms) {
        if (ticketKey) challenges.delete(ticketKey);
        throw challengeExpired();
      }
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!code) throw validationError({ code: 'Escribe el código' });
      if (code.length > 30) throw validationError({ code: WRONG_CODE });
      const user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(entry.userId);
      if (!user?.totp_enabled_at) {
        challenges.delete(ticketKey);
        throw challengeExpired();
      }
      const result = secondFactor(user, code, { req, ip });
      if (!result) {
        entry.attempts++;
        if (entry.attempts >= CHALLENGE_ATTEMPTS) {
          challenges.delete(ticketKey);
          throw challengeExpired('Demasiados códigos incorrectos. Vuelve a escribir tu contraseña.');
        }
        throw validationError({ code: WRONG_CODE });
      }
      challenges.delete(ticketKey);
      if (result.kind === 'backup') {
        logSecurityEvent(db, user.id, 'codigo_respaldo_usado', { ip, userAgent: req.headers['user-agent'], detail: `Quedan ${result.left}`, now: now() });
        notify(user, 'codigo_respaldo', { req, ip, left: result.left });
      }
      purgeExpiredSessions(db);
      setSession(req, res, user.id);
      avisos.entrada(user);
      return {
        user: publicUser(user),
        consent: { pending: pendingConsents(db, legal, user) },
        ...(result.kind === 'backup' ? { backupCodesLeft: result.left } : {}),
      };
    },
    { auth: false },
  );

  router.post(
    '/api/auth/logout',
    ({ req, res, sessionToken }) => {
      deleteSessionByToken(db, sessionToken);
      res.setHeader('Set-Cookie', clearSessionCookie(secure(req), cookieName));
      return undefined;
    },
    { auth: false },
  );

  // La app lo pide al abrirse: con la sesión ya abierta, también cuenta como entrada (un aviso cada 3 horas).
  router.get(
    '/api/auth/me',
    ({ user }) => {
      avisos.entrada(user);
      return { user: publicUser(user), consent: { pending: pendingConsents(db, legal, user) } };
    },
    { consent: false },
  );

  router.put('/api/account/password', async ({ body, user, req, ip }) => {
    const v = new Validator(body);
    if (typeof body.current_password !== 'string' || !body.current_password) {
      v.fail('current_password', 'Este campo es obligatorio');
    }
    v.password('new_password', { email: user.email, name: user.name });
    v.check();
    await reauth(user, body.current_password, 'current_password', 'Este campo es obligatorio', 'La contraseña actual no es correcta');
    const hash = await hashPassword(body.new_password);
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
      // Cierra el resto de sesiones abiertas (otros dispositivos).
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, user.session_id);
      // Los enlaces de recuperación pendientes dejan de servir.
      db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'recuperar'").run(user.id);
      logSecurityEvent(db, user.id, 'contrasena_cambiada', { ip, userAgent: req.headers['user-agent'], now: now() });
    });
    notify(user, 'contrasena_cambiada', { req, ip });
    return undefined;
  });

  // Eliminar la cuenta siempre está disponible, también sin aceptar una versión nueva de los términos.
  router.delete(
    '/api/account',
    async ({ body, req, res, user }) => {
      await reauth(user, body.password, 'password', 'Escribe tu contraseña para confirmar', 'La contraseña no es correcta');
      // ON DELETE CASCADE elimina sesiones, configuración, movimientos, facturas, eventos, avisos de pago,
      // enlaces de correo, códigos de respaldo y actividad de seguridad.
      // Se conservan la prueba de sus consentimientos (consents) y sus PQR (docs/12-legal-y-seguridad.md).
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      res.setHeader('Set-Cookie', clearSessionCookie(secure(req), cookieName));
      return undefined;
    },
    { consent: false },
  );
}
