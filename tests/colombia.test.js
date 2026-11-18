// Impuestos de Colombia de punta a punta: configuración, API del Dashboard y migración de datos.
// Valores esperados calculados a mano con la UVT 2026 ($52.374).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer, registerUser, client, movement, expense } from './helpers.js';
import { openDb } from '../server/db.js';

const COP = (pesos) => Math.round(pesos * 100);
const SS = 'Seguridad social (salud y pensión)';

let srv;
let c;
before(async () => {
  srv = await startServer();
  ({ c } = await registerUser(srv.baseUrl));
});
after(() => srv.destroy());

const settings = async () => (await c.get('/api/settings')).data.settings;
const summary = async (m) => (await c.get(`/api/summary?month=${m}`)).data;

test('una cuenta nueva empieza con los valores de Colombia', async () => {
  const s = await settings();
  assert.equal(s.default_vat_rate, 19);
  assert.equal(s.default_irpf_rate, 10, 'retención en la fuente por honorarios');
  assert.equal(s.vat_responsible, true);
  assert.equal(s.vat_period, 'cuatrimestral');
  assert.equal(s.currency, 'COP');
  assert.equal('irpf_reserve_rate' in s, false, 'ya no hay % fijo de reserva');
});

test('/api/meta publica las tarifas y la UVT', async () => {
  const meta = (await client(srv.baseUrl).get('/api/meta')).data;
  assert.deepEqual(meta.vatRates, [19, 5, 0]);
  assert.deepEqual(meta.irpfRates, [10, 11, 6, 4, 3.5, 2.5, 0]);
  assert.equal(meta.tax.country, 'CO');
  assert.equal(meta.tax.vatNotResponsibleUvt, 3500);
  assert.equal(meta.tax.vatBimonthlyUvt, 92000);
  assert.equal(meta.tax.exemptCapUvt, 790);
  assert.equal(meta.tax.rentaTable.at(-1).to, null);
  assert.ok(meta.categories.gasto.includes(SS));
  assert.ok(!meta.categories.gasto.includes('Cuota de autónomos'));
});

test('validación de la configuración de IVA', async () => {
  const s = await settings();
  for (const [field, bad] of [['vat_period', 'mensual'], ['vat_period', 3], ['vat_responsible', 'sí'], ['vat_responsible', 1]]) {
    const r = await c.put('/api/settings', { ...s, [field]: bad });
    assert.equal(r.status, 400, `${field}=${bad}`);
    assert.ok(r.data.error.fields[field]);
  }
  // Sin los campos de IVA se conservan
  const { vat_responsible, vat_period, ...rest } = s;
  const r = await c.put('/api/settings', { ...rest, business_name: 'Mi negocio' });
  assert.equal(r.status, 200);
  assert.equal(r.data.settings.vat_responsible, true);
  assert.equal(r.data.settings.vat_period, 'cuatrimestral');
});

test('Dashboard: IVA por periodo y renta acumulada con la tabla del art. 241', async () => {
  const add = async (body) => assert.equal((await c.post('/api/movements', body)).status, 201);
  await add(movement({ date: '2026-01-15', base_cents: COP(60_000_000), vat_rate: 19, irpf_rate: 4 }));
  await add(movement({ date: '2026-02-10', base_cents: COP(60_000_000), vat_rate: 19, irpf_rate: 0 }));
  await add(expense({ date: '2026-02-20', category: SS, concept: 'Aportes PILA', base_cents: COP(4_000_000), vat_rate: 0 }));
  await add(expense({ date: '2026-03-05', base_cents: COP(2_000_000), vat_rate: 19 }));

  const feb = await summary('2026-02');
  assert.equal(feb.tax.country, 'CO');
  assert.deepEqual(feb.tax.uvt, { year: 2026, pesos: 52374, cents: 5237400, official: true });
  assert.deepEqual(feb.tax.rentaFiling, { from: '2027-08', to: '2027-10' });
  // Renta hasta febrero: (120M − 4M) − 25 % = 87M → 5.683.344,60 − 2,4M retenidos
  assert.equal(feb.renta.method, 'exenta25');
  assert.equal(feb.renta.base, COP(87_000_000));
  assert.equal(feb.renta.tax, COP(5_683_344.6));
  assert.equal(feb.renta.withholdings, COP(2_400_000));
  assert.equal(feb.renta.reserve, COP(3_283_344.6));
  assert.equal(feb.renta.marginalRate, 19);
  // Reserva de febrero: IVA 11,4M + lo que sube la renta (de 0 a 3.283.344,60)
  assert.equal(feb.monthSummary.vatReserve, COP(11_400_000));
  assert.equal(feb.monthSummary.rentaReserve, COP(3_283_344.6));
  assert.equal(feb.monthSummary.totalReserve, COP(14_683_344.6));
  // IVA cuatrimestral: enero-abril, se declara en mayo
  assert.equal(feb.vatPeriods.length, 3);
  assert.deepEqual([feb.currentVatPeriod.from, feb.currentVatPeriod.to, feb.currentVatPeriod.vatNet, feb.currentVatPeriod.filingMonth], ['2026-01-01', '2026-04-30', COP(22_420_000), '2026-05']);

  // Pasar a bimestral: enero-febrero, se declara en marzo
  await c.put('/api/settings', { ...(await settings()), vat_period: 'bimestral' });
  const bi = await summary('2026-02');
  assert.equal(bi.vatPeriods.length, 6);
  assert.deepEqual([bi.currentVatPeriod.to, bi.currentVatPeriod.vatNet, bi.currentVatPeriod.filingMonth], ['2026-02-28', COP(22_800_000), '2026-03']);

  // Marzo no sube la renta (gana la renta exenta) y su IVA queda a favor
  const mar = (await summary('2026-03')).monthSummary;
  assert.equal(mar.rentaReserve, 0);
  assert.equal(mar.totalReserve, 0);

  // La analítica usa la misma renta para la reserva del año: IVA 22,42M + renta 3.283.344,60
  const a = (await c.get('/api/analytics?month=2026-03')).data;
  assert.equal(a.seasonality[0].totalReserve, COP(22_420_000) + COP(3_283_344.6));
});

test('la migración pasa a Colombia una base de datos existente sin tocar importes', async () => {
  const s = await startServer();
  const { c: u } = await registerUser(s.baseUrl);
  const m = (await u.post('/api/movements', expense({ category: 'Otros gastos', vat_rate: 21 }))).data.movement;
  await s.stop();
  // Simula una base de datos anterior a la migración 004 (configuración y categorías de España)
  const raw = new DatabaseSync(s.dbPath);
  raw.exec(`
    ALTER TABLE settings DROP COLUMN vat_responsible;
    ALTER TABLE settings DROP COLUMN vat_period;
    UPDATE settings SET default_vat_rate = 21, default_irpf_rate = 15, currency = 'EUR';
    UPDATE movements SET category = 'Cuota de autónomos' WHERE id = ${m.id};
    INSERT INTO movements (user_id, type, date, concept, category, base_cents, vat_rate, deductible)
      SELECT user_id, 'gasto', '2026-11-11', 'Gestoría', 'Gestoría y asesoría', 5000, 21, 1 FROM settings;
    DELETE FROM schema_migrations WHERE version = '004_colombia.sql';
  `);
  raw.close();
  const db = openDb(s.dbPath);
  const st = db.prepare('SELECT default_vat_rate, default_irpf_rate, vat_responsible, vat_period, currency FROM settings').get();
  assert.deepEqual({ ...st }, { default_vat_rate: 19, default_irpf_rate: 10, vat_responsible: 1, vat_period: 'cuatrimestral', currency: 'EUR' });
  const rows = db.prepare('SELECT category, base_cents, vat_rate FROM movements ORDER BY id').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { category: SS, base_cents: 20000, vat_rate: 21 },
    { category: 'Contador y asesoría', base_cents: 5000, vat_rate: 21 },
  ]);
  db.close();
  await s.destroy();
});
