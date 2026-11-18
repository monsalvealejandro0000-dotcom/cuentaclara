import { Validator, HttpError, validationError } from '../validation.js';
import { transaction } from '../db.js';
import { reply } from '../router.js';
import { createSettings } from './settings.js';
import {
  hashPassword,
  verifyPassword,
  burnVerification,
  createSession,
  deleteSessionByToken,
  purgeExpiredSessions,
  sessionCookie,
  clearSessionCookie,
} from '../auth.js';

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });
const isUniqueError = (err) => /UNIQUE constraint failed/i.test(err?.message ?? '');
const emailTaken = () =>
  new HttpError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con este email', { email: 'Ya existe una cuenta con este email' });

export function registerAuthRoutes(router, { db, limiter, secureCookies }) {
  const secure = (req) => secureCookies || req.headers['x-forwarded-proto'] === 'https';

  router.post(
    '/api/auth/register',
    async ({ body, req, res }) => {
      const v = new Validator(body);
      v.string('name', { required: true, max: 100 });
      v.email('email');
      v.password('password');
      const data = v.check();

      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) throw emailTaken();
      const passwordHash = await hashPassword(data.password);
      let user;
      try {
        user = transaction(db, () => {
          const r = db
            .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
            .run(data.email, data.name, passwordHash);
          const id = Number(r.lastInsertRowid);
          createSettings(db, id);
          return { id, email: data.email, name: data.name };
        });
      } catch (err) {
        if (isUniqueError(err)) throw emailTaken();
        throw err;
      }
      const { token } = createSession(db, user.id);
      res.setHeader('Set-Cookie', sessionCookie(token, secure(req)));
      return reply(201, { user });
    },
    { auth: false },
  );

  router.post(
    '/api/auth/login',
    async ({ body, req, res }) => {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const missing = {};
      if (!email) missing.email = 'Este campo es obligatorio';
      if (!password) missing.password = 'Este campo es obligatorio';
      if (Object.keys(missing).length) throw validationError(missing);

      const key = limiter.key(email, req.socket.remoteAddress);
      const wait = limiter.retryAfterMs(key);
      if (wait > 0) {
        const minutes = Math.ceil(wait / 60000);
        throw new HttpError(
          429,
          'TOO_MANY_ATTEMPTS',
          `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutes} min.`,
          undefined,
          { 'Retry-After': String(Math.ceil(wait / 1000)) },
        );
      }

      const row = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(email);
      const ok = row ? await verifyPassword(password, row.password_hash) : await burnVerification(password);
      if (!ok) {
        limiter.fail(key);
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos');
      }
      limiter.reset(key);
      purgeExpiredSessions(db);
      const { token } = createSession(db, row.id);
      res.setHeader('Set-Cookie', sessionCookie(token, secure(req)));
      return { user: publicUser(row) };
    },
    { auth: false },
  );

  router.post(
    '/api/auth/logout',
    ({ req, res, sessionToken }) => {
      deleteSessionByToken(db, sessionToken);
      res.setHeader('Set-Cookie', clearSessionCookie(secure(req)));
      return undefined;
    },
    { auth: false },
  );

  router.get('/api/auth/me', ({ user }) => ({ user: publicUser(user) }));

  router.put('/api/account/password', async ({ body, user }) => {
    const v = new Validator(body);
    if (typeof body.current_password !== 'string' || !body.current_password) {
      v.fail('current_password', 'Este campo es obligatorio');
    }
    v.password('new_password');
    v.check();
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!(await verifyPassword(body.current_password, row.password_hash))) {
      throw validationError({ current_password: 'La contraseña actual no es correcta' });
    }
    const hash = await hashPassword(body.new_password);
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
      // Cierra el resto de sesiones abiertas (otros dispositivos).
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, user.session_id);
    });
    return undefined;
  });

  router.delete('/api/account', async ({ body, req, res, user }) => {
    if (typeof body.password !== 'string' || !body.password) {
      throw validationError({ password: 'Escribe tu contraseña para confirmar' });
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!(await verifyPassword(body.password, row.password_hash))) {
      throw validationError({ password: 'La contraseña no es correcta' });
    }
    // ON DELETE CASCADE elimina sesiones, configuración, movimientos y facturas.
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    res.setHeader('Set-Cookie', clearSessionCookie(secure(req)));
    return undefined;
  });
}
