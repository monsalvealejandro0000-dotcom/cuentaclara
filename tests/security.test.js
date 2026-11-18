// Fase 12: defensas del servidor (docs/12-legal-y-seguridad.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { hashPassword, needsRehash } from '../server/auth.js';
import { clientIp, RateLimiter, weakPasswordReason } from '../server/security.js';
import { startServer, client, registerUser, ACCEPT, TEST_LIMITS } from './helpers.js';

/** Servidor con opciones propias (límites reales, dominios permitidos…). */
async function serverWith(options) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-test-'));
  const app = createApp({ dbPath: path.join(dir, 'test.db'), logger: { error() {}, warn() {} }, ...options });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return {
    app,
    baseUrl: `http://127.0.0.1:${app.server.address().port}`,
    async destroy() {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const uniq = () => `s${Date.now()}${Math.random().toString(36).slice(2, 7)}@test.local`;

test('cabeceras de seguridad en páginas y en la API', async () => {
  const srv = await startServer();
  try {
    for (const url of ['/', '/api/legal']) {
      const h = (await fetch(srv.baseUrl + url)).headers;
      assert.match(h.get('content-security-policy'), /default-src 'self'.*frame-ancestors 'none'/, url);
      assert.match(h.get('content-security-policy'), /object-src 'none'/);
      assert.equal(h.get('x-frame-options'), 'DENY');
      assert.equal(h.get('x-content-type-options'), 'nosniff');
      assert.equal(h.get('cross-origin-opener-policy'), 'same-origin');
      assert.equal(h.get('cross-origin-resource-policy'), 'same-origin');
      assert.match(h.get('permissions-policy'), /camera=\(\).*payment=\(\)/);
    }
    assert.equal((await fetch(`${srv.baseUrl}/api/legal`)).headers.get('cache-control'), 'no-store');
  } finally {
    await srv.destroy();
  }
});

test('cookie de sesión: SameSite=Strict y, con HTTPS, prefijo __Host- y Secure', async () => {
  const srv = await serverWith({ secureCookies: true, limits: TEST_LIMITS });
  try {
    const c = client(srv.baseUrl);
    const r = await c.post('/api/auth/register', { name: 'Ana', email: uniq(), password: 'clave-larga-77', ...ACCEPT });
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /^__Host-sid=/);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /HttpOnly/);
    assert.doesNotMatch(cookie, /Domain=/i);
    assert.equal((await c.get('/api/auth/me')).status, 200);
    // Una cookie «sid» sin prefijo (p. ej. plantada desde un subdominio) no vale.
    const fake = client(srv.baseUrl);
    fake.cookie = `sid=${c.cookie.split('=')[1]}`;
    assert.equal((await fake.get('/api/auth/me')).status, 401);
    assert.match((await fetch(srv.baseUrl + '/')).headers.get('content-security-policy'), /upgrade-insecure-requests/);
  } finally {
    await srv.destroy();
  }
});

test('límite de registros por IP', async () => {
  const srv = await serverWith({ limits: { register: { max: 3 } } });
  try {
    for (let i = 0; i < 3; i++) {
      assert.equal((await client(srv.baseUrl).post('/api/auth/register', { name: 'A', email: uniq(), password: 'clave-larga-77', ...ACCEPT })).status, 201);
    }
    const r = await client(srv.baseUrl).post('/api/auth/register', { name: 'A', email: uniq(), password: 'clave-larga-77', ...ACCEPT });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  } finally {
    await srv.destroy();
  }
});

test('límite de contraseñas fallidas por IP aunque se cambie de correo', async () => {
  const srv = await serverWith({ limits: { loginIp: { max: 4 } } });
  try {
    const { creds } = await registerUser(srv.baseUrl);
    for (let i = 0; i < 4; i++) {
      assert.equal((await client(srv.baseUrl).post('/api/auth/login', { email: uniq(), password: 'no-es-esta-1' })).status, 401);
    }
    // Ni siquiera la contraseña buena de otra cuenta entra desde esa IP mientras dure el bloqueo.
    assert.equal((await client(srv.baseUrl).post('/api/auth/login', { email: creds.email, password: creds.password })).status, 429);
  } finally {
    await srv.destroy();
  }
});

test('límite general de peticiones a la API por IP', async () => {
  const srv = await serverWith({ limits: { api: { max: 5 } } });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await fetch(`${srv.baseUrl}/api/legal`)).status, 200);
    const r = await fetch(`${srv.baseUrl}/api/legal`);
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.equal((await fetch(`${srv.baseUrl}/`)).status, 200, 'la página sigue cargando');
  } finally {
    await srv.destroy();
  }
});

test('contraseña actual mal escrita: 5 intentos y se bloquea (cambiar contraseña y eliminar cuenta)', async () => {
  const srv = await startServer();
  try {
    const { c, creds } = await registerUser(srv.baseUrl);
    for (let i = 0; i < 5; i++) {
      assert.equal((await c.del('/api/account', { password: `mala-clave-${i}` })).status, 400);
    }
    assert.equal((await c.put('/api/account/password', { current_password: creds.password, new_password: 'otra-clave-larga-5' })).status, 429);
    assert.equal((await c.get('/api/auth/me')).status, 200, 'la cuenta sigue existiendo');
  } finally {
    await srv.destroy();
  }
});

test('solo responde a los dominios permitidos (DNS rebinding)', async () => {
  const srv = await serverWith({ allowedHosts: ['localhost', '127.0.0.1'] });
  try {
    assert.equal((await fetch(`${srv.baseUrl}/api/legal`)).status, 200);
    // fetch no deja cambiar la cabecera Host: se usa node:http, como haría un navegador tras un DNS rebinding.
    const { port } = new URL(srv.baseUrl);
    const status = await new Promise((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: '/api/legal', headers: { host: `atacante.com:${port}` } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(status, 421);
  } finally {
    await srv.destroy();
  }
});

test('IP real detrás de un proxy solo si se confía en él', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }, socket: { remoteAddress: '::ffff:10.0.0.2' } };
  assert.equal(clientIp(req, false), '10.0.0.2', 'sin TRUST_PROXY la cabecera se ignora (se podría inventar)');
  assert.equal(clientIp(req, true), '203.0.113.7', 'con proxy: la última IP, la que añade el propio proxy');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': 'basura' }, socket: { remoteAddress: '10.0.0.2' } }, true), '10.0.0.2');
});

test('rutas con codificación rota → 404, nunca 500', async () => {
  const srv = await startServer();
  try {
    const { c } = await registerUser(srv.baseUrl);
    for (const url of ['/api/movements/%E0%A4%A', '/api/invoices/%', '/api/legal/%ZZ']) {
      assert.equal((await c.get(url)).status, 404, url);
    }
  } finally {
    await srv.destroy();
  }
});

test('contraseñas: mínimo 10, ni comunes ni con el correo o el nombre', () => {
  assert.match(weakPasswordReason('Colombia2026'), /más usadas/);
  assert.match(weakPasswordReason('1111111111a'), /distintos/);
  assert.match(weakPasswordReason('juanperez-99', { email: 'juanperez@x.co' }), /correo/);
  assert.match(weakPasswordReason('Valentina#77', { name: 'Valentina Ríos' }), /nombre/);
  assert.equal(weakPasswordReason('mi-gato-come-arroz-7', { email: 'ana@x.co', name: 'Ana' }), null);
});

test('las contraseñas antiguas (cifrado más débil) se vuelven a cifrar al iniciar sesión', async () => {
  const srv = await startServer();
  try {
    const { creds, user } = await registerUser(srv.baseUrl);
    const crypto = await import('node:crypto');
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(creds.password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });
    const old = ['scrypt', 16384, 8, 1, salt.toString('base64'), key.toString('base64')].join('$');
    srv.app.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(old, user.id);
    assert.equal(needsRehash(old), true);
    assert.equal((await client(srv.baseUrl).post('/api/auth/login', { email: creds.email, password: creds.password })).status, 200);
    const now = srv.app.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id).password_hash;
    assert.notEqual(now, old);
    assert.equal(needsRehash(now), false);
    assert.equal(needsRehash(await hashPassword('otra-clave-9x')), false);
  } finally {
    await srv.destroy();
  }
});

test('RateLimiter: ventana fija por clave', () => {
  const l = new RateLimiter({ max: 2, windowMs: 1000 });
  assert.equal(l.take('a', 0), true);
  assert.equal(l.take('a', 10), true);
  assert.equal(l.take('a', 20), false);
  assert.equal(l.take('b', 20), true, 'otra clave no se ve afectada');
  assert.equal(l.retryAfterMs('a', 500), 500);
  assert.equal(l.take('a', 1000), true, 'al acabar la ventana se reinicia');
});
