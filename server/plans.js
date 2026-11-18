/**
 * Planes (fase 9, docs/09-planes.md).
 * - Gratis por defecto: todo lo que la app tenía antes de esta fase.
 * - Pro: avisos de declaración e informe para el contador. Se activa con una prueba gratis de
 *   30 días (una por cuenta) o por el administrador (npm run plan). No hay cobro en línea.
 * El servidor bloquea las funciones Pro: la interfaz solo refleja lo que dice aquí.
 */
import { HttpError } from './validation.js';
import { NOW_SQL } from './db.js';

export const TRIAL_DAYS = 30;

/** "2026-11-16" + 30 → "2026-12-16". */
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Días de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from, to) {
  const t = (iso) => Date.UTC(...iso.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  return Math.round((t(to) - t(from)) / 86400000);
}

function row(db, userId) {
  return db.prepare('SELECT pro_source, pro_until, trial_until, tier FROM plans WHERE user_id = ?').get(userId);
}

/**
 * Plan de un usuario en la fecha `today` (AAAA-MM-DD).
 * `tier`: 'gratis', 'pro' o 'contador' (el plan Contador incluye todo lo de Pro; fase 10).
 */
export function getPlan(db, userId, today) {
  const r = row(db, userId) ?? { pro_source: null, pro_until: null, trial_until: null, tier: 'pro' };
  const pro = Boolean(r.pro_source) && (!r.pro_until || r.pro_until >= today);
  return {
    tier: pro ? (r.tier === 'contador' ? 'contador' : 'pro') : 'gratis',
    source: pro ? r.pro_source : null,
    until: pro ? r.pro_until : null,
    // Días de Pro que quedan contando hoy: el último día vale 1.
    daysLeft: pro && r.pro_until ? daysBetween(today, r.pro_until) + 1 : null,
    trialAvailable: !pro && !r.trial_until,
    trialEndedOn: !pro && r.trial_until && r.trial_until < today ? r.trial_until : null,
    trialDays: TRIAL_DAYS,
    today,
  };
}

/** Pro o Contador: las funciones de Pro. */
export const hasPro = (plan) => plan.tier === 'pro' || plan.tier === 'contador';
export const isPro = (db, userId, today) => hasPro(getPlan(db, userId, today));
export const isContador = (db, userId, today) => getPlan(db, userId, today).tier === 'contador';

/** Lanza 403 PLAN_REQUIRED si el usuario no tiene Pro (o Contador). */
export function requirePro(db, userId, today) {
  if (!isPro(db, userId, today)) throw new HttpError(403, 'PLAN_REQUIRED', 'Esta función es del plan Pro');
}

/** Lanza 403 PLAN_REQUIRED si el usuario no tiene el plan Contador. */
export function requireContador(db, userId, today) {
  if (!isContador(db, userId, today)) throw new HttpError(403, 'PLAN_REQUIRED', 'Esta función es del plan Contador');
}

function upsert(db, userId, fields) {
  db.prepare('INSERT OR IGNORE INTO plans (user_id) VALUES (?)').run(userId);
  const keys = Object.keys(fields);
  db.prepare(`UPDATE plans SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ${NOW_SQL} WHERE user_id = ?`).run(
    ...keys.map((k) => fields[k]),
    userId,
  );
}

/** Activa la prueba gratis: 30 días de Pro contando hoy (último día: hoy + 29). Solo una vez por cuenta. */
export function startTrial(db, userId, today) {
  const plan = getPlan(db, userId, today);
  if (hasPro(plan)) throw new HttpError(409, 'ALREADY_PRO', 'Ya tienes el plan Pro');
  if (!plan.trialAvailable) throw new HttpError(409, 'TRIAL_USED', 'Ya usaste la prueba gratis de Pro');
  const until = addDays(today, TRIAL_DAYS - 1);
  upsert(db, userId, { pro_source: 'prueba', pro_until: until, trial_until: until, tier: 'pro' });
  return getPlan(db, userId, today);
}

/**
 * Cambio de plan hecho por el administrador (scripts/plan.js).
 * `tier`: 'pro', 'contador' o 'gratis'. `until` opcional (AAAA-MM-DD). Volver a Gratis no borra datos.
 */
export function setPlanByAdmin(db, userId, tier, until = null) {
  if (tier === 'pro' || tier === 'contador') upsert(db, userId, { pro_source: 'administrador', pro_until: until, tier });
  else upsert(db, userId, { pro_source: null, pro_until: null });
}
