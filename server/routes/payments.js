import { Validator, HttpError, notFound, parseId, isValidDate, MAX_CENTS } from '../validation.js';
import { NOW_SQL, transaction } from '../db.js';
import { appendConsents, checkVersions, CONSENT_LABELS, PAYMENT_DOCS } from '../legal.js';
import { reply } from '../router.js';
import { requireVerifiedEmail } from '../account.js';
import { getPlan } from '../plans.js';
import { MONTHLY_CENTS, PAYMENT_MONTHS, paymentsOf, referenceFor, toPayment, findPayment } from '../payments.js';

/** Avisos de pago del cliente (fase 11). Aprobar o rechazar solo se hace con `npm run pagos`. */
export function registerPaymentRoutes(router, { db, today, paymentConfig, legal, now: clock }) {
  const configOrNotFound = () => {
    const config = paymentConfig();
    if (!config) throw new HttpError(404, 'NO_PAYMENT_CONFIG', 'El pago de los planes aún no está disponible');
    return config;
  };

  router.get('/api/payments/config', ({ user }) => {
    const config = configOrNotFound();
    return {
      methods: config.methods,
      contact: config.contact,
      prices: MONTHLY_CENTS,
      months: PAYMENT_MONTHS,
      reference: referenceFor(db, user.id),
    };
  });

  router.get('/api/payments', ({ user }) => {
    const payments = paymentsOf(db, user.id);
    return { payments, pending: payments.find((p) => p.status === 'pendiente') ?? null };
  });

  router.post('/api/payments', ({ user, body, req, ip }) => {
    const config = configOrNotFound();
    // Fase 13: hace falta un correo confirmado para escribirle sobre su compra (aprobación, reembolso…).
    requireVerifiedEmail(user, 'Confirma tu correo para avisar un pago: lo necesitamos para escribirte sobre tu compra.');
    const now = today();
    const v = new Validator(body);
    const tier = v.oneOf('tier', ['pro', 'contador']);
    const months = body.months;
    if (!PAYMENT_MONTHS.includes(months)) v.fail('months', 'Elige 1, 3, 6 o 12 meses');
    v.oneOf('method', config.methods.map((m) => m.name));
    v.date('paid_on');
    if (v.data.paid_on && v.data.paid_on > now) v.fail('paid_on', 'La fecha del pago no puede ser futura');
    const amount = body.amount_cents;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_CENTS) v.fail('amount_cents', 'Valor no válido');
    v.string('receipt', { required: true, max: 60 });
    v.string('note', { max: 300 });
    if (body.confirm !== true) v.fail('confirm', 'Confirma que hiciste este pago');
    // Contrato de compra: términos + política de reembolsos, y autorización para tratar los datos del pago.
    if (body.accept_terms !== true) v.fail('accept_terms', 'Para comprar debes aceptar los Términos y condiciones y la Política de reembolsos');
    if (body.accept_privacy !== true) v.fail('accept_privacy', 'Para comprar debes autorizar el tratamiento de los datos del pago');
    const d = v.check();
    checkVersions(legal, body.versions, PAYMENT_DOCS);

    if (db.prepare("SELECT 1 FROM payments WHERE user_id = ? AND status = 'pendiente'").get(user.id)) {
      throw new HttpError(409, 'PAYMENT_PENDING', 'Ya tienes un aviso de pago en revisión. Espera a que se confirme o cancélalo.');
    }
    if (tier === 'pro' && getPlan(db, user.id, now).tier === 'contador') {
      throw new HttpError(409, 'ALREADY_INCLUDED', 'Ya tienes el plan Contador, que incluye todo lo de Pro');
    }
    const reference = referenceFor(db, user.id);
    const id = transaction(db, () => {
      const r = db
        .prepare(
          `INSERT INTO payments (user_id, reference, tier, months, expected_cents, amount_cents, method, paid_on, receipt, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(user.id, reference, tier, months, MONTHLY_CENTS[tier] * months, amount, d.method, d.paid_on, d.receipt, d.note);
      const paymentId = Number(r.lastInsertRowid);
      const detail = `Aviso de pago #${paymentId} (${reference})`;
      appendConsents(
        db,
        legal,
        [
          { purpose: 'terminos', doc: 'terminos', label: CONSENT_LABELS.pagoTerminos, detail },
          { purpose: 'reembolsos', doc: 'reembolsos', label: CONSENT_LABELS.pagoTerminos, detail },
          { purpose: 'privacidad', doc: 'privacidad', label: CONSENT_LABELS.pagoPrivacidad, detail },
        ],
        { userId: user.id, email: user.email, ip, userAgent: req.headers['user-agent'], context: 'pago', now: clock() },
      );
      return paymentId;
    });
    return reply(201, { payment: toPayment(findPayment(db, id)) });
  });

  // Cancelar un aviso propio que sigue pendiente (queda en la lista como «cancelado»).
  router.delete('/api/payments/:id', ({ user, params }) => {
    const p = findPayment(db, parseId(params.id));
    if (!p || p.user_id !== user.id) throw notFound('Aviso de pago no encontrado');
    if (p.status !== 'pendiente') throw new HttpError(409, 'NOT_PENDING', 'Solo se puede cancelar un aviso que sigue en revisión');
    db.prepare(`UPDATE payments SET status = 'cancelado', reviewed_at = ${NOW_SQL} WHERE id = ?`).run(p.id);
    return undefined;
  });
}
