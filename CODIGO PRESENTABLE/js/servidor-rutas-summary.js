import { validationError, isValidMonth } from '../validation.js';
import {
  summarize,
  monthTaxes,
  rentaToDate,
  vatPeriods,
  vatPeriodOf,
  monthlySeries,
  monthBounds,
  addMonths,
  currentMonth,
  lineAmounts,
} from '../calc.js';
import { uvt } from '../tax-co.js';
import { getSettings } from './settings.js';
import { MOVEMENT_SELECT, toMovement } from './movements.js';

/** Datos del Dashboard. Se calculan en cada petición a partir de los movimientos guardados. */
export function registerSummaryRoutes(router, { db }) {
  router.get('/api/summary', ({ user, query }) => {
    const month = query.get('month') || currentMonth();
    if (!isValidMonth(month)) throw validationError({ month: 'Mes no válido (formato AAAA-MM)' });

    const settings = getSettings(db, user.id);
    const opts = { vatResponsible: settings.vat_responsible };
    const year = Number(month.slice(0, 4));
    const m = Number(month.slice(5));
    const yearFrom = `${year}-01-01`;
    const yearTo = `${year}-12-31`;
    const seriesFrom = `${addMonths(month, -11)}-01`;
    const { to: monthTo } = monthBounds(month);

    const rows = db
      .prepare(
        `SELECT type, date, category, base_cents, vat_rate, irpf_rate, deductible FROM movements
         WHERE user_id = ? AND date BETWEEN ? AND ?`,
      )
      .all(user.id, seriesFrom < yearFrom ? seriesFrom : yearFrom, yearTo);
    const between = (a, b) => rows.filter((r) => r.date >= a && r.date <= b);
    const yearRows = between(yearFrom, yearTo);

    const periods = vatPeriods(yearRows, year, settings.vat_period, opts);

    const pendingRows = db
      .prepare(`SELECT base_cents, vat_rate, irpf_rate FROM invoices WHERE user_id = ? AND status = 'pendiente'`)
      .all(user.id);
    const pendingInvoices = {
      count: pendingRows.length,
      total_cents: pendingRows.reduce((sum, r) => sum + lineAmounts({ type: 'ingreso', ...r }).total, 0),
    };

    const recent = db
      .prepare(`${MOVEMENT_SELECT} WHERE m.user_id = ? ORDER BY m.date DESC, m.id DESC LIMIT 5`)
      .all(user.id)
      .map(toMovement);
    const { any } = db.prepare('SELECT EXISTS(SELECT 1 FROM movements WHERE user_id = ?) AS any').get(user.id);

    return {
      month,
      year,
      settingsComplete: Boolean(settings.business_name && settings.nif),
      hasMovements: any === 1,
      tax: {
        country: 'CO',
        vatResponsible: settings.vat_responsible,
        vatPeriod: settings.vat_period,
        currency: settings.currency,
        uvt: uvt(year),
        // Formulario 210: personas naturales, de agosto a octubre del año siguiente según el NIT.
        rentaFiling: { from: `${year + 1}-08`, to: `${year + 1}-10` },
      },
      monthSummary: monthTaxes(yearRows, month, opts),
      yearToDate: summarize(between(yearFrom, monthTo), opts),
      renta: rentaToDate(yearRows, year, m, opts),
      vatPeriods: periods,
      currentVatPeriod: periods[vatPeriodOf(m, settings.vat_period) - 1],
      series: monthlySeries(between(seriesFrom, monthTo), month, 12, opts),
      pendingInvoices,
      recent,
    };
  });
}
