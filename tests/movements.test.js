// Fase 3: crear, editar y eliminar movimientos contra el servidor y la BD reales,
// comprobando que los balances del Dashboard se recalculan tras cada operación.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, registerUser, movement, expense } from './helpers.js';

let srv;
let c;
before(async () => {
  srv = await startServer();
  ({ c } = await registerUser(srv.baseUrl));
});
after(() => srv.destroy());

const summary = async (month = '2026-11') => {
  const r = await c.get(`/api/summary?month=${month}`);
  assert.equal(r.status, 200);
  return r.data;
};

test('una cuenta nueva empieza vacía (sin datos de ejemplo)', async () => {
  const list = await c.get('/api/movements');
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.movements, []);
  const s = await summary();
  assert.equal(s.hasMovements, false);
  assert.equal(s.monthSummary.income, 0);
  assert.equal(s.monthSummary.totalReserve, 0);
});

test('CRUD completo con recálculo de balances', async (t) => {
  let incomeId;
  let expenseId;

  await t.test('crear ingreso', async () => {
    const r = await c.post('/api/movements', movement());
    assert.equal(r.status, 201);
    const m = r.data.movement;
    incomeId = m.id;
    assert.equal(m.type, 'ingreso');
    assert.equal(m.concept, 'Proyecto web');
    assert.deepEqual(m.amounts, { base: 100000, vat: 19000, irpf: 10000, total: 109000 }); // IVA 19 %, retención 10 %
    const s = await summary();
    assert.equal(s.hasMovements, true);
    assert.equal(s.monthSummary.income, 100000);
    assert.equal(s.monthSummary.profit, 100000);
    assert.equal(s.monthSummary.vatReserve, 19000);
    assert.equal(s.monthSummary.rentaReserve, 0); // muy por debajo de 1.090 UVT
    assert.equal(s.monthSummary.totalReserve, 19000);
  });

  await t.test('crear gasto y recalcular', async () => {
    const r = await c.post('/api/movements', expense());
    assert.equal(r.status, 201);
    expenseId = r.data.movement.id;
    assert.equal(r.data.movement.amounts.irpf, 0);
    const s = (await summary()).monthSummary;
    assert.equal(s.expenses, 20000);
    assert.equal(s.profit, 80000);
    assert.equal(s.vatReserve, 15200); // 19000 − 3800
    assert.equal(s.totalReserve, 15200);
    assert.equal(s.availableAfterTaxes, 70000); // caja 109000 − 23800 = 85200, menos 15200
  });

  await t.test('leer por id y listar', async () => {
    const one = await c.get(`/api/movements/${incomeId}`);
    assert.equal(one.status, 200);
    assert.equal(one.data.movement.id, incomeId);
    const list = await c.get('/api/movements?from=2026-11-01&to=2026-11-30');
    assert.equal(list.data.movements.length, 2);
    assert.equal(list.data.totals.profit, 80000);
  });

  await t.test('editar gasto y recalcular', async () => {
    const r = await c.put(`/api/movements/${expenseId}`, expense({ base_cents: 30000, concept: 'Licencia anual' }));
    assert.equal(r.status, 200);
    assert.equal(r.data.movement.concept, 'Licencia anual');
    assert.equal(r.data.movement.base_cents, 30000);
    const s = (await summary()).monthSummary;
    assert.equal(s.expenses, 30000);
    assert.equal(s.profit, 70000);
    assert.equal(s.vatReserve, 13300); // 19000 − 5700
    assert.equal(s.totalReserve, 13300);
  });

  await t.test('editar fecha mueve el ingreso de mes', async () => {
    const r = await c.put(`/api/movements/${incomeId}`, movement({ date: '2026-10-20' }));
    assert.equal(r.status, 200);
    const nov = (await summary('2026-11')).monthSummary;
    const oct = (await summary('2026-10')).monthSummary;
    assert.equal(nov.income, 0);
    assert.equal(nov.profit, -30000);
    assert.equal(oct.income, 100000);
    const ytd = (await summary('2026-11')).yearToDate;
    assert.equal(ytd.profit, 70000);
  });

  await t.test('marcar gasto como no deducible cambia el cálculo', async () => {
    const r = await c.put(`/api/movements/${expenseId}`, expense({ base_cents: 30000, deductible: false }));
    assert.equal(r.status, 200);
    assert.equal(r.data.movement.deductible, false);
    const s = (await summary()).monthSummary;
    assert.equal(s.expenses, 35700); // base + IVA no recuperable
    assert.equal(s.vatInput, 0);
  });

  await t.test('dejar de ser responsable de IVA recalcula', async () => {
    await c.put(`/api/movements/${expenseId}`, expense({ base_cents: 30000, deductible: true }));
    const settings = (await c.get('/api/settings')).data.settings;
    const r = await c.put('/api/settings', { ...settings, vat_responsible: false });
    assert.equal(r.status, 200);
    assert.equal(r.data.settings.vat_responsible, false);
    const s = (await summary()).monthSummary;
    assert.equal(s.vatInput, 0, 'sin IVA descontable');
    assert.equal(s.expenses, 35700, 'el IVA pagado es costo');
    assert.equal(s.deductibleExpenses, 35700);
    assert.equal((await summary()).tax.vatResponsible, false);
    await c.put('/api/settings', { ...settings, vat_responsible: true });
    assert.equal((await summary()).monthSummary.vatInput, 5700);
  });

  await t.test('eliminar gasto y recalcular', async () => {
    const r = await c.del(`/api/movements/${expenseId}`);
    assert.equal(r.status, 204);
    assert.equal((await c.get(`/api/movements/${expenseId}`)).status, 404);
    assert.equal((await c.del(`/api/movements/${expenseId}`)).status, 404);
    const s = (await summary()).monthSummary;
    assert.equal(s.expenses, 0);
    assert.equal(s.profit, 0);
    assert.equal(s.count, 0);
  });

  await t.test('eliminar el último movimiento deja la cuenta vacía', async () => {
    assert.equal((await c.del(`/api/movements/${incomeId}`)).status, 204);
    const s = await summary();
    assert.equal(s.hasMovements, false);
    assert.equal(s.yearToDate.income, 0);
  });
});

test('filtros de la lista', async () => {
  await c.post('/api/movements', movement({ concept: 'Diseño de logo', date: '2026-09-01' }));
  await c.post('/api/movements', expense({ concept: 'Billete de tren', category: 'Transporte y viáticos', date: '2026-09-02' }));
  await c.post('/api/movements', expense({ concept: '100% descuento_raro', date: '2026-09-03' }));
  const byType = await c.get('/api/movements?type=gasto&from=2026-09-01&to=2026-09-30');
  assert.equal(byType.data.movements.length, 2);
  const byCat = await c.get(`/api/movements?category=${encodeURIComponent('Transporte y viáticos')}`);
  assert.deepEqual(byCat.data.movements.map((m) => m.concept), ['Billete de tren']);
  const byText = await c.get('/api/movements?q=logo');
  assert.deepEqual(byText.data.movements.map((m) => m.concept), ['Diseño de logo']);
  // % y _ se buscan literalmente, no como comodines
  const literal = await c.get(`/api/movements?q=${encodeURIComponent('0% d')}`);
  assert.deepEqual(literal.data.movements.map((m) => m.concept), ['100% descuento_raro']);
  assert.equal((await c.get('/api/movements?q=%25')).data.movements.length, 1);
  assert.equal((await c.get('/api/movements?from=2026-13-01')).status, 400);
});

test('validación de movimientos', async () => {
  const cases = [
    [{}, ['type', 'date', 'concept', 'base_cents', 'vat_rate']],
    [movement({ type: 'otro' }), ['type']],
    [movement({ date: '2026-02-30' }), ['date']],
    [movement({ concept: '   ' }), ['concept']],
    [movement({ concept: 'x'.repeat(201) }), ['concept']],
    [movement({ category: 'Arriendo' }), ['category']], // categoría de gasto en un ingreso
    [movement({ base_cents: -500 }), ['base_cents']],
    [movement({ base_cents: 0 }), ['base_cents']],
    [movement({ base_cents: 10.5 }), ['base_cents']],
    [movement({ base_cents: '1000' }), ['base_cents']],
    [movement({ vat_rate: 150 }), ['vat_rate']],
    [movement({ irpf_rate: -1 }), ['irpf_rate']],
    [expense({ deductible: 'sí' }), ['deductible']],
  ];
  for (const [body, fields] of cases) {
    const r = await c.post('/api/movements', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.data.error.code, 'VALIDATION');
    for (const f of fields) assert.ok(r.data.error.fields[f], `falta error en ${f} para ${JSON.stringify(body)}`);
  }
  // Editar con datos no válidos no modifica nada
  const ok = await c.post('/api/movements', movement({ concept: 'Intacto' }));
  const bad = await c.put(`/api/movements/${ok.data.movement.id}`, movement({ base_cents: -1 }));
  assert.equal(bad.status, 400);
  assert.equal((await c.get(`/api/movements/${ok.data.movement.id}`)).data.movement.base_cents, 100000);
});
