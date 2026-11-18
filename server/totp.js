/**
 * Verificación en dos pasos (fase 13, docs/13-correo-y-segundo-factor.md), solo con node:crypto.
 * - Códigos de una app de autenticación: TOTP (RFC 6238) con HMAC-SHA1, 6 dígitos y 30 segundos, que es lo que
 *   entienden Google Authenticator, Microsoft Authenticator, 2FAS, Authy, 1Password…
 * - Códigos de respaldo: 10 de un solo uso, guardados solo como huella SHA-256.
 */
import crypto from 'node:crypto';

export const ISSUER = 'CuentaClara';
export const PERIOD_S = 30;
export const DIGITS = 6;
/** Se aceptan el código del intervalo actual, el anterior y el siguiente (relojes un poco desfasados). */
export const WINDOW = 1;
export const BACKUP_CODE_COUNT = 10;

// ---------------------------------------------------------------- base32 (RFC 4648, sin relleno)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Clave base32 no válida');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---------------------------------------------------------------- TOTP

/** Clave nueva: 20 bytes aleatorios (160 bits, lo que recomienda el RFC 4226), en base32. */
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

/** Clave agrupada de 4 en 4 para escribirla a mano («ABCD EFGH …»). */
export const groupSecret = (secret) => secret.replace(/(.{4})(?=.)/g, '$1 ');

/** Código HOTP (RFC 4226) de `digits` cifras para un contador. */
export function hotp(key, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const timeStep = (ms) => Math.floor(ms / 1000 / PERIOD_S);

/** Código que muestra la app en el instante `ms` (lo usan las pruebas y la configuración). */
export const totpCode = (secret, ms = Date.now()) => hotp(base32Decode(secret), timeStep(ms));

/**
 * Comprueba un código de 6 dígitos. Devuelve el intervalo con el que coincide, o null.
 * `lastStep`: el último intervalo ya usado; un código igual o anterior no vuelve a servir (repetición).
 */
export function verifyTotp(secret, code, ms, lastStep = 0) {
  const clean = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const key = base32Decode(secret);
  const now = timeStep(ms);
  const given = Buffer.from(clean);
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    if (step <= lastStep) continue;
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, step)), given)) return step;
  }
  return null;
}

/** Dirección otpauth:// que leen las apps al escanear el QR o al tocar «Abrir en mi app». */
export function otpauthUri(secret, email) {
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_S}`;
}

// ---------------------------------------------------------------- códigos de respaldo

/** Sin 0, 1, i, l ni o: no se confunden al copiarlos a mano. 31 símbolos × 10 = ~49 bits por código. */
const BACKUP_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export function newBackupCodes(n = BACKUP_CODE_COUNT) {
  return Array.from({ length: n }, () => {
    let s = '';
    for (let i = 0; i < 10; i++) s += BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** «K7M2P x9qrt» → «k7m2px9qrt». null si no tiene la forma de un código de respaldo. */
export function normalizeBackupCode(code) {
  const clean = String(code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean.length === 10 ? clean : null;
}

/** Huella de un código de respaldo. Lleva el id de la cuenta para que dos cuentas no compartan huellas. */
export const backupCodeHash = (userId, normalized) => crypto.createHash('sha256').update(`${userId}:${normalized}`).digest('hex');
