// Cálculos puros con las reglas de Colombia. Los valores esperados están calculados a mano
// (UVT 2026 = $52.374), no con el propio código. Los importes van en centavos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pctOf,
  lineAmounts,
  summarize,
  rentaTax,
  rentaBase,
  rentaToDate,
  monthTaxes,
  vatPeriods,
  vatPeriodOf,
  monthlySeries,
  addMonths,
  monthBounds,
} from '../server/calc.js';
import { uvt } from '../server/tax-co.js';

const COP = (pesos) => Math.round(pesos * 100); // pesos → centavos
const SS = 'Seguridad social (salud y pensión)';

test('redondeo de porcentajes en centavos', () => {
  assert.equal(pctOf(50, 19), 10); // 9,5 → 10
  assert.equal(pctOf(12345, 19), 2346); // 2345,55 → 2346
  assert.equal(pctOf(1000, 3.5), 35);
  assert.equal(pctOf(1000, 2.5), 25);
  assert.equal(pctOf(100000, 0), 0);
});

test('importes de un ingreso y de un gasto', () => {
  assert.deepEqual(lineAmounts({ type: 'ingreso', base_cents: 100000, vat_rate: 19, irpf_rate: 10 }), {
    base: 100000, vat: 19000, irpf: 10000, total: 109000,
  });
  // Un gasto nunca lleva retención aunque se le pase la tarifa
  assert.deepEqual(lineAmounts({ type: 'gasto', base_cents: 20000, vat_rate: 19, irpf_rate: 10 }), {
    base: 20000, vat: 3800, irpf: 0, total: 23800,
  });
});

test('UVT por año y año sin UVT publicada', () => {
  assert.deepEqual(uvt(2026), { year: 2026, pesos: 52374, cents: 5237400, official: true });
  assert.equal(uvt(2025).pesos, 49799);
  assert.equal(uvt(2024).pesos, 47065);
  assert.deepEqual(uvt(2027), { year: 2026, pesos: 52374, cents: 5237400, official: false });
  assert.equal(uvt(2020).year, 2023);
});

test('tabla de renta del art. 241 en cada tramo (2026)', () => {
  // Hasta 1.090 UVT ($57.087.660): 0 %
  assert.deepEqual(rentaTax(COP(50_000_000), 2026), { tax: 0, marginalRate: 0 });
  assert.deepEqual(rentaTax(COP(57_087_660), 2026), { tax: 0, marginalRate: 0 });
  // 19 %: (80.000.000 − 57.087.660) × 19 % = 4.353.344,60
  assert.deepEqual(rentaTax(COP(80_000_000), 2026), { tax: COP(4_353_344.6), marginalRate: 19 });
  // Justo 1.700 UVT ($89.035.800): (89.035.800 − 57.087.660) × 19 % = 6.070.146,60
  assert.equal(rentaTax(COP(89_035_800), 2026).tax, COP(6_070_146.6));
  // 28 %: (100.000.000 − 89.035.800) × 28 % + 116 UVT (6.075.384) = 9.145.360
  assert.deepEqual(rentaTax(COP(100_000_000), 2026), { tax: COP(9_145_360), marginalRate: 28 });
  // 33 %: (300.000.000 − 214.733.400) × 33 % + 788 UVT (41.270.712) = 69.408.690
  assert.deepEqual(rentaTax(COP(300_000_000), 2026), { tax: COP(69_408_690), marginalRate: 33 });
  // 39 %: (2.000.000.000 − 1.623.594.000) × 39 % + 10.352 UVT (542.175.648) = 688.973.988
  assert.deepEqual(rentaTax(COP(2_000_000_000), 2026), { tax: COP(688_973_988), marginalRate: 39 });
  assert.deepEqual(rentaTax(-5, 2026), { tax: 0, marginalRate: 0 });
  // Otro año usa su propia UVT: 2025, 80.000.000 − 1.090 × 49.799 (54.280.910) = 25.719.090 × 19 % = 4.886.627,10
  assert.equal(rentaTax(COP(80_000_000), 2025).tax, COP(4_886_627.1));
});

test('depuración: se elige el camino más favorable (costos o renta exenta del 25 %)', () => {
  // Pocos gastos: gana la renta exenta. 100M − 5M de salud y pensión = 95M; exenta 25 % = 23,75M → 71,25M
  const a = rentaBase({ income: COP(100_000_000), deductibleExpenses: COP(10_000_000), socialSecurity: COP(5_000_000) }, 2026);
  assert.equal(a.method, 'exenta25');
  assert.equal(a.byCosts, COP(90_000_000));
  assert.equal(a.exempt, COP(23_750_000));
  assert.equal(a.base, COP(71_250_000));
  // Muchos gastos: ganan los costos. 100M − 60M = 40M (con exenta serían 75M)
  const b = rentaBase({ income: COP(100_000_000), deductibleExpenses: COP(60_000_000), socialSecurity: 0 }, 2026);
  assert.equal(b.method, 'costos');
  assert.equal(b.base, COP(40_000_000));
  // Tope de la renta exenta: 790 UVT = 41.375.460 (el 25 % de 300M serían 75M)
  const c = rentaBase({ income: COP(300_000_000), deductibleExpenses: 0, socialSecurity: 0 }, 2026);
  assert.equal(c.exempt, COP(41_375_460));
  assert.equal(c.base, COP(258_624_540));
  // Pérdidas: base 0
  assert.equal(rentaBase({ income: 0, deductibleExpenses: COP(1_000_000), socialSecurity: 0 }, 2026).base, 0);
});

// Año 2026, responsable de IVA, para las pruebas de acumulado y periodos
const YEAR = [
  { type: 'ingreso', date: '2026-01-15', category: 'Facturación', base_cents: COP(60_000_000), vat_rate: 19, irpf_rate: 4 },
  { type: 'ingreso', date: '2026-02-10', category: 'Facturación', base_cents: COP(60_000_000), vat_rate: 19, irpf_rate: 0 },
  { type: 'gasto', date: '2026-02-20', category: SS, base_cents: COP(4_000_000), vat_rate: 0, deductible: 1 },
  { type: 'gasto', date: '2026-03-05', category: 'Software y suscripciones', base_cents: COP(2_000_000), vat_rate: 19, deductible: 1 },
];

test('renta acumulada del año: las retenciones se restan del impuesto', () => {
  // Enero: base 60M − 25 % = 45M → por debajo de 1.090 UVT → 0; retenido 2,4M → saldo a favor
  const jan = rentaToDate(YEAR, 2026, 1);
  assert.equal(jan.base, COP(45_000_000));
  assert.equal(jan.tax, 0);
  assert.equal(jan.withholdings, COP(2_400_000));
  assert.equal(jan.balance, -COP(2_400_000));
  assert.equal(jan.reserve, 0);
  // Febrero: 120M − 4M de salud y pensión = 116M; exenta 25 % = 29M → base 87M
  // impuesto (87.000.000 − 57.087.660) × 19 % = 5.683.344,60; menos 2,4M retenidos = 3.283.344,60
  const feb = rentaToDate(YEAR, 2026, 2);
  assert.equal(feb.method, 'exenta25');
  assert.equal(feb.base, COP(87_000_000));
  assert.equal(feb.tax, COP(5_683_344.6));
  assert.equal(feb.reserve, COP(3_283_344.6));
});

test('reserva del mes: IVA del mes + lo que sube la renta acumulada', () => {
  const jan = monthTaxes(YEAR, '2026-01');
  assert.equal(jan.vatReserve, COP(11_400_000));
  assert.equal(jan.rentaReserve, 0);
  assert.equal(jan.totalReserve, COP(11_400_000));

  const feb = monthTaxes(YEAR, '2026-02');
  assert.equal(feb.vatReserve, COP(11_400_000));
  assert.equal(feb.rentaReserve, COP(3_283_344.6));
  assert.equal(feb.totalReserve, COP(14_683_344.6));
  // Caja: 60M + 11,4M de IVA cobrado − 4M = 67,4M; disponible 67,4M − 14.683.344,60
  assert.equal(feb.cashBalance, COP(67_400_000));
  assert.equal(feb.availableAfterTaxes, COP(52_716_655.4));

  // Marzo: el software no cambia la base (sigue ganando la exenta) → renta 0; IVA descontable → reserva IVA 0
  const mar = monthTaxes(YEAR, '2026-03');
  assert.equal(mar.vatNet, -COP(380_000));
  assert.equal(mar.vatReserve, 0);
  assert.equal(mar.rentaReserve, 0);
  assert.equal(mar.totalReserve, 0);
});

test('periodos de IVA cuatrimestrales y bimestrales (formulario 300)', () => {
  const q = vatPeriods(YEAR, 2026, 'cuatrimestral');
  assert.deepEqual(q.map((p) => [p.from, p.to, p.vatNet, p.filingMonth]), [
    ['2026-01-01', '2026-04-30', COP(22_420_000), '2026-05'], // 22,8M − 380.000
    ['2026-05-01', '2026-08-31', 0, '2026-09'],
    ['2026-09-01', '2026-12-31', 0, '2027-01'],
  ]);
  const b = vatPeriods(YEAR, 2026, 'bimestral');
  assert.equal(b.length, 6);
  assert.deepEqual(b.slice(0, 2).map((p) => [p.from, p.to, p.vatNet, p.filingMonth]), [
    ['2026-01-01', '2026-02-28', COP(22_800_000), '2026-03'],
    ['2026-03-01', '2026-04-30', -COP(380_000), '2026-05'],
  ]);
  assert.equal(b[5].filingMonth, '2027-01');
  assert.deepEqual([vatPeriodOf(1, 'cuatrimestral'), vatPeriodOf(5, 'cuatrimestral'), vatPeriodOf(12, 'cuatrimestral')], [1, 2, 3]);
  assert.deepEqual([vatPeriodOf(2, 'bimestral'), vatPeriodOf(3, 'bimestral'), vatPeriodOf(12, 'bimestral')], [1, 2, 6]);
});

test('no responsable de IVA: el IVA de los gastos es costo, no se descuenta', () => {
  const movs = [{ type: 'gasto', date: '2026-03-05', base_cents: COP(1_000_000), vat_rate: 19, deductible: 1 }];
  const s = summarize(movs, { vatResponsible: false });
  assert.equal(s.expenses, COP(1_190_000));
  assert.equal(s.deductibleExpenses, COP(1_190_000));
  assert.equal(s.vatInput, 0);
  assert.equal(s.vatNet, 0);
  // Responsable: el IVA se descuenta y no es costo
  const r = summarize(movs, { vatResponsible: true });
  assert.equal(r.expenses, COP(1_000_000));
  assert.equal(r.vatInput, COP(190_000));
});

test('gasto no deducible: su IVA es costo y no resta en la renta', () => {
  const s = summarize([
    { type: 'ingreso', base_cents: 100000, vat_rate: 19, irpf_rate: 10 },
    { type: 'gasto', base_cents: 20000, vat_rate: 19, deductible: 1 },
    { type: 'gasto', base_cents: 5000, vat_rate: 19, deductible: 0 },
  ]);
  assert.equal(s.expenses, 25950); // 20000 + 5000 + 950
  assert.equal(s.profit, 74050);
  assert.equal(s.taxableProfit, 80000);
  assert.equal(s.vatOutput, 19000);
  assert.equal(s.vatInput, 3800);
  assert.equal(s.vatReserve, 15200);
  assert.equal(s.withholdings, 10000);
  assert.equal(s.cashBalance, 79250); // 109000 − 23800 − 5950
});

test('resumen vacío y pérdidas no generan reservas negativas', () => {
  const empty = monthTaxes([], '2026-11');
  assert.equal(empty.profit, 0);
  assert.equal(empty.totalReserve, 0);
  const loss = monthTaxes([{ type: 'gasto', date: '2026-11-02', base_cents: 50000, vat_rate: 19, deductible: 1 }], '2026-11');
  assert.equal(loss.profit, -50000);
  assert.equal(loss.vatNet, -9500);
  assert.equal(loss.vatReserve, 0);
  assert.equal(loss.rentaReserve, 0);
});

test('fechas: meses', () => {
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-11', -11), '2025-12');
  assert.deepEqual(monthBounds('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
});

test('serie mensual de 12 meses incluye meses vacíos', () => {
  const series = monthlySeries(
    [
      { type: 'ingreso', date: '2026-01-15', base_cents: 1000, vat_rate: 0, irpf_rate: 0 },
      { type: 'gasto', date: '2025-12-20', base_cents: 400, vat_rate: 0, deductible: 1 },
    ],
    '2026-02',
    3,
  );
  assert.deepEqual(
    series.map((s) => [s.month, s.income, s.expenses, s.profit]),
    [['2025-12', 0, 400, -400], ['2026-01', 1000, 0, 1000], ['2026-02', 0, 0, 0]],
  );
});
