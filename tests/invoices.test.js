// Facturas: numeración, ingreso vinculado y sincronización con Movimientos y el Dashboard.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, registerUser, invoice } from './helpers.js';

let srv;
let c;
before(async () => {
  srv = await startServer();
  ({ c } = await registerUser(srv.baseUrl));
});
after(() => srv.destroy());

const summary = async (m = '2026-11') => (await c.get(`/api/summary?month=${m}`)).data;

test('ciclo completo de una factura', async (t) => {
  let inv;
  await t.test('crear: número correlativo e ingreso vinculado', async () => {
    const r = await c.post('/api/invoices', invoice());
    assert.equal(r.status, 201);
    inv = r.data.invoice;
    assert.equal(inv.number, '2026-001');
    assert.equal(inv.status, 'pendiente');
    assert.deepEqual(inv.amounts, { base: 250000, vat: 47500, irpf: 27500, total: 270000 }); // IVA 19 %, retención 11 %
    const m = (await c.get(`/api/movements/${inv.movement_id}`)).data.movement;
    assert.equal(m.type, 'ingreso');
    assert.equal(m.date, '2026-11-03');
    assert.equal(m.base_cents, 250000);
    assert.equal(m.invoice_number, '2026-001');
    const s = await summary();
    assert.equal(s.monthSummary.income, 250000);
    assert.deepEqual(s.pendingInvoices, { count: 1, total_cents: 270000 });
  });

  await t.test('editar sincroniza el ingreso', async () => {
    const r = await c.put(`/api/invoices/${inv.id}`, invoice({ base_cents: 300000, issue_date: '2026-10-15', due_date: null }));
    assert.equal(r.status, 200);
    assert.equal(r.data.invoice.number, '2026-001', 'el número no cambia');
    const m = (await c.get(`/api/movements/${inv.movement_id}`)).data.movement;
    assert.equal(m.base_cents, 300000);
    assert.equal(m.date, '2026-10-15');
    assert.equal((await summary('2026-11')).monthSummary.income, 0);
    assert.equal((await summary('2026-10')).monthSummary.income, 300000);
  });

  await t.test('no se puede cambiar de año (rompería la numeración)', async () => {
    const r = await c.put(`/api/invoices/${inv.id}`, invoice({ issue_date: '2027-01-02', due_date: null }));
    assert.equal(r.status, 400);
    assert.match(r.data.error.fields.issue_date, /no se puede cambiar de año/);
  });

  await t.test('marcar cobrada / pendiente', async () => {
    const paid = await c.put(`/api/invoices/${inv.id}/status`, { status: 'cobrada', paid_date: '2026-11-20' });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.invoice.paid_date, '2026-11-20');
    assert.equal((await summary()).pendingInvoices.count, 0);
    const early = await c.put(`/api/invoices/${inv.id}/status`, { status: 'cobrada', paid_date: '2026-01-01' });
    assert.equal(early.status, 400, 'cobro anterior a la emisión');
    const back = await c.put(`/api/invoices/${inv.id}/status`, { status: 'pendiente' });
    assert.equal(back.data.invoice.paid_date, null);
  });

  await t.test('eliminar borra también su ingreso', async () => {
    assert.equal((await c.del(`/api/invoices/${inv.id}`)).status, 204);
    assert.equal((await c.get(`/api/movements/${inv.movement_id}`)).status, 404);
    assert.equal((await summary('2026-10')).monthSummary.income, 0);
  });
});

test('numeración por año', async () => {
  const n = async (date) => (await c.post('/api/invoices', invoice({ issue_date: date, due_date: null }))).data.invoice.number;
  assert.equal(await n('2026-05-01'), '2026-001');
  assert.equal(await n('2026-05-02'), '2026-002');
  assert.equal(await n('2027-01-10'), '2027-001');
  assert.equal(await n('2026-12-31'), '2026-003');
  const list = (await c.get('/api/invoices?year=2026')).data;
  assert.deepEqual(list.invoices.map((i) => i.number), ['2026-003', '2026-002', '2026-001']);
  assert.deepEqual(list.years, [2027, 2026]);
});

test('validación de facturas', async () => {
  const cases = [
    [{}, ['client_name', 'issue_date', 'concept', 'base_cents', 'vat_rate', 'irpf_rate']],
    [invoice({ due_date: '2026-10-01' }), ['due_date']],
    [invoice({ status: 'regalada' }), ['status']],
    [invoice({ client_nif: 'x'.repeat(21) }), ['client_nif']],
    [invoice({ base_cents: 0 }), ['base_cents']],
  ];
  for (const [body, fields] of cases) {
    const r = await c.post('/api/invoices', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    for (const f of fields) assert.ok(r.data.error.fields[f], `falta ${f}`);
  }
});
