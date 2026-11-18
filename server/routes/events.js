import { Validator, validationError, notFound, parseId, isValidDate } from '../validation.js';
import { NOW_SQL } from '../db.js';
import { reply } from '../router.js';

export const EVENT_CATEGORIES = ['reunion', 'fiscal', 'cobro', 'otro'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const SELECT = `SELECT id, title, date, all_day, start_time, end_time, category, notes, created_at, updated_at
  FROM events`;

const toEvent = (row) => ({ ...row, all_day: row.all_day === 1 });

function validateEvent(body) {
  const v = new Validator(body);
  v.string('title', { required: true, max: 120 });
  v.date('date');
  const allDay = v.bool('all_day', false);
  v.oneOf('category', EVENT_CATEGORIES, { required: false, fallback: 'otro' });
  v.string('notes', { max: 1000 });

  if (allDay) {
    v.data.start_time = null;
    v.data.end_time = null;
  } else {
    const start = v.body.start_time;
    const end = v.body.end_time;
    if (start === undefined || start === null || start === '') v.fail('start_time', 'Indica la hora de inicio o marca «Todo el día»');
    else if (typeof start !== 'string' || !TIME_RE.test(start)) v.fail('start_time', 'Hora no válida (HH:MM)');
    else v.data.start_time = start;

    if (end === undefined || end === null || end === '') v.data.end_time = null;
    else if (typeof end !== 'string' || !TIME_RE.test(end)) v.fail('end_time', 'Hora no válida (HH:MM)');
    else if (v.data.start_time && end <= v.data.start_time) v.fail('end_time', 'Debe ser posterior a la hora de inicio');
    else v.data.end_time = end;
  }
  return v.check();
}

function findOwned(db, userId, id) {
  const row = db.prepare(`${SELECT} WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!row) throw notFound('Evento no encontrado');
  return row;
}

export function registerEventRoutes(router, { db }) {
  router.get('/api/events', ({ user, query }) => {
    const where = ['user_id = ?'];
    const params = [user.id];
    const errors = {};
    for (const [key, op] of [['from', '>='], ['to', '<=']]) {
      const value = query.get(key);
      if (!value) continue;
      if (!isValidDate(value)) errors[key] = 'Fecha no válida';
      else {
        where.push(`date ${op} ?`);
        params.push(value);
      }
    }
    if (Object.keys(errors).length) throw validationError(errors, 'Filtros no válidos');
    const rows = db
      .prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY date, all_day DESC, start_time, id`)
      .all(...params);
    return { events: rows.map(toEvent) };
  });

  router.get('/api/events/:id', ({ user, params }) => ({ event: toEvent(findOwned(db, user.id, parseId(params.id))) }));

  router.post('/api/events', ({ user, body }) => {
    const d = validateEvent(body);
    const r = db
      .prepare(
        `INSERT INTO events (user_id, title, date, all_day, start_time, end_time, category, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(user.id, d.title, d.date, d.all_day ? 1 : 0, d.start_time, d.end_time, d.category, d.notes);
    return reply(201, { event: toEvent(findOwned(db, user.id, Number(r.lastInsertRowid))) });
  });

  router.put('/api/events/:id', ({ user, params, body }) => {
    const id = parseId(params.id);
    findOwned(db, user.id, id);
    const d = validateEvent(body);
    db.prepare(
      `UPDATE events SET title = ?, date = ?, all_day = ?, start_time = ?, end_time = ?, category = ?, notes = ?,
         updated_at = ${NOW_SQL}
       WHERE id = ? AND user_id = ?`,
    ).run(d.title, d.date, d.all_day ? 1 : 0, d.start_time, d.end_time, d.category, d.notes, id, user.id);
    return { event: toEvent(findOwned(db, user.id, id)) };
  });

  router.delete('/api/events/:id', ({ user, params }) => {
    const id = parseId(params.id);
    findOwned(db, user.id, id);
    db.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').run(id, user.id);
    return undefined;
  });
}
