import { Validator, HttpError, validationError, notFound, parseId } from '../validation.js';
import { transaction, NOW_SQL } from '../db.js';
import { monthTaxes } from '../calc.js';
import { getPlan, requireContador } from '../plans.js';
import { getSettings } from './settings.js';
import { buildReport } from './report.js';
import { reminderData } from './reminders.js';
import { appendConsents, CONSENT_LABELS } from '../legal.js';
import { requireVerifiedEmail } from '../account.js';

/**
 * Plan Contador (fase 10, docs/10-plan-contador.md).
 * - El cliente invita a su contador por correo, con su autorización (Ley 1581 de 2012), y puede quitarle el acceso.
 * - El contador (plan Contador activo) acepta y ve los datos de sus clientes en SOLO LECTURA: todas sus rutas
 *   sobre un cliente son GET; cualquier otro método responde 405.
 * - Sin plan o sin vínculo activo no ve nada: 403 (plan) o 404 (como si el cliente no existiera).
 */
const DAILY_INVITES = 10;
const NO_ACCESS = 'Este cliente ya no te da acceso o no existe';

const linkByClient = (db, clientId) => db.prepare('SELECT * FROM accountant_links WHERE client_user_id = ?').get(clientId);

/** Lo que ve el cliente de su contador. Nunca revela si el correo invitado tiene cuenta mientras está pendiente. */
function linkView(db, row, today) {
  if (!row) return null;
  const active = row.status === 'activo';
  const acc = active ? db.prepare('SELECT name FROM users WHERE id = ?').get(row.accountant_user_id) : null;
  return {
    email: row.accountant_email,
    status: row.status,
    name: acc?.name ?? null,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    lastAccessAt: row.last_access_at,
    accountantActive: active ? getPlan(db, row.accountant_user_id, today).tier === 'contador' : null,
  };
}

/** Nombre que identifica a un cliente: su razón social o, si no la tiene, su nombre. */
const clientName = (u, s) => s?.business_name || u.name;

/** Resumen de un cliente para el panel del contador: reserva del mes, próxima declaración y avisos. */
function clientSummary(db, clientId, today) {
  const settings = getSettings(db, clientId);
  const month = today.slice(0, 7);
  const year = month.slice(0, 4);
  const rows = db
    .prepare(
      `SELECT type, date, category, base_cents, vat_rate, irpf_rate, deductible FROM movements
       WHERE user_id = ? AND date BETWEEN ? AND ?`,
    )
    .all(clientId, `${year}-01-01`, `${year}-12-31`);
  const reserve = monthTaxes(rows, month, { vatResponsible: settings.vat_responsible }).totalReserve;
  const rem = reminderData(db, clientId, today);
  const when = (d) => d.exactDate ?? d.windowTo;
  const next = rem.upcoming.filter((d) => !d.filed && d.hasOperations).sort((a, b) => when(a).localeCompare(when(b)))[0] ?? null;
  return { settings, reserve, next, activeReminders: rem.active.length };
}

export function registerAccountantRoutes(router, { db, today, legal, now: clock }) {
  /** Deja constancia de la autorización (o de su revocación) para compartir los datos con el contador. */
  const logSharing = (user, req, ip, action, accountantEmail) =>
    appendConsents(
      db,
      legal,
      [
        {
          purpose: 'compartir_contador',
          doc: 'privacidad',
          action,
          label: action === 'acepta' ? CONSENT_LABELS.contador : CONSENT_LABELS.contadorRevoca,
          detail: `Contador: ${accountantEmail}`,
        },
      ],
      { userId: user.id, email: user.email, ip, userAgent: req.headers['user-agent'], context: 'contador', now: clock() },
    );

  // ---------------------------------------------------------------- cliente
  router.get('/api/accountant', ({ user }) => ({ link: linkView(db, linkByClient(db, user.id), today()) }));

  router.post('/api/accountant', ({ user, body, req, ip }) => {
    // Fase 13: el cliente debe tener el correo confirmado (es por donde se le avisa de cambios de seguridad).
    requireVerifiedEmail(user, 'Confirma tu correo para invitar a tu contador.');
    const now = today();
    const v = new Validator(body);
    const email = v.email('email');
    if (body.authorize !== true) v.fail('authorize', 'Marca la autorización para invitar a tu contador');
    v.check();
    if (email === user.email.toLowerCase()) throw validationError({ email: 'No puedes invitarte a ti mismo' });

    const current = linkByClient(db, user.id);
    if (current && current.status !== 'rechazado') {
      throw new HttpError(409, 'ALREADY_INVITED', 'Ya tienes un contador o una invitación pendiente. Quítala antes de invitar a otro correo.');
    }
    const sentToday = db.prepare('SELECT COUNT(*) AS n FROM accountant_invites WHERE user_id = ? AND invited_on = ?').get(user.id, now).n;
    if (sentToday >= DAILY_INVITES) {
      throw new HttpError(429, 'TOO_MANY_INVITES', `Llegaste al máximo de ${DAILY_INVITES} invitaciones por día. Inténtalo mañana.`);
    }
    // La respuesta es la misma exista o no una cuenta con ese correo: el contador se fija al aceptar.
    transaction(db, () => {
      db.prepare('DELETE FROM accountant_links WHERE client_user_id = ?').run(user.id);
      db.prepare("INSERT INTO accountant_links (client_user_id, accountant_email, status) VALUES (?, ?, 'pendiente')").run(user.id, email);
      // Para el límite solo cuentan las de hoy: las de días anteriores se borran (la tabla no crece sin fin).
      db.prepare('DELETE FROM accountant_invites WHERE invited_on < ?').run(now);
      db.prepare('INSERT INTO accountant_invites (user_id, invited_on) VALUES (?, ?)').run(user.id, now);
      logSharing(user, req, ip, 'acepta', email);
    });
    return { link: linkView(db, linkByClient(db, user.id), now) };
  });

  // Cancelar la invitación o quitar el acceso: efecto inmediato.
  router.delete('/api/accountant', ({ user, req, ip }) => {
    transaction(db, () => {
      const current = linkByClient(db, user.id);
      db.prepare('DELETE FROM accountant_links WHERE client_user_id = ?').run(user.id);
      if (current && current.status !== 'rechazado') logSharing(user, req, ip, 'revoca', current.accountant_email);
    });
    return undefined;
  });

  // ---------------------------------------------------------------- contador
  router.get('/api/clients', ({ user }) => {
    const now = today();
    requireContador(db, user.id, now);
    // Fase 13: las invitaciones solo se ven con el correo confirmado. Si no, alguien que se registrara
    // con el correo del contador antes que él podría aceptar la invitación y ver los datos del cliente.
    const verified = Boolean(user.email_verified_at);
    const invitations = !verified
      ? []
      : db
          .prepare(
            `SELECT l.id, l.invited_at, u.name, u.email, s.business_name FROM accountant_links l
             JOIN users u ON u.id = l.client_user_id LEFT JOIN settings s ON s.user_id = u.id
             WHERE l.status = 'pendiente' AND l.accountant_email = ? ORDER BY l.invited_at`,
          )
          .all(user.email)
          .map((r) => ({ id: r.id, name: clientName(r, r), email: r.email, invitedAt: r.invited_at }));

    const when = (c) => (c.next ? c.next.exactDate ?? c.next.windowTo : '9999');
    const clients = db
      .prepare(
        `SELECT l.id, l.accepted_at, l.last_access_at, u.id AS user_id, u.name, u.email FROM accountant_links l
         JOIN users u ON u.id = l.client_user_id
         WHERE l.status = 'activo' AND l.accountant_user_id = ?`,
      )
      .all(user.id)
      .map((r) => {
        const s = clientSummary(db, r.user_id, now);
        return {
          id: r.id,
          name: clientName(r, s.settings),
          nif: s.settings.nif,
          email: r.email,
          since: r.accepted_at,
          // La reserva va en la moneda del cliente (puede no ser la del contador).
          currency: s.settings.currency,
          reserve: s.reserve,
          next: s.next,
          activeReminders: s.activeReminders,
        };
      })
      .sort((a, b) => when(a).localeCompare(when(b)) || a.name.localeCompare(b.name, 'es'));
    return { email: user.email, invitations, invitationsHidden: !verified, clients };
  });

  const pendingFor = (user, params) => {
    requireVerifiedEmail(user, 'Confirma tu correo para responder invitaciones de tus clientes.');
    const row = db
      .prepare("SELECT id FROM accountant_links WHERE id = ? AND status = 'pendiente' AND accountant_email = ?")
      .get(parseId(params.id), user.email);
    if (!row) throw notFound('Invitación no encontrada');
    return row;
  };

  router.post('/api/clients/invitations/:id/accept', ({ user, params }) => {
    requireContador(db, user.id, today());
    const row = pendingFor(user, params);
    db.prepare(
      `UPDATE accountant_links SET status = 'activo', accountant_user_id = ?, accepted_at = ${NOW_SQL}, updated_at = ${NOW_SQL} WHERE id = ?`,
    ).run(user.id, row.id);
    return undefined;
  });

  router.post('/api/clients/invitations/:id/reject', ({ user, params }) => {
    const row = pendingFor(user, params);
    db.prepare(`UPDATE accountant_links SET status = 'rechazado', updated_at = ${NOW_SQL} WHERE id = ?`).run(row.id);
    return undefined;
  });

  // Dejar de atender a un cliente (también sin plan activo).
  router.delete('/api/clients/:id', ({ user, params }) => {
    const r = db.prepare("DELETE FROM accountant_links WHERE id = ? AND status = 'activo' AND accountant_user_id = ?").run(parseId(params.id), user.id);
    if (!r.changes) throw notFound(NO_ACCESS);
    return undefined;
  });

  /** Cliente al que el contador puede leer ahora mismo (si no, 403 o 404). */
  function clientFor(user, params) {
    requireContador(db, user.id, today());
    const link = db
      .prepare("SELECT id, client_user_id, accepted_at FROM accountant_links WHERE id = ? AND status = 'activo' AND accountant_user_id = ?")
      .get(parseId(params.id), user.id);
    if (!link) throw notFound(NO_ACCESS);
    const client = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(link.client_user_id);
    return { link, client };
  }

  /** Lee datos del cliente y, solo si la lectura sale bien, registra el «Último acceso» que ve el cliente. */
  async function readAs(user, params, read) {
    const { link, client } = clientFor(user, params);
    const result = await read(client, link);
    db.prepare(`UPDATE accountant_links SET last_access_at = ${NOW_SQL} WHERE id = ?`).run(link.id);
    return result;
  }

  router.get('/api/clients/:id', ({ user, params }) =>
    readAs(user, params, (client, link) => {
      const s = getSettings(db, client.id);
      return {
        client: {
          id: link.id,
          name: clientName(client, s),
          user_name: client.name,
          email: client.email,
          business_name: s.business_name,
          nif: s.nif,
          address: s.address,
          vat_responsible: s.vat_responsible,
          vat_period: s.vat_period,
          currency: s.currency,
          since: link.accepted_at,
        },
      };
    }),
  );

  // Los mismos datos que el cliente ve en su app, con las mismas rutas por dentro, como si fuera él.
  const delegate = (target) => (ctx) =>
    readAs(ctx.user, ctx.params, (client) => {
      const m = router.match('GET', target(ctx.params));
      return m.route.handler({ ...ctx, user: { ...client, session_id: null }, params: m.params });
    });
  router.get('/api/clients/:id/summary', delegate(() => '/api/summary'));
  router.get('/api/clients/:id/analytics', delegate(() => '/api/analytics'));
  router.get('/api/clients/:id/movements', delegate(() => '/api/movements'));
  router.get('/api/clients/:id/invoices', delegate(() => '/api/invoices'));
  router.get('/api/clients/:id/invoices/:inv', delegate((p) => `/api/invoices/${encodeURIComponent(p.inv)}`));

  // Informe y declaraciones del cliente: los paga el plan Contador, aunque el cliente esté en Gratis.
  router.get('/api/clients/:id/report', ({ user, params, query }) => readAs(user, params, (client) => buildReport(db, client, query, today())));
  router.get('/api/clients/:id/reminders', ({ user, params }) => readAs(user, params, (client) => reminderData(db, client.id, today())));
}
