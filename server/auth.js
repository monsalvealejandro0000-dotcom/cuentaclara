import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
// Coste equivalente al mínimo que recomienda OWASP para scrypt (N=2^15, r=8, p=3: 32 MiB, ≈0,3 s por intento).
// Las contraseñas guardadas con parámetros más bajos se vuelven a cifrar al iniciar sesión (needsRehash).
const PARAMS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
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

/** true si la contraseña se guardó con un coste menor que el actual (se vuelve a cifrar al iniciar sesión). */
export function needsRehash(stored) {
  const [kind, N, r, p] = String(stored).split('$');
  return kind !== 'scrypt' || Number(N) < PARAMS.N || Number(r) < PARAMS.r || Number(p) < PARAMS.p;
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
/**
 * Con HTTPS (COOKIE_SECURE=1) la cookie lleva el prefijo __Host-: el navegador solo la acepta si es Secure,
 * de este mismo dominio exacto y para toda la web, así que un subdominio no puede plantar una cookie falsa.
 */
export const SECURE_SESSION_COOKIE = '__Host-sid';
export const sessionCookieName = (secureCookies) => (secureCookies ? SECURE_SESSION_COOKIE : SESSION_COOKIE);
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
        `SELECT s.id AS session_id, u.id, u.email, u.name, u.email_verified_at, u.totp_enabled_at
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

// SameSite=Strict: el navegador nunca envía la cookie en peticiones que empiezan en otra web (CSRF).
// La app es una sola página: sus llamadas a /api salen del mismo sitio y siempre la llevan.
export function sessionCookie(token, secure, name = SESSION_COOKIE) {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure, name = SESSION_COOKIE) {
  return `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
