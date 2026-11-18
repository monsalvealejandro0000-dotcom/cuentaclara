/**
 * Defensas del servidor (docs/12-legal-y-seguridad.md):
 * - límites de peticiones por IP o por cuenta (en memoria; se reinician al reiniciar el servidor),
 * - IP real del visitante detrás de un proxy (solo si se activa TRUST_PROXY),
 * - lista de dominios permitidos en la cabecera Host (protege de «DNS rebinding»),
 * - contraseñas demasiado comunes o fáciles de adivinar.
 */
import net from 'node:net';

/** Límite de eventos por clave en una ventana fija (p. ej. 5 registros por IP y hora). */
export class RateLimiter {
  constructor({ max, windowMs }) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  /** Milisegundos que faltan para poder volver a intentarlo (0 si no está bloqueado). */
  retryAfterMs(key, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h) return 0;
    if (now - h.first >= this.windowMs) {
      this.hits.delete(key);
      return 0;
    }
    return h.count >= this.max ? this.windowMs - (now - h.first) : 0;
  }

  /** Cuenta un evento. */
  hit(key, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h || now - h.first >= this.windowMs) this.hits.set(key, { count: 1, first: now });
    else h.count++;
    if (this.hits.size > 20_000) this.prune(now);
  }

  /** Cuenta un evento y devuelve si sigue dentro del límite. */
  take(key, now = Date.now()) {
    if (this.retryAfterMs(key, now) > 0) return false;
    this.hit(key, now);
    return true;
  }

  reset(key) {
    this.hits.delete(key);
  }

  prune(now = Date.now()) {
    for (const [k, v] of this.hits) if (now - v.first >= this.windowMs) this.hits.delete(k);
  }
}

/** Límites por defecto. Las pruebas los suben para poder crear muchas cuentas seguidas. */
export const DEFAULT_LIMITS = {
  // Peticiones a /api por IP: de sobra para una persona (≈ 2 por segundo durante 5 minutos).
  api: { max: 600, windowMs: 5 * 60 * 1000 },
  // Cuentas nuevas (y comprobaciones de correo en el registro) por IP.
  register: { max: 10, windowMs: 60 * 60 * 1000 },
  // Contraseñas fallidas por IP, sumando todos los correos (frena a quien prueba muchas cuentas).
  loginIp: { max: 30, windowMs: 15 * 60 * 1000 },
  // Contraseñas fallidas por correo + IP (el bloqueo que ya existía).
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  // Contraseña actual mal escrita al cambiarla o al eliminar la cuenta, por cuenta.
  reauth: { max: 5, windowMs: 15 * 60 * 1000 },
  // Fase 13. Correos que pide una cuenta (reenviar la confirmación, cambiar de correo).
  mail: { max: 5, windowMs: 60 * 60 * 1000 },
  // «Olvidé mi contraseña» por IP.
  forgot: { max: 10, windowMs: 60 * 60 * 1000 },
  // Correos de recuperación a una misma dirección: los de más no se envían (sin decirlo, para no revelar nada).
  forgotEmail: { max: 3, windowMs: 60 * 60 * 1000 },
  // Códigos de verificación en dos pasos incorrectos, por cuenta: 5 cada 15 minutos y 20 al día.
  twoFactor: { max: 5, windowMs: 15 * 60 * 1000 },
  twoFactorDay: { max: 20, windowMs: 24 * 60 * 60 * 1000 },
  // Descargas de la copia de seguridad (con la clave del administrador) por IP, acierten o no.
  backupDownload: { max: 10, windowMs: 60 * 60 * 1000 },
};

export function createLimiters(overrides = {}) {
  const out = {};
  for (const [name, def] of Object.entries(DEFAULT_LIMITS)) out[name] = new RateLimiter({ ...def, ...(overrides[name] ?? {}) });
  return out;
}

/**
 * IP del visitante. Sin proxy es la de la conexión. Con `trustProxy` (la app detrás de Nginx, Caddy…)
 * es la última de X-Forwarded-For, la que añade el propio proxy: las anteriores las puede inventar el visitante.
 */
export function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const last = xff.at(-1);
    if (last && net.isIP(last)) return last;
  }
  const ip = req.socket.remoteAddress ?? '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** Nombre del host sin el puerto («localhost:3000» → «localhost», «[::1]:3000» → «[::1]»). */
export function hostName(header) {
  const h = String(header ?? '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0];
}

export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** Lista de dominios desde ALLOWED_HOSTS («cuentaclara.co, www.cuentaclara.co»). Vacía → null (sin comprobar). */
export function parseAllowedHosts(value) {
  const list = String(value ?? '')
    .split(',')
    .map((s) => hostName(s))
    .filter(Boolean);
  return list.length ? list : null;
}

// ---------------------------------------------------------------- contraseñas

/**
 * Contraseñas de 10 o más caracteres, con letras y números, que aun así están entre las más usadas
 * (listas públicas de filtraciones y variantes locales). Se comparan en minúsculas.
 */
const COMMON_PASSWORDS = new Set([
  'password12', 'password123', 'password1234', 'password12345', 'passw0rd123', 'p4ssw0rd123', 'pass123456', 'pass1234567',
  'contraseña1', 'contraseña12', 'contraseña123', 'contrasena1', 'contrasena12', 'contrasena123', 'micontraseña1',
  'qwerty1234', 'qwerty12345', 'qwerty123456', 'qwertyuiop1', 'qwertyuiop123', 'asdfghjkl1', 'asdfghjkl123', 'zxcvbnm123',
  'abc1234567', 'abcd123456', 'abcde12345', 'abc123456789', 'abcdef1234', 'a123456789', 'a1234567890', '123456789a',
  '1234567890a', '12345678abc', '123456abcd', '1q2w3e4r5t', '1q2w3e4r5t6y', 'q1w2e3r4t5', 'q1w2e3r4t5y6', 'a1b2c3d4e5',
  '1qaz2wsx3edc', 'zaq12wsxcde3', '123qweasdzxc', 'qweasdzxc123', 'iloveyou12', 'iloveyou123', 'teamo12345', 'teamo123456',
  'tequiero123', 'princesa123', 'welcome123', 'bienvenido1', 'bienvenido123', 'admin12345', 'admin123456', 'administrador1',
  'usuario12345', 'usuario123456', 'colombia123', 'colombia1234', 'colombia2024', 'colombia2025', 'colombia2026',
  'bogota12345', 'medellin123', 'medellin1234', 'barranquilla1', 'millonarios1', 'nacional1234', 'america12345',
  'junior12345', 'football123', 'futbol12345', 'monkey12345', 'dragon12345', 'superman123', 'batman12345',
  'cuentaclara1', 'cuentaclara12', 'cuentaclara123', 'cuentaclara2026', 'sunshine123', 'master12345', 'letmein123',
]);

/**
 * Motivo por el que una contraseña es fácil de adivinar, o null si es aceptable.
 * `context`: correo y nombre de la persona (no se permiten dentro de la contraseña).
 */
export function weakPasswordReason(password, { email = '', name = '' } = {}) {
  const lower = password.normalize('NFKC').toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'Es una de las contraseñas más usadas: elige otra';
  if (new Set(lower).size < 5) return 'Usa al menos 5 caracteres distintos';
  const local = String(email).toLowerCase().split('@')[0];
  if (local.length >= 4 && lower.includes(local)) return 'No uses tu correo dentro de la contraseña';
  for (const part of String(name).toLowerCase().split(/\s+/)) {
    if (part.length >= 4 && lower.includes(part)) return 'No uses tu nombre dentro de la contraseña';
  }
  return null;
}
