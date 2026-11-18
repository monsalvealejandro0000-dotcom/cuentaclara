import { Validator, HttpError } from '../validation.js';
import { reply } from '../router.js';

/**
 * Peticiones, quejas y reclamos (PQR). Canal con número de radicado, fecha y hora, y seguimiento
 * (art. 50 lit. g de la Ley 1480 de 2011, modificado por la Ley 2439 de 2024), que también sirve para
 * las consultas y reclamos sobre datos personales (arts. 14 y 15 de la Ley 1581 de 2012).
 * Se responde con `npm run pqr`.
 */
export const PQR_TYPES = ['peticion', 'queja', 'reclamo', 'datos'];
const DAILY_PQRS = 5;

export const radicado = (row) => `PQR-${row.created_at.slice(0, 4)}-${String(row.id).padStart(5, '0')}`;

export const toPqr = (r) => ({
  id: r.id,
  radicado: radicado(r),
  type: r.type,
  subject: r.subject,
  message: r.message,
  status: r.status,
  response: r.response,
  createdAt: r.created_at,
  respondedAt: r.responded_at,
});

const listOf = (db, user) =>
  db.prepare('SELECT * FROM pqrs WHERE user_id = ? AND email = ? ORDER BY id DESC').all(user.id, user.email.toLowerCase()).map(toPqr);

export function registerPqrRoutes(router, { db, now }) {
  // Disponible aunque la persona no haya aceptado una versión nueva de los términos: puede querer reclamar por ello.
  router.get('/api/pqrs', ({ user }) => ({ pqrs: listOf(db, user) }), { consent: false });

  router.post(
    '/api/pqrs',
    ({ user, body }) => {
      const v = new Validator(body);
      v.oneOf('type', PQR_TYPES);
      v.string('subject', { required: true, max: 120 });
      v.string('message', { required: true, max: 3000 });
      const d = v.check();
      const since = new Date(now().getTime() - 24 * 60 * 60 * 1000).toISOString();
      const recent = db.prepare('SELECT COUNT(*) AS n FROM pqrs WHERE user_id = ? AND created_at > ?').get(user.id, since).n;
      if (recent >= DAILY_PQRS) {
        throw new HttpError(429, 'TOO_MANY_PQRS', `Llegaste al máximo de ${DAILY_PQRS} solicitudes en 24 horas. Si es urgente, escríbenos al correo de contacto de la Política de privacidad.`);
      }
      const r = db
        .prepare('INSERT INTO pqrs (user_id, email, type, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, user.email.toLowerCase(), d.type, d.subject, d.message, now().toISOString());
      return reply(201, { pqr: toPqr(db.prepare('SELECT * FROM pqrs WHERE id = ?').get(Number(r.lastInsertRowid))) });
    },
    { consent: false },
  );
}

/** Responde una PQR (solo desde `npm run pqr`). */
export function answerPqr(db, id, response, at = new Date()) {
  const text = typeof response === 'string' ? response.trim() : '';
  if (!text || text.length > 3000) throw new HttpError(400, 'VALIDATION', 'La respuesta es obligatoria (máximo 3000 caracteres)');
  const row = db.prepare('SELECT * FROM pqrs WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'NOT_FOUND', `No existe la PQR #${id}`);
  if (row.status === 'respondida') throw new HttpError(409, 'ALREADY_ANSWERED', `${radicado(row)} ya está respondida`);
  db.prepare("UPDATE pqrs SET status = 'respondida', response = ?, responded_at = ? WHERE id = ?").run(text, at.toISOString(), id);
  return toPqr(db.prepare('SELECT * FROM pqrs WHERE id = ?').get(id));
}
