import { validationError, isValidMonth } from '../validation.js';
import { summarize, rentaToDate, vatPeriods, vatPeriodOf, monthBounds, lineAmounts } from '../calc.js';
import { uvt } from '../tax-co.js';
import { requirePro } from '../plans.js';
import { getSettings } from './settings.js';
import { MOVEMENT_SELECT, toMovement } from './movements.js';

/**
 * Informe para el contador (Pro): un mes (?month=AAAA-MM) o un año (?year=AAAA).
 * Las cifras salen de las mismas funciones que el Dashboard (calc.js), así que coinciden con él.
 */
export function registerReportRoutes(router, { db, today }) {
  router.get('/api/report', ({ user, query }) => {
    const now = today();
    requirePro(db, user.id, now);
    return buildReport(db, user, query, now);
  });
}

/** Datos del informe de `user` (también lo usa el plan Contador para el informe de sus clientes). */
export function buildReport(db, user, query, now) {
  const monthQ = query.get('month');
  const yearQ = query.get('year');
  let period;
  if (yearQ !== null && monthQ === null) {
    if (!/^\d{4}$/.test(yearQ) || Number(yearQ) < 2000 || Number(yearQ) > 2100) throw validationError({ year: 'Año no válido' });
    const year = Number(yearQ);
    period = { kind: 'year', month: null, year, from: `${year}-01-01`, to: `${year}-12-31` };
  } else {
    const month = monthQ || now.slice(0, 7);
    if (!isValidMonth(month)) throw validationError({ month: 'Mes no válido (formato AAAA-MM)' });
    period = { kind: 'month', month, year: Number(month.slice(0, 4)), ...monthBounds(month) };
  }
  const { year, from, to } = period;

  const settings = getSettings(db, user.id);
  const opts = { vatResponsible: settings.vat_responsible };
  const yearRows = db
    .prepare(
      `SELECT type, date, category, base_cents, vat_rate, irpf_rate, deductible FROM movements
       WHERE user_id = ? AND date BETWEEN ? AND ?`,
    )
    .all(user.id, `${year}-01-01`, `${year}-12-31`);
  const inPeriod = yearRows.filter((r) => r.date >= from && r.date <= to);

  // Mes: el IVA del mes (en los totales) y el del periodo de IVA al que pertenece. Año: todos los periodos.
  const throughMonth = period.kind === 'month' ? Number(period.month.slice(5)) : 12;
  const periods = vatPeriods(yearRows, year, settings.vat_period, opts);
  const reportPeriods = period.kind === 'month' ? [periods[vatPeriodOf(throughMonth, settings.vat_period) - 1]] : periods;

  const byCategory = new Map();
  for (const r of inPeriod) {
    if (r.type !== 'gasto') continue;
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }
  const expenseCategories = [...byCategory]
    .map(([name, list]) => ({ name, total: summarize(list, opts).expenses, count: list.length }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));

  const invoices = db
    .prepare(
      `SELECT id, number, issue_date, client_name, base_cents, vat_rate, irpf_rate, status, paid_date FROM invoices
       WHERE user_id = ? AND issue_date BETWEEN ? AND ? ORDER BY issue_date, seq`,
    )
    .all(user.id, from, to)
    .map((i) => ({
      id: i.id,
      number: i.number,
      issue_date: i.issue_date,
      client_name: i.client_name,
      status: i.status,
      paid_date: i.paid_date,
      amounts: lineAmounts({ type: 'ingreso', base_cents: i.base_cents, vat_rate: i.vat_rate, irpf_rate: i.irpf_rate }),
    }));

  const movements = db
    .prepare(`${MOVEMENT_SELECT} WHERE m.user_id = ? AND m.date BETWEEN ? AND ? ORDER BY m.date, m.id`)
    .all(user.id, from, to)
    .map(toMovement);

  return {
    period,
    generatedOn: now,
    issuer: {
      name: settings.business_name || user.name,
      nif: settings.nif,
      vatResponsible: settings.vat_responsible,
      vatPeriod: settings.vat_period,
      currency: settings.currency,
    },
    totals: summarize(inPeriod, opts),
    vatPeriods: reportPeriods,
    renta: rentaToDate(yearRows, year, throughMonth, opts),
    expenseCategories,
    invoices,
    movements,
    uvt: uvt(year),
  };
}
