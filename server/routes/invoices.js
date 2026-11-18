import { Validator, validationError, notFound, parseId } from '../validation.js';
import { transaction, NOW_SQL } from '../db.js';
import { reply } from '../router.js';
import { INVOICE_CATEGORY } from '../categories.js';
import { lineAmounts, todayLocal } from '../calc.js';

const SELECT = `SELECT i.id, i.year, i.seq, i.number, i.client_name, i.client_nif, i.client_address,
  i.issue_date, i.due_date, i.concept, i.base_cents, i.vat_rate, i.irpf_rate, i.status, i.paid_date,
  i.notes, i.created_at, i.updated_at, m.id AS movement_id
  FROM invoices i LEFT JOIN movements m ON m.invoice_id = i.id`;

const toInvoice = (row) => ({
  ...row,
  amounts: lineAmounts({ type: 'ingreso', base_cents: row.base_cents, vat_rate: row.vat_rate, irpf_rate: row.irpf_rate }),
});

const movementConcept = (number, client) => `Factura ${number} · ${client}`;

function validateInvoice(body) {
  const v = new Validator(body);
  v.string('client_name', { required: true, max: 200 });
  v.string('client_nif', { max: 20 });
  v.string('client_address', { max: 300 });
  v.date('issue_date');
  v.date('due_date', { required: false });
  v.string('concept', { required: true, max: 500 });
  v.cents('base_cents');
  v.rate('vat_rate');
  v.rate('irpf_rate');
  v.oneOf('status', ['pendiente', 'cobrada'], { required: false, fallback: 'pendiente' });
  v.date('paid_date', { required: false });
  v.string('notes', { max: 1000 });
  const { issue_date, due_date, paid_date, status } = v.data;
  if (issue_date && due_date && due_date < issue_date) v.fail('due_date', 'No puede ser anterior a la fecha de emisión');
  if (issue_date && status === 'cobrada' && paid_date && paid_date < issue_date) {
    v.fail('paid_date', 'No puede ser anterior a la fecha de emisión');
  }
  const d = v.check();
  d.client_nif = d.client_nif.toUpperCase();
  d.paid_date = d.status === 'cobrada' ? d.paid_date ?? maxDate(todayLocal(), d.issue_date) : null;
  return d;
}

const maxDate = (a, b) => (a > b ? a : b);

function findOwned(db, userId, id) {
  const row = db.prepare(`${SELECT} WHERE i.id = ? AND i.user_id = ?`).get(id, userId);
  if (!row) throw notFound('Factura no encontrada');
  return row;
}

export function registerInvoiceRoutes(router, { db }) {
  router.get('/api/invoices', ({ user, query }) => {
    const where = ['i.user_id = ?'];
    const params = [user.id];
    const errors = {};
    const year = query.get('year');
    if (year) {
      if (!/^\d{4}$/.test(year)) errors.year = 'Año no válido';
      else {
        where.push('i.year = ?');
        params.push(Number(year));
      }
    }
    const status = query.get('status');
    if (status) {
      if (!['pendiente', 'cobrada'].includes(status)) errors.status = 'Estado no válido';
      else {
        where.push('i.status = ?');
        params.push(status);
      }
    }
    if (Object.keys(errors).length) throw validationError(errors, 'Filtros no válidos');

    const invoices = db
      .prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY i.year DESC, i.seq DESC`)
      .all(...params)
      .map(toInvoice);
    const totals = { count: invoices.length, base_cents: 0, total_cents: 0, pending_count: 0, pending_cents: 0 };
    for (const inv of invoices) {
      totals.base_cents += inv.amounts.base;
      totals.total_cents += inv.amounts.total;
      if (inv.status === 'pendiente') {
        totals.pending_count++;
        totals.pending_cents += inv.amounts.total;
      }
    }
    const years = db
      .prepare('SELECT DISTINCT year FROM invoices WHERE user_id = ? ORDER BY year DESC')
      .all(user.id)
      .map((r) => r.year);
    return { invoices, totals, years };
  });

  router.get('/api/invoices/:id', ({ user, params }) => ({
    invoice: toInvoice(findOwned(db, user.id, parseId(params.id))),
  }));

  router.post('/api/invoices', ({ user, body }) => {
    const d = validateInvoice(body);
    const id = transaction(db, () => {
      const year = Number(d.issue_date.slice(0, 4));
      const { next } = db
        .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM invoices WHERE user_id = ? AND year = ?')
        .get(user.id, year);
      const number = `${year}-${String(next).padStart(3, '0')}`;
      const r = db
        .prepare(
          `INSERT INTO invoices (user_id, year, seq, number, client_name, client_nif, client_address, issue_date,
             due_date, concept, base_cents, vat_rate, irpf_rate, status, paid_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(user.id, year, next, number, d.client_name, d.client_nif, d.client_address, d.issue_date, d.due_date,
          d.concept, d.base_cents, d.vat_rate, d.irpf_rate, d.status, d.paid_date, d.notes);
      const invoiceId = Number(r.lastInsertRowid);
      // Criterio de devengo: el ingreso cuenta en la fecha de emisión.
      db.prepare(
        `INSERT INTO movements (user_id, type, date, concept, category, base_cents, vat_rate, irpf_rate, deductible, notes, invoice_id)
         VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, 1, '', ?)`,
      ).run(user.id, d.issue_date, movementConcept(number, d.client_name), INVOICE_CATEGORY, d.base_cents, d.vat_rate,
        d.irpf_rate, invoiceId);
      return invoiceId;
    });
    return reply(201, { invoice: toInvoice(findOwned(db, user.id, id)) });
  });

  router.put('/api/invoices/:id', ({ user, params, body }) => {
    const id = parseId(params.id);
    const current = findOwned(db, user.id, id);
    const d = validateInvoice(body);
    if (Number(d.issue_date.slice(0, 4)) !== current.year) {
      throw validationError({ issue_date: `La factura ${current.number} es de ${current.year}: no se puede cambiar de año` });
    }
    transaction(db, () => {
      db.prepare(
        `UPDATE invoices SET client_name = ?, client_nif = ?, client_address = ?, issue_date = ?, due_date = ?,
           concept = ?, base_cents = ?, vat_rate = ?, irpf_rate = ?, status = ?, paid_date = ?, notes = ?,
           updated_at = ${NOW_SQL}
         WHERE id = ? AND user_id = ?`,
      ).run(d.client_name, d.client_nif, d.client_address, d.issue_date, d.due_date, d.concept, d.base_cents,
        d.vat_rate, d.irpf_rate, d.status, d.paid_date, d.notes, id, user.id);
      db.prepare(
        `UPDATE movements SET date = ?, concept = ?, base_cents = ?, vat_rate = ?, irpf_rate = ?, updated_at = ${NOW_SQL}
         WHERE invoice_id = ? AND user_id = ?`,
      ).run(d.issue_date, movementConcept(current.number, d.client_name), d.base_cents, d.vat_rate, d.irpf_rate, id,
        user.id);
    });
    return { invoice: toInvoice(findOwned(db, user.id, id)) };
  });

  router.put('/api/invoices/:id/status', ({ user, params, body }) => {
    const id = parseId(params.id);
    const current = findOwned(db, user.id, id);
    const v = new Validator(body);
    v.oneOf('status', ['pendiente', 'cobrada']);
    v.date('paid_date', { required: false });
    const d = v.check();
    const paid = d.status === 'cobrada' ? d.paid_date ?? maxDate(todayLocal(), current.issue_date) : null;
    if (paid && paid < current.issue_date) throw validationError({ paid_date: 'No puede ser anterior a la fecha de emisión' });
    db.prepare(`UPDATE invoices SET status = ?, paid_date = ?, updated_at = ${NOW_SQL} WHERE id = ? AND user_id = ?`).run(
      d.status,
      paid,
      id,
      user.id,
    );
    return { invoice: toInvoice(findOwned(db, user.id, id)) };
  });

  router.delete('/api/invoices/:id', ({ user, params }) => {
    const id = parseId(params.id);
    findOwned(db, user.id, id);
    // ON DELETE CASCADE elimina también el ingreso vinculado.
    db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(id, user.id);
    return undefined;
  });
}
