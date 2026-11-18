import { validationError, isValidMonth } from '../validation.js';
import { summarize, rentaToDate, monthBounds, addMonths, currentMonth, lastDayOfMonth } from '../calc.js';
import { CATEGORIES } from '../categories.js';
import { getSettings } from './settings.js';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Datos del panel de analítica (AnalyticsBento). Todo se calcula en cada petición
 * a partir de los movimientos guardados, con las mismas reglas que el Dashboard (calc.js).
 */
export function registerAnalyticsRoutes(router, { db }) {
  router.get('/api/analytics', ({ user, query }) => {
    const month = query.get('month') || currentMonth();
    if (!isValidMonth(month)) throw validationError({ month: 'Mes no válido (formato AAAA-MM)' });
    const opts = { vatResponsible: getSettings(db, user.id).vat_responsible };
    const year = Number(month.slice(0, 4));
    const m = Number(month.slice(5));

    const rows = db
      .prepare(
        `SELECT type, date, category, base_cents, vat_rate, irpf_rate, deductible FROM movements
         WHERE user_id = ? AND date BETWEEN ? AND ?`,
      )
      .all(user.id, `${year - 1}-01-01`, `${year}-12-31`);
    const between = (from, to, list = rows) => list.filter((r) => r.date >= from && r.date <= to);
    const sum = (list) => summarize(list, opts);
    const count = (list, type) => list.filter((r) => r.type === type).length;

    const monthPoint = (ym) => {
      const { from, to } = monthBounds(ym);
      const list = between(from, to);
      const s = sum(list);
      return {
        month: ym,
        income: s.income,
        expenses: s.expenses,
        profit: s.profit,
        incomeCount: count(list, 'ingreso'),
        expenseCount: count(list, 'gasto'),
      };
    };
    const yearMonths = (y) => Array.from({ length: 12 }, (_, i) => monthPoint(`${y}-${pad(i + 1)}`));

    // Periodos para comparar: mes, trimestre y año hasta el mes elegido (con el mismo tramo del año anterior).
    const q = Math.ceil(m / 3);
    const quarterRange = (y, qq) => ({ from: `${y}-${pad(qq * 3 - 2)}-01`, to: `${y}-${pad(qq * 3)}-${pad(lastDayOfMonth(y, qq * 3))}` });
    const prevQuarter = q === 1 ? quarterRange(year - 1, 4) : quarterRange(year, q - 1);
    const defs = [
      { key: 'month', label: 'Mes', ...monthBounds(month), previous: monthBounds(addMonths(month, -1)) },
      { key: 'quarter', label: 'Trimestre', ...quarterRange(year, q), previous: prevQuarter },
      {
        key: 'year',
        label: 'Año',
        from: `${year}-01-01`,
        to: monthBounds(month).to,
        previous: { from: `${year - 1}-01-01`, to: monthBounds(`${year - 1}-${pad(m)}`).to },
      },
    ];
    const totals = (from, to) => {
      const s = sum(between(from, to));
      return { income: s.income, expenses: s.expenses, profit: s.profit };
    };
    const periods = defs.map((d) => ({
      key: d.key,
      label: d.label,
      from: d.from,
      to: d.to,
      ...totals(d.from, d.to),
      previous: { ...d.previous, ...totals(d.previous.from, d.previous.to) },
    }));

    const expenseCategories = CATEGORIES.gasto.map((name) => {
      const list = rows.filter((r) => r.type === 'gasto' && r.category === name);
      return { name, values: defs.map((d) => sum(between(d.from, d.to, list)).expenses) };
    });

    const season = (y) => {
      const months = yearMonths(y);
      const list = between(`${y}-01-01`, `${y}-12-31`);
      const s = sum(list);
      return {
        year: y,
        values: months.map((p) => p.income),
        total: s.income,
        activeMonths: months.filter((p) => p.income > 0).length,
        incomeCount: count(list, 'ingreso'),
        profit: s.profit,
        // IVA a pagar del año + renta estimada del año completo, menos retenciones.
        totalReserve: s.vatReserve + rentaToDate(list, y, 12, opts).reserve,
      };
    };
    const previousYearHasData = rows.some((r) => r.date < `${year}-01-01`);

    return {
      month,
      year,
      revenue: Array.from({ length: 12 }, (_, i) => {
        const ym = addMonths(month, i - 11);
        return { month: ym, income: monthPoint(ym).income };
      }),
      monthly: { current: yearMonths(year), previous: yearMonths(year - 1) },
      periods,
      expenseCategories,
      seasonality: previousYearHasData ? [season(year), season(year - 1)] : [season(year)],
    };
  });
}
