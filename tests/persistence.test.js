// Los datos se guardan en un fichero SQLite en disco y sobreviven a un reinicio del servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { startServer, registerUser, client, movement, expense, invoice } from './helpers.js';

test('los datos sobreviven a reiniciar el servidor', async () => {
  const first = await startServer();
  const { c, creds } = await registerUser(first.baseUrl);
  const inc = await c.post('/api/movements', movement());
  const exp = await c.post('/api/movements', expense());
  const inv = await c.post('/api/invoices', invoice());
  const settings = (await c.get('/api/settings')).data.settings;
  await c.put('/api/settings', { ...settings, business_name: 'Mi Negocio', nif: '12345678z' });
  const before = (await c.get('/api/summary?month=2026-11')).data.monthSummary;
  const sessionCookie = c.cookie;
  await first.stop(); // cierra el servidor y la conexión a la BD

  // El fichero existe en disco y contiene las filas
  assert.ok(fs.statSync(first.dbPath).size > 0);
  const raw = new DatabaseSync(first.dbPath, { readOnly: true });
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM movements').get().n, 3); // 2 + ingreso de la factura
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM invoices').get().n, 1);
  raw.close();

  // Nuevo proceso de servidor sobre el mismo fichero
  const second = await startServer({ dir: first.tmpDir });
  try {
    // La sesión sigue siendo válida tras el reinicio
    const sameSession = client(second.baseUrl);
    sameSession.cookie = sessionCookie;
    assert.equal((await sameSession.get('/api/auth/me')).status, 200);

    // Y se puede volver a iniciar sesión con la misma contraseña
    const c2 = client(second.baseUrl);
    const login = await c2.post('/api/auth/login', { email: creds.email, password: creds.password });
    assert.equal(login.status, 200);

    const list = (await c2.get('/api/movements')).data.movements;
    assert.deepEqual(list.map((m) => m.id).sort(), [inc.data.movement.id, exp.data.movement.id, inv.data.invoice.movement_id].sort());
    const after = (await c2.get('/api/summary?month=2026-11')).data.monthSummary;
    assert.deepEqual(after, before);
    assert.equal((await c2.get('/api/settings')).data.settings.nif, '12345678Z');
    assert.equal((await c2.get(`/api/invoices/${inv.data.invoice.id}`)).data.invoice.number, '2026-001');
  } finally {
    await second.destroy();
  }
});

test('las migraciones no se reaplican ni borran datos al reiniciar', async () => {
  const first = await startServer();
  const { c } = await registerUser(first.baseUrl);
  await c.post('/api/movements', movement());
  await first.stop();
  const second = await startServer({ dir: first.tmpDir });
  await second.stop();
  const third = await startServer({ dir: first.tmpDir });
  try {
    const raw = new DatabaseSync(third.dbPath, { readOnly: true });
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM movements').get().n, 1);
    const versions = raw.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version);
    assert.equal(new Set(versions).size, versions.length);
    raw.close();
  } finally {
    await third.destroy();
  }
});
