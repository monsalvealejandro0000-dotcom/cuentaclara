import { Validator, validationError, notFound, isValidDate } from '../validation.js';
import { transaction, NOW_SQL } from '../db.js';
import { vatPeriods, rentaToDate, monthBounds, addMonths } from '../calc.js';
import { requirePro, daysBetween } from '../plans.js';
import { getSettings } from './settings.js';

/**
 * Avisos de declaración (Pro). La app no conoce el día exacto de cada declaración (depende de los
 * últimos dígitos del NIT y del decreto del calendario tributario de cada año): avisa por mes y deja
 * anotar el día exacto, que se guarda como evento «Fiscal / impuestos» del calendario.
 *
 * Ventanas en las que se ve cada aviso:
 * - IVA (formulario 300): del día 15 del mes anterior al último día del mes en que se declara.
 * - Renta (formulario 210): del 15 de julio al 31 de octubre del año siguiente (se declara de agosto a octubre).
 */
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const periodLabel = (first, last, year) => `${MONTHS[first - 1]}–${MONTHS[last - 1]} ${year}`;
const EVENT_NOTES =
  'Anotado desde los avisos de declaración. El día depende de los últimos dígitos de tu NIT (calendario tributario de la DIAN).';

function getPreferences(db, userId) {
  const r = db.prepare('SELECT vat, renta FROM reminder_settings WHERE user_id = ?').get(userId);
  return { vat: r ? r.vat === 1 : true, renta: r ? r.renta === 1 : true };
}

/** Declaraciones que pueden tener aviso: IVA y renta del año pasado y de este. */
function declarations(db, userId, settings, today) {
  const year = Number(today.slice(0, 4));
  const opts = { vatResponsible: settings.vat_responsible };
  const rows = db
    .prepare(
      `SELECT type, date, category, base_cents, vat_rate, irpf_rate, deductible FROM movements
       WHERE user_id = ? AND date BETWEEN ? AND ?`,
    )
    .all(userId, `${year - 1}-01-01`, `${year}-12-31`);
  const list = [];
  for (const y of [year - 1, year]) {
    const ofYear = rows.filter((r) => r.date.startsWith(`${y}-`));
    if (settings.vat_responsible) {
      for (const p of vatPeriods(ofYear, y, settings.vat_period, opts)) {
        // Sin ingresos ni IVA descontable en el periodo no hay operaciones que declarar (art. 601 ET): no se avisa.
        const incomes = ofYear.filter((r) => r.type === 'ingreso' && r.date >= p.from && r.date <= p.to).length;
        list.push({
          hasOperations: incomes > 0 || p.vatOutput !== 0 || p.vatInput !== 0,
          key: `iva-${y}-${settings.vat_period}-${p.period}`,
          kind: 'iva',
          form: '300',
          year: y,
          title: `IVA ${periodLabel(p.firstMonth, p.lastMonth, y)}`,
          dueFrom: p.filingMonth,
          dueTo: p.filingMonth,
          windowFrom: `${addMonths(p.filingMonth, -1)}-15`,
          windowTo: monthBounds(p.filingMonth).to,
          amount: p.vatNet, // positivo: a pagar; negativo: saldo a favor
        });
      }
    }
    list.push({
      hasOperations: true, // la obligación de declarar renta depende de topes que la app no conoce: se avisa siempre
      key: `renta-${y}`,
      kind: 'renta',
      form: '210',
      year: y,
      title: `Renta ${y}`,
      dueFrom: `${y + 1}-08`,
      dueTo: `${y + 1}-10`,
      windowFrom: `${y + 1}-07-15`,
      windowTo: `${y + 1}-10-31`,
      amount: rentaToDate(ofYear, y, 12, opts).balance,
    });
  }
  return list;
}

function withState(db, userId, list, today, prefs) {
  const states = new Map(
    db
      .prepare(
        `SELECT s.decl_key, s.filed_on, s.event_id, e.date AS event_date
         FROM reminder_states s LEFT JOIN events e ON e.id = s.event_id AND e.user_id = s.user_id
         WHERE s.user_id = ?`,
      )
      .all(userId)
      .map((r) => [r.decl_key, r]),
  );
  return list.map((d) => {
    const s = states.get(d.key);
    const exactDate = s?.event_date ?? null;
    const filed = Boolean(s?.filed_on);
    const enabled = d.kind === 'iva' ? prefs.vat : prefs.renta;
    const inWindow = d.windowFrom <= today && today <= d.windowTo;
    return {
      ...d,
      exactDate,
      eventId: exactDate ? s.event_id : null,
      daysUntil: exactDate ? daysBetween(today, exactDate) : null,
      filed,
      filedOn: s?.filed_on ?? null,
      enabled,
      active: inWindow && enabled && !filed && d.hasOperations,
    };
  });
}

/** Avisos de un usuario (también los lee el plan Contador para el resumen de sus clientes). */
export function reminderData(db, userId, today) {
  const settings = getSettings(db, userId);
  const preferences = getPreferences(db, userId);
  const all = withState(db, userId, declarations(db, userId, settings, today), today, preferences);
  const soonest = (d) => d.exactDate ?? d.windowTo;
  const active = all.filter((d) => d.active).sort((a, b) => soonest(a).localeCompare(soonest(b)));
  // Próximas: las que están en su ventana (avisando o ya presentadas) y la siguiente de cada tipo.
  const upcoming = [];
  const seenFuture = new Set();
  for (const d of all.filter((x) => x.windowTo >= today).sort((a, b) => a.windowTo.localeCompare(b.windowTo))) {
    if (d.windowFrom <= today) upcoming.push(d);
    else if (!seenFuture.has(d.kind)) {
      seenFuture.add(d.kind);
      upcoming.push(d);
    }
  }
  return { today, preferences, vatResponsible: settings.vat_responsible, active, upcoming };
}

export function registerReminderRoutes(router, { db, today }) {
  router.get('/api/reminders', ({ user }) => {
    const now = today();
    requirePro(db, user.id, now);
    return reminderData(db, user.id, now);
  });

  router.put('/api/reminders', ({ user, body }) => {
    const now = today();
    requirePro(db, user.id, now);
    const current = getPreferences(db, user.id);
    const v = new Validator(body);
    v.bool('vat', current.vat);
    v.bool('renta', current.renta);
    const d = v.check();
    db.prepare(
      `INSERT INTO reminder_settings (user_id, vat, renta) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET vat = excluded.vat, renta = excluded.renta, updated_at = ${NOW_SQL}`,
    ).run(user.id, d.vat ? 1 : 0, d.renta ? 1 : 0);
    return reminderData(db, user.id, now);
  });

  // Marcar como presentada (filed), deshacerlo, o anotar el día exacto (date) como evento del calendario.
  router.put('/api/reminders/:key', ({ user, params, body }) => {
    const now = today();
    requirePro(db, user.id, now);
    const decl = declarations(db, user.id, getSettings(db, user.id), now).find((d) => d.key === params.key);
    if (!decl) throw notFound('Declaración no encontrada');

    const v = new Validator(body);
    const filed = v.bool('filed', undefined);
    if (body.date !== undefined && !isValidDate(body.date)) v.fail('date', 'Fecha no válida');
    v.check();
    if (filed === undefined && body.date === undefined) throw validationError({ filed: 'Indica si está presentada o el día exacto' });

    transaction(db, () => {
      db.prepare('INSERT OR IGNORE INTO reminder_states (user_id, decl_key) VALUES (?, ?)').run(user.id, decl.key);
      if (filed !== undefined) {
        db.prepare(`UPDATE reminder_states SET filed_on = ?, updated_at = ${NOW_SQL} WHERE user_id = ? AND decl_key = ?`).run(
          filed ? now : null,
          user.id,
          decl.key,
        );
      }
      if (body.date !== undefined) {
        const linked = db
          .prepare(
            `SELECT e.id FROM reminder_states s JOIN events e ON e.id = s.event_id AND e.user_id = s.user_id
             WHERE s.user_id = ? AND s.decl_key = ?`,
          )
          .get(user.id, decl.key);
        if (linked) {
          db.prepare(
            `UPDATE events SET date = ?, all_day = 1, start_time = NULL, end_time = NULL, updated_at = ${NOW_SQL}
             WHERE id = ? AND user_id = ?`,
          ).run(body.date, linked.id, user.id);
        } else {
          const title = decl.kind === 'iva' ? `Declarar ${decl.title} (formulario 300)` : `Declarar renta ${decl.year} (formulario 210)`;
          const r = db
            .prepare(
              `INSERT INTO events (user_id, title, date, all_day, start_time, end_time, category, notes)
               VALUES (?, ?, ?, 1, NULL, NULL, 'fiscal', ?)`,
            )
            .run(user.id, title, body.date, EVENT_NOTES);
          db.prepare(`UPDATE reminder_states SET event_id = ?, updated_at = ${NOW_SQL} WHERE user_id = ? AND decl_key = ?`).run(
            Number(r.lastInsertRowid),
            user.id,
            decl.key,
          );
        }
      }
    });
    return reminderData(db, user.id, now);
  });
}
