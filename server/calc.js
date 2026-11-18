/**
 * Cálculos puros (sin base de datos) con las reglas fiscales de Colombia:
 * importes de cada movimiento, beneficio, IVA por periodo (formulario 300) y estimación
 * del impuesto sobre la renta (formulario 210) con la tabla del art. 241 ET.
 * Todo el dinero va en centésimas enteras (centavos).
 */
import { uvt, RENTA_TABLE, EXEMPT_RATE, EXEMPT_CAP_UVT, SOCIAL_SECURITY_CATEGORY } from './tax-co.js';

const pad = (n) => String(n).padStart(2, '0');

/** Porcentaje de un importe en centavos, con aritmética entera (tipo en puntos básicos). */
export function pctOf(cents, rate) {
  return Math.round((cents * Math.round(rate * 100)) / 10000);
}

/** Importes de un movimiento: base, IVA, retención en la fuente (columna `irpf_rate`) y total. */
export function lineAmounts({ type, base_cents, vat_rate, irpf_rate = 0 }) {
  const base = base_cents;
  const vat = pctOf(base, vat_rate);
  const irpf = type === 'ingreso' ? pctOf(base, irpf_rate) : 0;
  const total = type === 'ingreso' ? base + vat - irpf : base + vat;
  return { base, vat, irpf, total };
}

/**
 * Totales de una lista de movimientos.
 * - Responsable de IVA: el IVA de los gastos deducibles es descontable.
 * - No responsable: ese IVA no se recupera y forma parte del costo.
 */
export function summarize(movements, { vatResponsible = true } = {}) {
  const t = {
    count: 0,
    income: 0,
    expenses: 0,
    deductibleExpenses: 0,
    socialSecurity: 0,
    vatOutput: 0,
    vatInput: 0,
    withholdings: 0,
    cashIn: 0,
    cashOut: 0,
  };
  for (const m of movements) {
    const a = lineAmounts(m);
    t.count++;
    if (m.type === 'ingreso') {
      t.income += a.base;
      t.vatOutput += a.vat;
      t.withholdings += a.irpf;
      t.cashIn += a.total;
    } else {
      const deductible = m.deductible === true || m.deductible === 1;
      const recoverable = deductible && vatResponsible;
      const cost = a.base + (recoverable ? 0 : a.vat);
      t.expenses += cost;
      t.cashOut += a.total;
      if (deductible) {
        t.deductibleExpenses += cost;
        if (recoverable) t.vatInput += a.vat;
        if (m.category === SOCIAL_SECURITY_CATEGORY) t.socialSecurity += cost;
      }
    }
  }
  const vatNet = t.vatOutput - t.vatInput;
  return {
    ...t,
    profit: t.income - t.expenses,
    taxableProfit: t.income - t.deductibleExpenses,
    vatNet,
    vatReserve: Math.max(0, vatNet),
    cashBalance: t.cashIn - t.cashOut,
  };
}

/** Impuesto sobre la renta (art. 241 ET) de una renta líquida gravable en centavos. */
export function rentaTax(baseCents, year) {
  const u = uvt(year).cents;
  if (baseCents <= 0) return { tax: 0, marginalRate: 0 };
  const row = RENTA_TABLE.find((r) => baseCents <= r.to * u);
  const tax = row.rate === 0 ? 0 : pctOf(baseCents - row.from * u, row.rate) + row.fixed * u;
  return { tax, marginalRate: row.rate };
}

/**
 * Renta líquida gravable estimada (art. 336 ET) por los dos caminos que permite la ley
 * a un independiente, y el más favorable:
 * - costos: ingresos − costos y gastos deducibles registrados;
 * - exenta25: ingresos − aportes a salud y pensión − renta exenta del 25 % (máx. 790 UVT al año).
 */
export function rentaBase(s, year) {
  const u = uvt(year).cents;
  const byCosts = Math.max(0, s.income - s.deductibleExpenses);
  const net = Math.max(0, s.income - s.socialSecurity);
  const exempt = Math.min(pctOf(net, EXEMPT_RATE), EXEMPT_CAP_UVT * u);
  const byExempt = net - exempt;
  return {
    method: byExempt < byCosts ? 'exenta25' : 'costos',
    base: Math.min(byCosts, byExempt),
    byCosts,
    byExempt,
    exempt,
    deductibleExpenses: s.deductibleExpenses,
    socialSecurity: s.socialSecurity,
  };
}

/**
 * Renta del año acumulada hasta el final del mes `throughMonth` (1-12), como si el año terminara ahí.
 * Las retenciones que te practicaron son anticipos: se restan del impuesto.
 */
export function rentaToDate(movements, year, throughMonth, opts) {
  const from = `${year}-01-01`;
  const to = monthBounds(`${year}-${pad(throughMonth)}`).to;
  const s = summarize(
    movements.filter((m) => m.date >= from && m.date <= to),
    opts,
  );
  const b = rentaBase(s, year);
  const { tax, marginalRate } = rentaTax(b.base, year);
  const balance = tax - s.withholdings;
  return {
    year,
    from,
    to,
    income: s.income,
    ...b,
    tax,
    marginalRate,
    withholdings: s.withholdings,
    balance, // positivo: a pagar; negativo: saldo a favor
    reserve: Math.max(0, balance),
    uvt: uvt(year),
  };
}

/**
 * Totales de un mes y cuánto reservar en él.
 * Renta del mes = lo que sube la renta acumulada del año respecto al mes anterior (nunca negativo).
 */
export function monthTaxes(movements, ym, opts) {
  const [year, month] = ym.split('-').map(Number);
  const { from, to } = monthBounds(ym);
  const s = summarize(
    movements.filter((m) => m.date >= from && m.date <= to),
    opts,
  );
  const now = rentaToDate(movements, year, month, opts).reserve;
  const before = month > 1 ? rentaToDate(movements, year, month - 1, opts).reserve : 0;
  const rentaReserve = Math.max(0, now - before);
  const totalReserve = s.vatReserve + rentaReserve;
  return { ...s, rentaReserve, totalReserve, availableAfterTaxes: s.cashBalance - totalReserve };
}

const periodLength = (periodicity) => (periodicity === 'bimestral' ? 2 : 4);

/** Número de periodo de IVA (1..6 bimestral, 1..3 cuatrimestral) al que pertenece un mes. */
export const vatPeriodOf = (month, periodicity) => Math.ceil(month / periodLength(periodicity));

/** IVA de cada periodo del año (formulario 300). Se declara el mes siguiente al cierre del periodo. */
export function vatPeriods(movements, year, periodicity = 'cuatrimestral', opts) {
  const len = periodLength(periodicity);
  const out = [];
  for (let first = 1; first <= 12; first += len) {
    const last = first + len - 1;
    const from = `${year}-${pad(first)}-01`;
    const to = monthBounds(`${year}-${pad(last)}`).to;
    const s = summarize(
      movements.filter((m) => m.date >= from && m.date <= to),
      opts,
    );
    out.push({
      period: out.length + 1,
      from,
      to,
      firstMonth: first,
      lastMonth: last,
      vatOutput: s.vatOutput,
      vatInput: s.vatInput,
      vatNet: s.vatNet,
      filingMonth: addMonths(`${year}-${pad(last)}`, 1),
    });
  }
  return out;
}

export function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: `${ym}-${pad(lastDayOfMonth(y, m))}` };
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** Ingresos, gastos y beneficio de los `count` meses que terminan en `endMonth`. */
export function monthlySeries(movements, endMonth, count = 12, opts) {
  const byMonth = new Map();
  for (const m of movements) {
    const key = m.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(m);
  }
  const series = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = addMonths(endMonth, -i);
    const s = summarize(byMonth.get(month) || [], opts);
    series.push({ month, income: s.income, expenses: s.expenses, profit: s.profit });
  }
  return series;
}

/**
 * Zona horaria de la app: «hoy» es el día en Colombia aunque el servidor esté en otro huso (en la nube suele
 * ser UTC, y el día cambiaría a las 7 p. m.). Se puede cambiar con la variable APP_TIMEZONE (p. ej. America/Bogota).
 */
function dayFormatter(zone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return null; // zona no válida
  }
}
const zoneFromEnv = process.env.APP_TIMEZONE?.trim();
export const APP_TIMEZONE = zoneFromEnv && dayFormatter(zoneFromEnv) ? zoneFromEnv : 'America/Bogota';
const DAY_FORMAT = dayFormatter(APP_TIMEZONE);

/** Fecha AAAA-MM-DD del instante `d` en la zona horaria de la app. */
export function todayLocal(d = new Date()) {
  const p = Object.fromEntries(DAY_FORMAT.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export const currentMonth = (d = new Date()) => todayLocal(d).slice(0, 7);
