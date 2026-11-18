// Fase 5: permisos. Sin sesión no hay acceso; un usuario nunca ve ni toca datos de otro.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, registerUser, movement, invoice } from './helpers.js';

let srv;
let a;
let b;
let aMovement;
let aInvoice;
before(async () => {
  srv = await startServer();
  a = (await registerUser(srv.baseUrl)).c;
  b = (await registerUser(srv.baseUrl)).c;
  aMovement = (await a.post('/api/movements', movement({ concept: 'Dato privado de A' }))).data.movement;
  aInvoice = (await a.post('/api/invoices', invoice({ client_name: 'Cliente de A' }))).data.invoice;
  const settings = (await a.get('/api/settings')).data.settings;
  await a.put('/api/settings', { ...settings, business_name: 'Negocio de A', nif: '11111111H' });
});
after(() => srv.destroy());

test('sin sesión: todas las rutas protegidas responden 401', async () => {
  const anon = client(srv.baseUrl);
  const routes = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/movements'],
    ['POST', '/api/movements'],
    ['GET', `/api/movements/${aMovement.id}`],
    ['PUT', `/api/movements/${aMovement.id}`],
    ['DELETE', `/api/movements/${aMovement.id}`],
    ['GET', '/api/invoices'],
    ['POST', '/api/invoices'],
    ['GET', `/api/invoices/${aInvoice.id}`],
    ['PUT', `/api/invoices/${aInvoice.id}`],
    ['PUT', `/api/invoices/${aInvoice.id}/status`],
    ['DELETE', `/api/invoices/${aInvoice.id}`],
    ['GET', '/api/settings'],
    ['PUT', '/api/settings'],
    ['GET', '/api/summary'],
    ['PUT', '/api/account/password'],
    ['DELETE', '/api/account'],
    ['GET', '/api/events'],
  ];
  for (const [method, url] of routes) {
    const r = await anon.raw(method, url, method === 'GET' ? undefined : {});
    assert.equal(r.status, 401, `${method} ${url}`);
    assert.equal(r.data.error.code, 'UNAUTHENTICATED');
  }
  // Rutas públicas
  assert.equal((await anon.get('/api/meta')).status, 200);
});

test('un usuario no puede leer, editar ni borrar movimientos de otro', async () => {
  assert.equal((await b.get(`/api/movements/${aMovement.id}`)).status, 404);
  assert.equal((await b.put(`/api/movements/${aMovement.id}`, movement({ concept: 'Hackeado' }))).status, 404);
  assert.equal((await b.del(`/api/movements/${aMovement.id}`)).status, 404);
  const list = (await b.get('/api/movements')).data.movements;
  assert.ok(!list.some((m) => m.concept === 'Dato privado de A'));
  // El de A sigue intacto
  assert.equal((await a.get(`/api/movements/${aMovement.id}`)).data.movement.concept, 'Dato privado de A');
});

test('un usuario no puede leer, editar, cobrar ni borrar facturas de otro', async () => {
  assert.equal((await b.get(`/api/invoices/${aInvoice.id}`)).status, 404);
  assert.equal((await b.put(`/api/invoices/${aInvoice.id}`, invoice())).status, 404);
  assert.equal((await b.put(`/api/invoices/${aInvoice.id}/status`, { status: 'cobrada' })).status, 404);
  assert.equal((await b.del(`/api/invoices/${aInvoice.id}`)).status, 404);
  assert.deepEqual((await b.get('/api/invoices')).data.invoices, []);
  const inv = (await a.get(`/api/invoices/${aInvoice.id}`)).data.invoice;
  assert.equal(inv.status, 'pendiente');
  assert.equal(inv.client_name, 'Cliente de A');
});

test('resumen, configuración y numeración son independientes por usuario', async () => {
  const sb = (await b.get('/api/summary?month=2026-11')).data;
  assert.equal(sb.hasMovements, false);
  assert.equal(sb.monthSummary.income, 0);
  assert.equal(sb.pendingInvoices.count, 0);
  assert.equal((await b.get('/api/settings')).data.settings.business_name, '');
  // B empieza su propia numeración
  const bInv = (await b.post('/api/invoices', invoice())).data.invoice;
  assert.equal(bInv.number, '2026-001');
});

test('ids manipulados no dan acceso (404, nunca 500)', async () => {
  for (const id of ['abc', '-1', '0', '1.5', '99999999999', '1%20OR%201=1', "1'--"]) {
    const r = await b.get(`/api/movements/${id}`);
    assert.equal(r.status, 404, id);
  }
});

test('un ingreso generado por factura no se puede editar ni borrar directamente', async () => {
  const linkedId = aInvoice.movement_id;
  const put = await a.put(`/api/movements/${linkedId}`, movement({ base_cents: 1 }));
  assert.equal(put.status, 409);
  assert.equal(put.data.error.code, 'LINKED_TO_INVOICE');
  assert.equal((await a.del(`/api/movements/${linkedId}`)).status, 409);
});

test('protección CSRF: peticiones desde otro origen se rechazan', async () => {
  const evil = await a.post('/api/movements', movement(), { origin: 'https://sitio-malicioso.example' });
  assert.equal(evil.status, 403);
  assert.equal(evil.data.error.code, 'FORBIDDEN_ORIGIN');
  const crossSite = await a.del(`/api/movements/${aMovement.id}`, undefined, { 'sec-fetch-site': 'cross-site' });
  assert.equal(crossSite.status, 403);
  assert.equal((await a.get(`/api/movements/${aMovement.id}`)).status, 200, 'no se borró');
  const same = await a.post('/api/movements', movement(), { origin: srv.baseUrl });
  assert.equal(same.status, 201);
});
