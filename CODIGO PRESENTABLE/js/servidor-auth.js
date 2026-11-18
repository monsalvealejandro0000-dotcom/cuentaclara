import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return crypto.timingSafeEqual(key, expected);
}

let dummyHash;
/** Gasta el mismo tiempo que una verificación real para no revelar si un email existe. */
export async function burnVerification(password) {
  dummyHash ??= await hashPassword('contraseña-ficticia-0');
  await verifyPassword(password, dummyHash);
  return false;
}

// ---------- Sesiones ----------

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(db, userId, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  const id = sha256(token);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, now + SESSION_TTL_MS);
  return { token, id };
}

export function findSession(db, token, now = Date.now()) {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  return (
    db
      .prepare(
        `SELECT s.id AS session_id, u.id, u.email, u.name
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > ?`,
      )
      .get(sha256(token), now) ?? null
  );
}

export function deleteSessionByToken(db, token) {
  if (!token || typeof token !== 'string') return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
}

export function purgeExpiredSessions(db, now = Date.now()) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function sessionCookie(token, secure) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

// ---------- Límite de intentos de inicio de sesión ----------

export class LoginLimiter {
  constructor({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }

  key(email, ip) {
    return `${email}|${ip}`;
  }

  /** Milisegundos que faltan para poder reintentar (0 si no está bloqueado). */
  retryAfterMs(key, now = Date.now()) {
    const a = this.attempts.get(key);
    if (!a) return 0;
    if (now - a.first > this.windowMs) {
      this.attempts.delete(key);
      return 0;
    }
    return a.count >= this.max ? this.windowMs - (now - a.first) : 0;
  }

  fail(key, now = Date.now()) {
    const a = this.attempts.get(key);
    if (!a || now - a.first > this.windowMs) this.attempts.set(key, { count: 1, first: now });
    else a.count++;
    if (this.attempts.size > 10_000) {
      for (const [k, v] of this.attempts) if (now - v.first > this.windowMs) this.attempts.delete(k);
    }
  }

  reset(key) {
    this.attempts.delete(key);
  }
}
