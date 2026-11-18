/**
 * Cobro manual de los planes (fase 11, docs/11-cobro-manual.md).
 * El cliente paga POR FUERA de la app (transferencia, Nequi…) y avisa que pagó. El administrador comprueba
 * en su banco que el dinero llegó y aprueba el aviso con `npm run pagos`. La app nunca recibe dinero
 * ni activa un plan sola.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { HttpError } from './validation.js';
import { transaction, NOW_SQL } from './db.js';
import { addDays, getPlan } from './plans.js';

/** Precio mensual en centavos de peso colombiano (siempre en pesos, sea cual sea la moneda del usuario). */
export const MONTHLY_CENTS = { pro: 1_490_000, contador: 5_990_000 };
export const PAYMENT_MONTHS = [1, 3, 6, 12];
export const DAYS_PER_MONTH = 30;

const TIER_NAME = { pro: 'Pro', contador: 'Contador' };
export const tierName = (t) => TIER_NAME[t] ?? t;

/* ---------------------------------------------------------------- configuración (data/cobro.json) */

/** Comprueba el contenido de cobro.json. Lanza un Error con el motivo si no es válido. */
export function validatePaymentConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('debe ser un objeto JSON');
  const metodos = raw.metodos;
  if (!Array.isArray(metodos) || metodos.length === 0 || metodos.length > 10) throw new Error('"metodos" debe tener entre 1 y 10 métodos');
  const methods = metodos.map((m, i) => {
    const nombre = typeof m?.nombre === 'string' ? m.nombre.trim() : '';
    const detalle = typeof m?.detalle === 'string' ? m.detalle.trim() : '';
    if (!nombre || nombre.length > 60) throw new Error(`método ${i + 1}: "nombre" obligatorio, máximo 60 caracteres`);
    if (!detalle || detalle.length > 300) throw new Error(`método ${i + 1}: "detalle" obligatorio, máximo 300 caracteres`);
    return { name: nombre, detail: detalle };
  });
  if (new Set(methods.map((m) => m.name.toLowerCase())).size !== methods.length) throw new Error('hay dos métodos con el mismo nombre');
  const contacto = raw.contacto === undefined ? '' : raw.contacto;
  if (typeof contacto !== 'string' || contacto.length > 300) throw new Error('"contacto" debe ser texto de máximo 300 caracteres');
  return { methods, contact: contacto.trim() };
}

/**
 * Lector de cobro.json. Se relee cuando el archivo cambia (no hace falta reiniciar).
 * Sin archivo, o con un archivo no válido, devuelve null: la app se ve como si no hubiera cobro.
 */
export function paymentConfigLoader(file, logger = console) {
  let cache = null;
  return function load() {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8'); // es pequeño: se lee en cada uso y así nunca queda desactualizado
    } catch {
      cache = null;
      return null;
    }
    if (cache && cache.text === text) return cache.value;
    let value = null;
    try {
      // El Bloc de notas de Windows guarda con BOM: se quita antes de leer el JSON.
      value = validatePaymentConfig(JSON.parse(text.replace(/^﻿/, '')));
    } catch (err) {
      logger.error(`[cobro] ${file} no es válido (${err.message}). «Comprar» no aparecerá hasta corregirlo.`);
    }
    cache = { text, value };
    return value;
  };
}

/* ---------------------------------------------------------------- referencia de pago */

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O, 0, I ni 1

/** Referencia fija de la cuenta (CC-XXXXXX); se crea la primera vez. */
export function referenceFor(db, userId) {
  const row = db.prepare('SELECT reference FROM payment_refs WHERE user_id = ?').get(userId);
  if (row) return row.reference;
  for (let i = 0; i < 20; i++) {
    const ref = `CC-${Array.from(crypto.randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')}`;
    const r = db.prepare('INSERT OR IGNORE INTO payment_refs (user_id, reference) VALUES (?, ?)').run(userId, ref);
    if (r.changes) return ref;
    const again = db.prepare('SELECT reference FROM payment_refs WHERE user_id = ?').get(userId);
    if (again) return again.reference; // otra petición la creó a la vez
  }
  throw new Error('No se pudo crear la referencia de pago');
}

/* ---------------------------------------------------------------- avisos de pago */

const COLUMNS = `id, user_id, reference, tier, months, expected_cents, amount_cents, method, paid_on, receipt, note,
  status, reason, plan_until, created_at, reviewed_at`;

export const toPayment = (r) => ({
  id: r.id,
  reference: r.reference,
  tier: r.tier,
  months: r.months,
  expected_cents: r.expected_cents,
  amount_cents: r.amount_cents,
  method: r.method,
  paid_on: r.paid_on,
  receipt: r.receipt,
  note: r.note,
  status: r.status,
  reason: r.reason,
  plan_until: r.plan_until,
  created_at: r.created_at,
  reviewed_at: r.reviewed_at,
});

export const paymentsOf = (db, userId) =>
  db.prepare(`SELECT ${COLUMNS} FROM payments WHERE user_id = ? ORDER BY created_at DESC, id DESC`).all(userId).map(toPayment);

export const findPayment = (db, id) => db.prepare(`SELECT ${COLUMNS} FROM payments WHERE id = ?`).get(id);

/**
 * Hasta cuándo dura el plan si se aprueba un pago de `tier` por `months` meses en la fecha `today`.
 * - Mismo plan activo con fecha de fin: los días se suman después de esa fecha.
 * - Si no: empieza hoy, contando hoy (30 días = hoy + 29).
 * - Mismo plan activo sin fecha de fin (activado por el administrador): sigue sin fecha de fin (null).
 */
export function untilAfterPayment(plan, tier, months, today) {
  const days = months * DAYS_PER_MONTH;
  if (plan.tier === tier) {
    if (!plan.until) return null;
    return addDays(plan.until, days);
  }
  return addDays(today, days - 1);
}

/** Aprueba un aviso pendiente y activa el plan. Devuelve el aviso aprobado. */
export function approvePayment(db, id, today) {
  return transaction(db, () => {
    const p = findPayment(db, id);
    if (!p) throw new HttpError(404, 'NOT_FOUND', `No existe el pago #${id}`);
    if (p.status !== 'pendiente') throw new HttpError(409, 'NOT_PENDING', `El pago #${id} no está pendiente (está ${p.status})`);
    const plan = getPlan(db, p.user_id, today);
    const until = untilAfterPayment(plan, p.tier, p.months, today);
    // Si el plan no tiene fecha de fin (administrador) y es el mismo, se deja como está.
    if (!(plan.tier === p.tier && !plan.until)) {
      db.prepare('INSERT OR IGNORE INTO plans (user_id) VALUES (?)').run(p.user_id);
      db.prepare(`UPDATE plans SET pro_source = 'pago', pro_until = ?, tier = ?, updated_at = ${NOW_SQL} WHERE user_id = ?`).run(until, p.tier, p.user_id);
    }
    db.prepare(`UPDATE payments SET status = 'aprobado', plan_until = ?, reviewed_at = ${NOW_SQL} WHERE id = ?`).run(until, id);
    return toPayment(findPayment(db, id));
  });
}

/** Rechaza un aviso pendiente con un motivo que verá el cliente. */
export function rejectPayment(db, id, reason) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > 200) throw new HttpError(400, 'VALIDATION', 'El motivo es obligatorio (máximo 200 caracteres)');
  return transaction(db, () => {
    const p = findPayment(db, id);
    if (!p) throw new HttpError(404, 'NOT_FOUND', `No existe el pago #${id}`);
    if (p.status !== 'pendiente') throw new HttpError(409, 'NOT_PENDING', `El pago #${id} no está pendiente (está ${p.status})`);
    db.prepare(`UPDATE payments SET status = 'rechazado', reason = ?, reviewed_at = ${NOW_SQL} WHERE id = ?`).run(text, id);
    return toPayment(findPayment(db, id));
  });
}
