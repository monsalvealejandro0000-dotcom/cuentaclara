// Moneda local configurable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer, registerUser, client, movement } from './helpers.js';
import { CURRENCIES } from '../server/currencies.js';
import { openDb } from '../server/db.js';

let srv;
let c;
before(async () => {
  srv = await startServer();
  ({ c } = await registerUser(srv.baseUrl));
});
after(() => srv.destroy());

const settings = async () => (await c.get('/api/settings')).data.settings;

test('la lista de monedas es válida y la conocen los datos internacionales', () => {
  assert.equal(new Set(CURRENCIES).size, CURRENCIES.length, 'sin duplicados');
  const supported = new Set(Intl.supportedValuesOf('currency'));
  const names = new Intl.DisplayNames('es', { type: 'currency' });
  for (const code of CURRENCIES) {
    assert.match(code, /^[A-Z]{3}$/);
    assert.ok(supported.has(code), `${code} no reconocida`);
    assert.notEqual(names.of(code), code, `${code} sin nombre en español`);
  }
  for (const code of ['EUR', 'USD', 'MXN', 'COP', 'ARS', 'CLP', 'PEN', 'JPY', 'GBP']) assert.ok(CURRENCIES.includes(code), code);
  for (const retired of ['BGN', 'HRK', 'ANG', 'SLL', 'ZWL', 'CUC', 'VEF']) assert.ok(!CURRENCIES.includes(retired), `${retired} está retirada`);
});

test('/api/meta publica la lista', async () => {
  const meta = (await client(srv.baseUrl).get('/api/meta')).data;
  assert.deepEqual(meta.currencies, CURRENCIES);
});

test('una cuenta nueva usa pesos colombianos', async () => {
  assert.equal((await settings()).currency, 'COP');
});

test('cambiar la moneda se guarda y no convierte los importes', async () => {
  const m = (await c.post('/api/movements', movement({ base_cents: 123456 }))).data.movement;
  const r = await c.put('/api/settings', { ...(await settings()), currency: 'MXN' });
  assert.equal(r.status, 200);
  assert.equal(r.data.settings.currency, 'MXN');
  assert.equal((await settings()).currency, 'MXN');
  assert.equal((await c.get(`/api/movements/${m.id}`)).data.movement.base_cents, 123456, 'mismo importe, solo cambia el símbolo');
});

test('sin el campo moneda se conserva la actual', async () => {
  const { currency, ...rest } = await settings();
  assert.equal(currency, 'MXN');
  assert.equal((await c.put('/api/settings', { ...rest, business_name: 'Otro nombre' })).status, 200);
  assert.equal((await settings()).currency, 'MXN');
});

test('monedas no válidas → 400', async () => {
  const s = await settings();
  for (const bad of ['XXX', 'eur', 'EURO', 'BGN', 123, '']) {
    const r = await c.put('/api/settings', { ...s, currency: bad });
    if (bad === '') {
      assert.equal(r.status, 200, 'vacío = conservar la actual');
      assert.equal(r.data.settings.currency, 'MXN');
      continue;
    }
    assert.equal(r.status, 400, String(bad));
    assert.ok(r.data.error.fields.currency);
  }
  assert.equal((await settings()).currency, 'MXN');
});

test('cada usuario tiene su propia moneda', async () => {
  const { c: other } = await registerUser(srv.baseUrl);
  assert.equal((await other.get('/api/settings')).data.settings.currency, 'COP');
});

test('la migración añade la moneda (EUR) a una base de datos existente sin perder datos', async () => {
  const s = await startServer();
  const { c: u } = await registerUser(s.baseUrl);
  await u.post('/api/movements', movement());
  await s.stop();
  // Simula una BD anterior a la migración 003
  const raw = new DatabaseSync(s.dbPath);
  raw.exec("ALTER TABLE settings DROP COLUMN currency; DELETE FROM schema_migrations WHERE version = '003_currency.sql';");
  raw.close();
  const db = openDb(s.dbPath);
  assert.equal(db.prepare('SELECT currency FROM settings').get().currency, 'EUR');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movements').get().n, 1);
  db.close();
  await s.destroy();
});
