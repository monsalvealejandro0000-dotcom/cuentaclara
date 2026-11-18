// Fase 5: registro, inicio de sesión, sesiones, contraseña y eliminación de cuenta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, registerUser, movement, invoice, ACCEPT } from './helpers.js';

let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.destroy());

const uniq = () => `u${Date.now()}${Math.random().toString(36).slice(2, 7)}@test.local`;

test('registro', async (t) => {
  await t.test('correcto: 201, sesión iniciada y cookie segura', async () => {
    const c = client(srv.baseUrl);
    const email = uniq();
    const r = await c.post('/api/auth/register', { name: 'Ana', email: email.toUpperCase(), password: 'abcdefgh12', ...ACCEPT });
    assert.equal(r.status, 201);
    assert.equal(r.data.user.email, email); // se normaliza a minúsculas
    assert.equal(r.data.user.password_hash, undefined);
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\//);
    assert.equal((await c.get('/api/auth/me')).status, 200);
  });

  await t.test('la contraseña no se guarda en claro', async () => {
    const { creds, user } = await registerUser(srv.baseUrl);
    const row = srv.app.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    assert.ok(!row.password_hash.includes(creds.password));
    assert.match(row.password_hash, /^scrypt\$/);
  });

  await t.test('email duplicado (sin distinguir mayúsculas) → 409', async () => {
    const email = uniq();
    await client(srv.baseUrl).post('/api/auth/register', { name: 'A', email, password: 'abcdefgh12', ...ACCEPT });
    const r = await client(srv.baseUrl).post('/api/auth/register', { name: 'B', email: email.toUpperCase(), password: 'abcdefgh12', ...ACCEPT });
    assert.equal(r.status, 409);
    assert.equal(r.data.error.code, 'EMAIL_TAKEN');
    assert.ok(r.data.error.fields.email);
  });

  await t.test('datos no válidos → 400 por campo', async () => {
    const cases = [
      [{}, ['name', 'email', 'password']],
      [{ name: 'A', email: 'no-es-email', password: 'abcdefgh12', ...ACCEPT }, ['email']],
      [{ name: 'A', email: uniq(), password: 'abc1', ...ACCEPT }, ['password']], // corta
      [{ name: 'A', email: uniq(), password: 'abcdefg12', ...ACCEPT }, ['password']], // 9 caracteres: el mínimo es 10
      [{ name: 'A', email: uniq(), password: 'abcdefghijk', ...ACCEPT }, ['password']], // sin números
      [{ name: 'A', email: uniq(), password: '1234567890', ...ACCEPT }, ['password']], // sin letras
      [{ name: 'A', email: uniq(), password: 'Password123', ...ACCEPT }, ['password']], // de las más usadas
      [{ name: 'A', email: uniq(), password: 'aaaaaaaaa1', ...ACCEPT }, ['password']], // casi todo el mismo carácter
      [{ name: 'Ana', email: 'mariana.lopez@test.local', password: 'mariana.lopez1', ...ACCEPT }, ['password']], // su correo
      [{ name: 'Gertrudis Pérez', email: uniq(), password: 'gertrudis2026', ...ACCEPT }, ['password']], // su nombre
      [{ name: 'x'.repeat(101), email: uniq(), password: 'abcdefgh12', ...ACCEPT }, ['name']],
      [{ name: 123, email: uniq(), password: 'abcdefgh12', ...ACCEPT }, ['name']],
      [{ name: 'A', email: uniq(), password: 'abcdefgh12' }, ['accept_terms', 'accept_privacy']], // sin las casillas
      [{ name: 'A', email: uniq(), password: 'abcdefgh12', accept_terms: true }, ['accept_privacy']],
      [{ name: 'A', email: uniq(), password: 'abcdefgh12', accept_terms: 'true', accept_privacy: 1 }, ['accept_terms', 'accept_privacy']], // solo vale true
    ];
    for (const [body, fields] of cases) {
      const r = await client(srv.baseUrl).post('/api/auth/register', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      for (const f of fields) assert.ok(r.data.error.fields[f], `falta ${f}`);
      assert.equal(r.headers.get('set-cookie'), null);
    }
  });
});

test('inicio de sesión', async (t) => {
  const { creds } = await registerUser(srv.baseUrl);

  await t.test('correcto (email en mayúsculas y con espacios)', async () => {
    const c = client(srv.baseUrl);
    const r = await c.post('/api/auth/login', { email: `  ${creds.email.toUpperCase()} `, password: creds.password });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.email, creds.email);
    assert.equal((await c.get('/api/auth/me')).data.user.email, creds.email);
  });

  await t.test('contraseña incorrecta y email inexistente dan el mismo error', async () => {
    const wrong = await client(srv.baseUrl).post('/api/auth/login', { email: creds.email, password: 'mala-clave-1' });
    const unknown = await client(srv.baseUrl).post('/api/auth/login', { email: uniq(), password: 'mala-clave-1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.data.error.message, unknown.data.error.message);
    assert.equal(wrong.headers.get('set-cookie'), null);
  });

  await t.test('campos vacíos → 400', async () => {
    const r = await client(srv.baseUrl).post('/api/auth/login', {});
    assert.equal(r.status, 400);
    assert.ok(r.data.error.fields.email && r.data.error.fields.password);
  });

  await t.test('bloqueo tras 5 intentos fallidos (incluso con la contraseña buena)', async () => {
    const { creds: v } = await registerUser(srv.baseUrl);
    for (let i = 0; i < 5; i++) {
      assert.equal((await client(srv.baseUrl).post('/api/auth/login', { email: v.email, password: `mala${i}xx1` })).status, 401);
    }
    const blocked = await client(srv.baseUrl).post('/api/auth/login', { email: v.email, password: v.password });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    // Otra cuenta no queda bloqueada
    const other = await client(srv.baseUrl).post('/api/auth/login', { email: creds.email, password: creds.password });
    assert.equal(other.status, 200);
  });
});

test('sesiones', async (t) => {
  await t.test('cerrar sesión invalida la sesión en el servidor', async () => {
    const { c } = await registerUser(srv.baseUrl);
    const oldCookie = c.cookie;
    const r = await c.post('/api/auth/logout');
    assert.equal(r.status, 204);
    assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
    const reuse = client(srv.baseUrl);
    reuse.cookie = oldCookie; // alguien que hubiera copiado la cookie
    assert.equal((await reuse.get('/api/auth/me')).status, 401);
  });

  await t.test('sesión caducada → 401', async () => {
    const { c, user } = await registerUser(srv.baseUrl);
    srv.app.db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run(Date.now() - 1000, user.id);
    assert.equal((await c.get('/api/movements')).status, 401);
  });

  await t.test('cookie manipulada o basura → 401', async () => {
    const c = client(srv.baseUrl);
    for (const cookie of ['sid=inventada', 'sid=', `sid=${'x'.repeat(500)}`, 'otra=1']) {
      c.cookie = cookie;
      assert.equal((await c.get('/api/auth/me')).status, 401, cookie);
    }
  });
});

test('cambio de contraseña', async () => {
  const { c, creds } = await registerUser(srv.baseUrl);
  const otherDevice = client(srv.baseUrl);
  await otherDevice.post('/api/auth/login', { email: creds.email, password: creds.password });
  assert.equal((await otherDevice.get('/api/auth/me')).status, 200);

  const wrong = await c.put('/api/account/password', { current_password: 'no-es-1234', new_password: 'nueva-clave-9' });
  assert.equal(wrong.status, 400);
  assert.ok(wrong.data.error.fields.current_password);
  const weak = await c.put('/api/account/password', { current_password: creds.password, new_password: 'corta' });
  assert.equal(weak.status, 400);

  const ok = await c.put('/api/account/password', { current_password: creds.password, new_password: 'nueva-clave-9' });
  assert.equal(ok.status, 204);
  assert.equal((await c.get('/api/auth/me')).status, 200, 'la sesión actual sigue abierta');
  assert.equal((await otherDevice.get('/api/auth/me')).status, 401, 'las demás sesiones se cierran');
  assert.equal((await client(srv.baseUrl).post('/api/auth/login', { email: creds.email, password: creds.password })).status, 401);
  assert.equal((await client(srv.baseUrl).post('/api/auth/login', { email: creds.email, password: 'nueva-clave-9' })).status, 200);
});

test('eliminar cuenta borra todos sus datos', async () => {
  const { c, creds, user } = await registerUser(srv.baseUrl);
  await c.post('/api/movements', movement());
  await c.post('/api/invoices', invoice());
  const wrong = await c.del('/api/account', { password: 'otra-clave-1' });
  assert.equal(wrong.status, 400);
  assert.equal((await c.get('/api/auth/me')).status, 200);

  const r = await c.del('/api/account', { password: creds.password });
  assert.equal(r.status, 204);
  const db = srv.app.db;
  for (const table of ['users', 'sessions', 'settings', 'movements', 'invoices']) {
    const col = table === 'users' ? 'id' : 'user_id';
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`).get(user.id).n, 0, table);
  }
  assert.equal((await c.get('/api/auth/me')).status, 401);
  assert.equal((await client(srv.baseUrl).post('/api/auth/login', { email: creds.email, password: creds.password })).status, 401);
});
