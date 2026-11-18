import { Validator, HttpError, validationError, notFound, parseId, isValidDate } from '../validation.js';
import { NOW_SQL } from '../db.js';
import { reply } from '../router.js';
import { CATEGORIES } from '../categories.js';
import { lineAmounts, summarize } from '../calc.js';
import { getSettings } from './settings.js';

export const MOVEMENT_SELECT = `
  SELECT m.id, m.type, m.date, m.concept, m.category, m.base_cents, m.vat_rate, m.irpf_rate,
         m.deductible, m.notes, m.invoice_id, i.number AS invoice_number, m.created_at, m.updated_at
  FROM movements m LEFT JOIN invoices i ON i.id = m.invoice_id`;

export const toMovement = (row) => ({ ...row, deductible: row.deductible === 1, amounts: lineAmounts(row) });

function validateMovement(body) {
  const v = new Validator(body);
  const type = v.oneOf('type', ['ingreso', 'gasto']);
  v.date('date');
  v.string('concept', { required: true, max: 200 });
  if (type) v.oneOf('category', CATEGORIES[type]);
  v.cents('base_cents');
  v.rate('vat_rate');
  if (type === 'gasto') {
    v.data.irpf_rate = 0;
    v.bool('deductible', true);
  } else {
    v.rate('irpf_rate', { required: false, fallback: 0 });
    v.data.deductible = true;
  }
  v.string('notes', { max: 1000 });
  return v.check();
}

function findOwned(db, userId, id) {
  const row = db.prepare(`${MOVEMENT_SELECT} WHERE m.id = ? AND m.user_id = ?`).get(id, userId);
  if (!row) throw notFound('Movimiento no encontrado');
  return row;
}

function assertNotLinked(row) {
  if (row.invoice_id) {
    throw new HttpError(
      409,
      'LINKED_TO_INVOICE',
      `Este ingreso se generó con la factura ${row.invoice_number}. Edítalo o elimínalo desde Facturas.`,
    );
  }
}

export function registerMovementRoutes(router, { db }) {
  router.get('/api/movements', ({ user, query }) => {
    const where = ['m.user_id = ?'];
    const params = [user.id];
    const errors = {};

    for (const [key, op] of [['from', '>='], ['to', '<=']]) {
      const value = query.get(key);
      if (!value) continue;
      if (!isValidDate(value)) errors[key] = 'Fecha no válida';
      else {
        where.push(`m.date ${op} ?`);
        params.push(value);
      }
    }
    const type = query.get('type');
    if (type) {
      if (!['ingreso', 'gasto'].includes(type)) errors.type = 'Tipo no válido';
      else {
        where.push('m.type = ?');
        params.push(type);
      }
    }
    const category = query.get('category');
    if (category) {
      where.push('m.category = ?');
      params.push(category.slice(0, 100));
    }
    const q = (query.get('q') || '').trim().slice(0, 100);
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push("(m.concept LIKE ? ESCAPE '\\' OR m.notes LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
    if (Object.keys(errors).length) throw validationError(errors, 'Filtros no válidos');

    const rows = db
      .prepare(`${MOVEMENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY m.date DESC, m.id DESC`)
      .all(...params);
    const { vat_responsible } = getSettings(db, user.id);
    return { movements: rows.map(toMovement), totals: summarize(rows, { vatResponsible: vat_responsible }) };
  });

  router.get('/api/movements/:id', ({ user, params }) => ({
    movement: toMovement(findOwned(db, user.id, parseId(params.id))),
  }));

  router.post('/api/movements', ({ user, body }) => {
    const d = validateMovement(body);
    const r = db
      .prepare(
        `INSERT INTO movements (user_id, type, date, concept, category, base_cents, vat_rate, irpf_rate, deductible, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(user.id, d.type, d.date, d.concept, d.category, d.base_cents, d.vat_rate, d.irpf_rate, d.deductible ? 1 : 0, d.notes);
    return reply(201, { movement: toMovement(findOwned(db, user.id, Number(r.lastInsertRowid))) });
  });

  router.put('/api/movements/:id', ({ user, params, body }) => {
    const id = parseId(params.id);
    assertNotLinked(findOwned(db, user.id, id));
    const d = validateMovement(body);
    db.prepare(
      `UPDATE movements SET type = ?, date = ?, concept = ?, category = ?, base_cents = ?, vat_rate = ?,
         irpf_rate = ?, deductible = ?, notes = ?, updated_at = ${NOW_SQL}
       WHERE id = ? AND user_id = ?`,
    ).run(d.type, d.date, d.concept, d.category, d.base_cents, d.vat_rate, d.irpf_rate, d.deductible ? 1 : 0, d.notes, id, user.id);
    return { movement: toMovement(findOwned(db, user.id, id)) };
  });

  router.delete('/api/movements/:id', ({ user, params }) => {
    const id = parseId(params.id);
    assertNotLinked(findOwned(db, user.id, id));
    db.prepare('DELETE FROM movements WHERE id = ? AND user_id = ?').run(id, user.id);
    return undefined;
  });
}
