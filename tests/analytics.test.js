// Analítica del panel (AnalyticsBento). Valores esperados calculados a mano.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, registerUser, client, movement, expense } from './helpers.js';

const SS = 'Seguridad social (salud y pensión)';
let srv;
let c;
before(async () => {
  srv = await startServer();
  ({ c } = await registerUser(srv.baseUrl));
  const add = async (body) => assert.equal((await c.post('/api/movements', body)).status, 201);
  await add(movement({ date: '2026-11-05', base_cents: 100000, irpf_rate: 15 })); // ingreso nov 2026
  await add(expense({ date: '2026-11-10', base_cents: 20000 })); // Software, deducible
  await add(expense({ date: '2026-10-02', category: SS, concept: 'Aportes PILA', base_cents: 29300, vat_rate: 0 }));
  await add(expense({ date: '2026-08-15', category: 'Marketing', concept: 'Anuncios', base_cents: 10000, vat_rate: 19, deductible: false })); // costo 11900
  await add(movement({ date: '2025-11-20', base_cents: 50000, irpf_rate: 0 })); // ingreso nov 2025
});
after(() => srv.destroy());

const get = async (month) => {
  const r = await c.get(`/api/analytics?month=${month}`);
  assert.equal(r.status, 200);
  return r.data;
};

test('serie de ingresos de los últimos 12 meses', async () => {
  const a = await get('2026-11');
  assert.equal(a.revenue.length, 12);
  assert.deepEqual(a.revenue[0], { month: '2025-12', income: 0 });
  assert.deepEqual(a.revenue[11], { month: '2026-11', income: 100000 });
});

test('ingresos y gastos por mes de este año y del anterior', async () => {
  const { monthly } = await get('2026-11');
  assert.equal(monthly.current.length, 12);
  assert.deepEqual(
    [monthly.current[10].income, monthly.current[10].expenses, monthly.current[10].profit, monthly.current[10].incomeCount],
    [100000, 20000, 80000, 1],
  );
  assert.equal(monthly.current[9].expenses, 29300);
  assert.equal(monthly.current[7].expenses, 11900, 'el IVA de un gasto no deducible es costo');
  assert.equal(monthly.previous[10].income, 50000);
});

test('periodos: mes, trimestre y año hasta la fecha con su comparación', async () => {
  const { periods } = await get('2026-11');
  const [mes, trimestre, anio] = periods;
  assert.deepEqual([mes.key, mes.from, mes.to, mes.expenses, mes.previous.expenses], ['month', '2026-11-01', '2026-11-30', 20000, 29300]);
  assert.deepEqual([trimestre.from, trimestre.to, trimestre.expenses, trimestre.previous.from, trimestre.previous.expenses], ['2026-10-01', '2026-12-31', 49300, '2026-07-01', 11900]);
  assert.deepEqual([anio.from, anio.to, anio.income, anio.expenses, anio.profit], ['2026-01-01', '2026-11-30', 100000, 61200, 38800]);
  assert.deepEqual([anio.previous.from, anio.previous.to, anio.previous.income], ['2025-01-01', '2025-11-30', 50000]);
});

test('primer trimestre se compara con el último del año anterior', async () => {
  const { periods } = await get('2026-02');
  assert.deepEqual([periods[1].previous.from, periods[1].previous.to], ['2025-10-01', '2025-12-31']);
});

test('gastos por categoría en cada periodo', async () => {
  const { expenseCategories } = await get('2026-11');
  const by = Object.fromEntries(expenseCategories.map((x) => [x.name, x.values]));
  assert.deepEqual(by['Software y suscripciones'], [20000, 20000, 20000]);
  assert.deepEqual(by[SS], [0, 29300, 29300]);
  assert.deepEqual(by.Marketing, [0, 0, 11900]);
  assert.deepEqual(by.Arriendo, [0, 0, 0]);
});

test('estacionalidad: ingresos por mes de cada año con datos', async () => {
  const { seasonality } = await get('2026-11');
  assert.deepEqual(seasonality.map((y) => y.year), [2026, 2025]);
  assert.equal(seasonality[0].values[10], 100000);
  assert.equal(seasonality[0].total, 100000);
  assert.equal(seasonality[0].activeMonths, 1);
  assert.equal(seasonality[1].values[10], 50000);
});

test('sin datos del año anterior solo devuelve el año actual', async () => {
  const { c: other } = await registerUser(srv.baseUrl);
  const r = await other.get('/api/analytics?month=2026-11');
  assert.equal(r.data.seasonality.length, 1);
  assert.ok(r.data.monthly.current.every((p) => p.income === 0 && p.expenses === 0), 'no ve datos de otro usuario');
});

test('errores y permisos', async () => {
  assert.equal((await c.get('/api/analytics?month=2026-13')).status, 400);
  assert.equal((await client(srv.baseUrl).get('/api/analytics')).status, 401);
});
