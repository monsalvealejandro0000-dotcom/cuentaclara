import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

/**
 * Límites de peticiones de las pruebas: muy altos, porque cada prueba crea muchas cuentas desde la misma IP.
 * El bloqueo por correo (5 contraseñas fallidas) se deja como en producción. tests/security.test.js prueba los reales.
 */
export const TEST_LIMITS = { api: { max: 1e9 }, register: { max: 1e9 }, loginIp: { max: 1e9 }, forgot: { max: 1e9 } };

/** Las dos casillas del registro marcadas (términos y autorización de datos). */
export const ACCEPT = { accept_terms: true, accept_privacy: true };

/** Correos que «envió» cada servidor de pruebas (fase 13): nunca salen a internet. baseUrl → lista. */
const outboxes = new Map();

/** Código del enlace de un correo («…/#/restablecer?t=CODIGO»). */
export const tokenOf = (mail) => mail?.link?.split('?t=')[1] ?? null;

/** Último correo de un tipo enviado a una dirección (o undefined). */
export const lastMail = (outbox, to, kind) => outbox.filter((m) => m.to === to && (!kind || m.kind === kind)).at(-1);

/**
 * Arranca un servidor real con una base de datos SQLite NUEVA en una carpeta temporal.
 * Los datos de prueba nunca tocan la base de datos real (data/app.db) y se borran al cerrar.
 * `options`: más opciones de createApp (p. ej. `limits`).
 */
export async function startServer({ dir, now, ...options } = {}) {
  const tmpDir = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const outbox = [];
  // `now`: reloj del servidor (para probar fechas de planes y avisos); por defecto, el real.
  const app = createApp({
    dbPath,
    logger: { error() {} },
    limits: TEST_LIMITS,
    mailTransport: (m) => outbox.push(m),
    ...(now ? { now } : {}),
    ...options,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  outboxes.set(baseUrl, outbox);
  return {
    app,
    baseUrl,
    dbPath,
    tmpDir,
    outbox,
    lastMail: (to, kind) => lastMail(outbox, to, kind),
    async stop() {
      await app.close();
    },
    async destroy() {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/** Cliente HTTP con su propia "cookie jar" (simula un navegador/usuario). */
export function client(baseUrl) {
  let cookie = '';
  async function request(method, url, body, headers = {}) {
    const init = { method, headers: { ...headers } };
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) {
      init.headers['content-type'] ??= 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(baseUrl + url, init);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      cookie = pair.endsWith('=') ? '' : pair;
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (u, h) => request('GET', u, undefined, h),
    post: (u, b = {}, h) => request('POST', u, b, h),
    put: (u, b = {}, h) => request('PUT', u, b, h),
    del: (u, b, h) => request('DELETE', u, b, h),
    raw: request,
    get cookie() {
      return cookie;
    },
    set cookie(v) {
      cookie = v;
    },
  };
}

let counter = 0;
/**
 * Registra un usuario de prueba con email único y devuelve su cliente ya autenticado.
 * Por defecto confirma su correo con el enlace del correo de bienvenida (como haría la persona), si el servidor
 * es de startServer. `verified: false` lo deja sin confirmar.
 */
export async function registerUser(baseUrl, { verified = true, ...overrides } = {}) {
  const c = client(baseUrl);
  counter++;
  const creds = {
    name: `Usuario Prueba ${counter}`,
    email: `prueba${counter}-${process.pid}@test.local`,
    password: 'clave-segura-123',
    ...ACCEPT,
    ...overrides,
  };
  const res = await c.post('/api/auth/register', creds);
  if (res.status !== 201) throw new Error(`Registro falló: ${res.status} ${JSON.stringify(res.data)}`);
  const outbox = outboxes.get(baseUrl);
  if (verified && outbox) {
    const token = tokenOf(lastMail(outbox, res.data.user.email, 'verificar'));
    const r = await c.post('/api/auth/email/confirm', { token });
    if (r.status !== 200) throw new Error(`Confirmar el correo falló: ${r.status} ${JSON.stringify(r.data)}`);
    return { c, user: { ...res.data.user, emailVerified: true }, creds };
  }
  return { c, user: res.data.user, creds };
}

export const movement = (overrides = {}) => ({
  type: 'ingreso',
  date: '2026-11-05',
  concept: 'Proyecto web',
  category: 'Facturación',
  base_cents: 100000,
  vat_rate: 19,
  irpf_rate: 10,
  notes: '',
  ...overrides,
});

export const expense = (overrides = {}) => ({
  type: 'gasto',
  date: '2026-11-10',
  concept: 'Licencia de software',
  category: 'Software y suscripciones',
  base_cents: 20000,
  vat_rate: 19,
  deductible: true,
  notes: '',
  ...overrides,
});

export const invoice = (overrides = {}) => ({
  client_name: 'Cliente Prueba S.A.S.',
  client_nif: '900123456-7',
  client_address: 'Calle 10 # 20-30',
  issue_date: '2026-11-03',
  due_date: '2026-12-03',
  concept: 'Desarrollo de aplicación',
  base_cents: 250000,
  vat_rate: 19,
  irpf_rate: 11,
  notes: '',
  ...overrides,
});
