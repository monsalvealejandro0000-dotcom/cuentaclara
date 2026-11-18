// Cargo opcional del saludo del Dashboard («Hola CEO Alejandro Monsalve»).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, registerUser } from './helpers.js';

let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.destroy());

const settingsOf = async (c) => (await c.get('/api/settings')).data.settings;

test('el cargo se guarda, se recorta y se conserva al guardar otras tarjetas', async () => {
  const { c } = await registerUser(srv.baseUrl);
  assert.equal((await settingsOf(c)).title, '', 'una cuenta nueva no tiene cargo');

  const s = await settingsOf(c);
  let r = await c.put('/api/settings', { ...s, title: '  CEO  ' });
  assert.equal(r.status, 200);
  assert.equal(r.data.settings.title, 'CEO');

  // La tarjeta de moneda y la de datos tributarios no envían el cargo: no se pierde.
  const { title, ...withoutTitle } = r.data.settings;
  r = await c.put('/api/settings', { ...withoutTitle, currency: 'USD', business_name: 'Mi negocio' });
  assert.equal(r.status, 200);
  assert.equal(r.data.settings.title, 'CEO');
  assert.equal(r.data.settings.currency, 'USD');

  // Se puede quitar.
  r = await c.put('/api/settings', { ...r.data.settings, title: '' });
  assert.equal(r.data.settings.title, '');
});

test('el cargo se valida y es de cada usuario', async () => {
  const a = await registerUser(srv.baseUrl);
  const b = await registerUser(srv.baseUrl);
  const s = await settingsOf(a.c);
  for (const bad of ['x'.repeat(41), 42, ['CEO']]) {
    const r = await a.c.put('/api/settings', { ...s, title: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.ok(r.data.error.fields.title);
  }
  assert.equal((await a.c.put('/api/settings', { ...s, title: 'x'.repeat(40) })).status, 200);
  assert.equal((await settingsOf(b.c)).title, '', 'el cargo de otro usuario no cambia');
});
