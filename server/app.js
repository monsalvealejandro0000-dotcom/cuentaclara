import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { Router, REPLY } from './router.js';
import { HttpError } from './validation.js';
import { parseCookies, findSession, sessionCookieName } from './auth.js';
import { createLimiters, clientIp, hostName } from './security.js';
import { loadLegal, pendingConsents } from './legal.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerMovementRoutes } from './routes/movements.js';
import { registerInvoiceRoutes } from './routes/invoices.js';
import { registerSummaryRoutes } from './routes/summary.js';
import { registerEventRoutes } from './routes/events.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerPlanRoutes } from './routes/plan.js';
import { registerReportRoutes } from './routes/report.js';
import { registerReminderRoutes } from './routes/reminders.js';
import { registerAccountantRoutes } from './routes/accountant.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerLegalRoutes } from './routes/legal.js';
import { registerPqrRoutes } from './routes/pqr.js';
import { registerAccountRoutes } from './routes/account.js';
import { createMailer } from './mail.js';
import { paymentConfigLoader } from './payments.js';
import { todayLocal } from './calc.js';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Frontend React compilado por Vite (npm run build).
const DEFAULT_PUBLIC_DIR = path.join(APP_DIR, 'dist');
const MAX_BODY_BYTES = 100 * 1024;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/**
 * CSP. `styleHashes`: huellas SHA-256 de los <style> en línea que se permiten (solo los de la página servida).
 * Solo se carga código, estilos, fuentes e imágenes de este mismo servidor: nada de terceros.
 */
function contentSecurityPolicy(styleHashes = [], secure = false) {
  const styleSrc = ["'self'", ...styleHashes.map((h) => `'sha256-${h}'`)].join(' ');
  return (
    `default-src 'self'; script-src 'self'; style-src ${styleSrc}; img-src 'self' data:; connect-src 'self'; ` +
    "font-src 'self'; manifest-src 'self'; media-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; " +
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'" +
    (secure ? '; upgrade-insecure-requests' : '')
  );
}

/**
 * Huellas de los <style> en línea de una página HTML (en index.html, el aviso para quien abre el
 * archivo sin servidor). Se ignoran los comentarios HTML; el navegador convierte los saltos de línea
 * CRLF en LF antes de calcularlas.
 */
export function inlineStyleHashes(html) {
  const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
  return [...sinComentarios.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) =>
    crypto.createHash('sha256').update(m[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64'),
  );
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), ' +
    'accelerometer=(), gyroscope=(), magnetometer=(), display-capture=(), browsing-topics=()',
  // Aísla la pestaña de la app de ventanas abiertas desde otras webs y no deja que otras webs incrusten sus archivos.
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Origin-Agent-Cluster': '?1',
};

const ROUTE_MODULES = [
  registerAuthRoutes,
  registerSettingsRoutes,
  registerMovementRoutes,
  registerInvoiceRoutes,
  registerSummaryRoutes,
  registerEventRoutes,
  registerAnalyticsRoutes,
  registerPlanRoutes,
  registerReportRoutes,
  registerReminderRoutes,
  registerAccountantRoutes,
  registerPaymentRoutes,
  registerLegalRoutes,
  registerPqrRoutes,
  registerAccountRoutes,
];

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tooLarge) return reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'La petición es demasiado grande (máx. 100 KB)'));
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      const type = String(req.headers['content-type'] || '').toLowerCase();
      if (!type.startsWith('application/json')) {
        return reject(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'El cuerpo de la petición debe ser JSON'));
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return reject(new HttpError(400, 'INVALID_JSON', 'JSON mal formado'));
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return reject(new HttpError(400, 'INVALID_JSON', 'Se esperaba un objeto JSON'));
      }
      resolve(parsed);
    });
  });
}

/** Protección CSRF: rechaza peticiones que modifican datos desde otro origen. */
function checkOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    throw new HttpError(403, 'FORBIDDEN_ORIGIN', 'Origen no permitido');
  }
  const origin = req.headers.origin;
  if (!origin) return;
  let host = null;
  try {
    host = new URL(origin).host;
  } catch {
    /* origen ilegible */
  }
  if (host !== req.headers.host) throw new HttpError(403, 'FORBIDDEN_ORIGIN', 'Origen no permitido');
}

/**
 * `now`: reloj del servidor (las pruebas lo sustituyen para comprobar fechas de planes y avisos).
 * `paymentConfigPath`: datos para recibir pagos (fase 11); por defecto, cobro.json junto a la base de datos (data/cobro.json).
 * `legalDir` y `responsablePath`: documentos legales (legal/*.md) y tus datos como responsable (data/responsable.json).
 * `limits`: límites de peticiones (server/security.js); las pruebas los suben.
 * `trustProxy`: la app está detrás de un proxy (Nginx, Caddy…) y la IP real llega en X-Forwarded-For.
 * `allowedHosts`: dominios aceptados en la cabecera Host (null = cualquiera).
 * `mailConfigPath`: datos de Brevo para enviar correos (fase 13); por defecto, data/correo.json. Sin él, modo local.
 * `appUrl`: dirección de la app para los enlaces de los correos si correo.json no trae `url_app`.
 * `mailTransport`: solo para las pruebas: recibe cada correo en lugar de enviarlo.
 */
export function createApp({
  dbPath,
  publicDir = DEFAULT_PUBLIC_DIR,
  secureCookies = false,
  logger = console,
  now = () => new Date(),
  paymentConfigPath = path.join(path.dirname(path.resolve(dbPath ?? '.')), 'cobro.json'),
  legalDir,
  responsablePath = path.join(path.dirname(path.resolve(dbPath ?? '.')), 'responsable.json'),
  limits = {},
  trustProxy = false,
  allowedHosts = null,
  mailConfigPath = path.join(path.dirname(path.resolve(dbPath ?? '.')), 'correo.json'),
  appUrl = 'http://localhost:3000',
  mailTransport = null,
} = {}) {
  if (!dbPath) throw new Error('createApp: dbPath es obligatorio');
  const db = openDb(dbPath);
  const router = new Router();
  const legal = loadLegal(db, { dir: legalDir, responsableFile: responsablePath, logger });
  const limiters = createLimiters(limits);
  const mail = createMailer({
    configPath: mailConfigPath,
    appUrl,
    logger,
    transport: mailTransport,
    contact: legal.responsable.complete ? legal.responsable.values.correo : null,
  });
  const ctx = {
    db,
    limiters,
    secureCookies,
    cookieName: sessionCookieName(secureCookies),
    now,
    today: () => todayLocal(now()),
    paymentConfig: paymentConfigLoader(paymentConfigPath, logger),
    legal,
    clientIp: (req) => clientIp(req, trustProxy),
    logger,
    mail,
  };
  for (const register of ROUTE_MODULES) register(router, ctx);
  const root = path.resolve(publicDir);
  const allowed = allowedHosts ? new Set(allowedHosts.map(hostName)) : null;

  async function handleApi(req, res, url) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // Límite general por IP: frena a quien intenta adivinar datos o saturar el servidor a base de peticiones.
      const ip = ctx.clientIp(req);
      if (!limiters.api.take(ip)) {
        const wait = Math.ceil(limiters.api.retryAfterMs(ip) / 1000);
        throw new HttpError(429, 'TOO_MANY_REQUESTS', 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.', undefined, {
          'Retry-After': String(wait),
        });
      }
      const match = router.match(req.method, url.pathname);
      if (!match) throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
      if (match.methodNotAllowed) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
      const unsafe = UNSAFE_METHODS.has(req.method);
      if (unsafe) checkOrigin(req);
      const body = unsafe ? await readJson(req) : {};
      const sessionToken = parseCookies(req.headers.cookie)[ctx.cookieName];
      const user = findSession(db, sessionToken);
      if (match.route.auth && !user) throw new HttpError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar');
      // Quien no ha aceptado la versión vigente de los términos y la política de privacidad solo puede
      // aceptarlas, leerlas, cerrar sesión, enviar una PQR o eliminar su cuenta.
      if (match.route.auth && match.route.consent !== false && pendingConsents(db, legal, user).length) {
        throw new HttpError(403, 'CONSENT_REQUIRED', 'Para seguir usando CuentaClara acepta los términos y la política de privacidad vigentes.');
      }

      const result = await match.route.handler({
        req,
        res,
        url,
        query: url.searchParams,
        params: match.params,
        body,
        user,
        sessionToken,
        ip,
      });
      if (res.writableEnded) return;
      if (result === undefined || result === null) {
        res.writeHead(204);
        return res.end();
      }
      if (result[REPLY]) return sendJson(res, result.status, result.data);
      return sendJson(res, 200, result);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      if (err.headers) for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
      const error = { code: err.code, message: err.message };
      if (err.fields) error.fields = err.fields;
      return sendJson(res, err.status, { error });
    }
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Método no permitido');
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return sendText(res, 400, 'Ruta no válida');
    }
    if (decoded.includes('\0') || decoded.includes('\\')) return sendText(res, 404, 'No encontrado');
    const normalized = path.posix.normalize(decoded);
    let filePath = path.join(root, normalized);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) return sendText(res, 404, 'No encontrado');

    let stat = await fs.promises.stat(filePath).catch(() => null);
    if (stat?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fs.promises.stat(filePath).catch(() => null);
    }
    if (!stat || !stat.isFile()) {
      // Las rutas sin extensión devuelven la SPA; los ficheros que no existen, 404.
      if (path.posix.extname(normalized)) return sendText(res, 404, 'No encontrado');
      filePath = path.join(root, 'index.html');
      stat = await fs.promises.stat(filePath).catch(() => null);
      if (!stat) return sendText(res, 503, 'La interfaz no está compilada. Ejecuta "npm run build" y vuelve a arrancar.');
    }
    if (path.extname(filePath).toLowerCase() === '.html') {
      // Las páginas son pequeñas: se leen enteras para permitir en la CSP solo sus <style> en línea.
      const html = await fs.promises.readFile(filePath);
      res.setHeader('Content-Security-Policy', contentSecurityPolicy(inlineStyleHashes(html.toString('utf8')), secureCookies));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': html.length, 'Cache-Control': 'no-cache' });
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    await pipeline(fs.createReadStream(filePath), res);
  }

  const server = http.createServer((req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    res.setHeader('Content-Security-Policy', contentSecurityPolicy([], secureCookies));
    // Detrás de HTTPS (COOKIE_SECURE=1): el navegador recuerda usar siempre HTTPS (HSTS, un año).
    if (secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Solo responde a sus propios dominios: una web ajena no puede apuntar su dominio a este servidor (DNS rebinding).
    if (allowed && !allowed.has(hostName(req.headers.host))) return sendText(res, 421, 'Dominio no permitido');
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return sendText(res, 400, 'Petición no válida');
    }
    const work = url.pathname.startsWith('/api/') ? handleApi(req, res, url) : serveStatic(req, res, url.pathname);
    work.catch((err) => {
      logger.error('[error]', req.method, req.url, err);
      if (!res.headersSent) sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
      else res.destroy();
    });
  });

  // Conexiones lentas o a medias (ataques «slowloris»): se cortan en lugar de ocupar el servidor.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;

  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
    db.close();
  }

  return { server, db, close, mail };
}
