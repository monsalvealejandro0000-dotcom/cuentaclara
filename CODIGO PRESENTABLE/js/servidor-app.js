import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { Router, REPLY } from './router.js';
import { HttpError } from './validation.js';
import { LoginLimiter, parseCookies, findSession, SESSION_COOKIE } from './auth.js';
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
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/** CSP. `styleHashes`: huellas SHA-256 de los <style> en línea que se permiten (solo los de la página servida). */
function contentSecurityPolicy(styleHashes = []) {
  const styleSrc = ["'self'", ...styleHashes.map((h) => `'sha256-${h}'`)].join(' ');
  return (
    `default-src 'self'; script-src 'self'; style-src ${styleSrc}; img-src 'self' data:; connect-src 'self'; ` +
    "font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
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
  'Content-Security-Policy': contentSecurityPolicy(),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
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

/** `now`: reloj del servidor (las pruebas lo sustituyen para comprobar fechas de planes y avisos). */
export function createApp({ dbPath, publicDir = DEFAULT_PUBLIC_DIR, secureCookies = false, logger = console, now = () => new Date() } = {}) {
  if (!dbPath) throw new Error('createApp: dbPath es obligatorio');
  const db = openDb(dbPath);
  const router = new Router();
  const ctx = { db, limiter: new LoginLimiter(), secureCookies, today: () => todayLocal(now()) };
  for (const register of ROUTE_MODULES) register(router, ctx);
  const root = path.resolve(publicDir);

  async function handleApi(req, res, url) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const match = router.match(req.method, url.pathname);
      if (!match) throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
      if (match.methodNotAllowed) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
      const unsafe = UNSAFE_METHODS.has(req.method);
      if (unsafe) checkOrigin(req);
      const body = unsafe ? await readJson(req) : {};
      const sessionToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const user = findSession(db, sessionToken);
      if (match.route.auth && !user) throw new HttpError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar');

      const result = await match.route.handler({
        req,
        res,
        url,
        query: url.searchParams,
        params: match.params,
        body,
        user,
        sessionToken,
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
      res.setHeader('Content-Security-Policy', contentSecurityPolicy(inlineStyleHashes(html.toString('utf8'))));
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
    // Detrás de HTTPS (COOKIE_SECURE=1): el navegador recuerda usar siempre HTTPS (HSTS, un año).
    if (secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const url = new URL(req.url, 'http://localhost');
    const work = url.pathname.startsWith('/api/') ? handleApi(req, res, url) : serveStatic(req, res, url.pathname);
    work.catch((err) => {
      logger.error('[error]', req.method, req.url, err);
      if (!res.headersSent) sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
      else res.destroy();
    });
  });

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

  return { server, db, close };
}
