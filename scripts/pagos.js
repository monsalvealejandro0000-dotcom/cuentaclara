// Avisos de pago de los planes, para el administrador (fase 11, docs/11-cobro-manual.md).
// Comprueba SIEMPRE en tu banco o en tu Nequi que el dinero llegó antes de aprobar: este comando no lo verifica.
//   npm run pagos                                        → avisos pendientes de revisar
//   npm run pagos -- --todos                             → también los aprobados, rechazados y cancelados
//   npm run pagos -- --aprobar=12                        → activa el plan por los meses pagados
//   npm run pagos -- --rechazar=12 --motivo="No llegó"   → lo rechaza; el cliente verá el motivo
//   Opción: --db=ruta/app.db (o la variable DB_PATH). Se puede usar con el servidor en marcha.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { getPlan } from '../server/plans.js';
import { todayLocal, APP_TIMEZONE } from '../server/calc.js';
import { approvePayment, rejectPayment, tierName } from '../server/payments.js';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...rest] = a.slice(2).split('=');
    return [k, rest.join('=') || true];
  }),
);
const fail = (msg) => {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
};

const dbPath = path.resolve(args.db || process.env.DB_PATH || path.join(APP_DIR, 'data', 'app.db'));
if (!fs.existsSync(dbPath)) fail(`No existe la base de datos: ${dbPath}`);
if (args.aprobar !== undefined && args.rechazar !== undefined) fail('Usa --aprobar o --rechazar, no los dos');
const idArg = args.aprobar ?? args.rechazar;
if (idArg !== undefined && !/^\d{1,15}$/.test(String(idArg))) fail('Indica el número del pago, p. ej. --aprobar=12');
if (args.rechazar !== undefined && (typeof args.motivo !== 'string' || !args.motivo.trim())) fail('Para rechazar, indica el motivo: --motivo="…"');

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const money = (cents) => pesos.format(cents / 100);
const fmt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const when = new Intl.DateTimeFormat('es-CO', { timeZone: APP_TIMEZONE, dateStyle: 'short', timeStyle: 'short' });
const today = todayLocal();

function line(p, email) {
  const diff = p.amount_cents !== p.expected_cents ? `  ⚠ dijo ${money(p.amount_cents)}, se esperaba ${money(p.expected_cents)}` : '';
  const state = p.status === 'pendiente' ? '' : `  [${p.status}${p.reason ? `: ${p.reason}` : ''}]`;
  return (
    `#${p.id}  ${p.reference}  ${email}  ${tierName(p.tier)} · ${p.months} ${p.months === 1 ? 'mes' : 'meses'} · ${money(p.expected_cents)}` +
    `  ${p.method} · ${fmt(p.paid_on)} · comprobante ${p.receipt}${p.note ? ` · nota: ${p.note}` : ''}` +
    `  (enviado ${when.format(new Date(p.created_at))})${state}${diff}`
  );
}

function describePlan(db, userId) {
  const p = getPlan(db, userId, today);
  if (p.tier === 'gratis') return 'Gratis';
  const how = { pago: 'pagado', prueba: 'prueba gratis', administrador: 'activado por el administrador' }[p.source] ?? p.source;
  return `${tierName(p.tier)}, ${how}, ${p.until ? `hasta el ${fmt(p.until)}` : 'sin fecha de fin'}`;
}

const db = openDb(dbPath);
try {
  const emailOf = (userId) => db.prepare('SELECT email FROM users WHERE id = ?').get(userId)?.email ?? '(cuenta eliminada)';
  if (idArg !== undefined) {
    const id = Number(idArg);
    try {
      if (args.aprobar !== undefined) {
        approvePayment(db, id, today);
        const userId = db.prepare('SELECT user_id FROM payments WHERE id = ?').get(id).user_id;
        console.log(`Pago #${id} aprobado. ${emailOf(userId)}: ${describePlan(db, userId)}`);
      } else {
        rejectPayment(db, id, args.motivo);
        console.log(`Pago #${id} rechazado. El cliente verá el motivo en su Configuración.`);
      }
    } catch (err) {
      fail(err.message);
    }
  } else {
    const rows = db
      .prepare(`SELECT * FROM payments ${args.todos ? '' : "WHERE status = 'pendiente'"} ORDER BY created_at, id`)
      .all();
    if (!rows.length) console.log(args.todos ? 'No hay avisos de pago.' : 'No hay avisos de pago pendientes.');
    for (const p of rows) console.log(line(p, emailOf(p.user_id)));
    if (!args.todos && rows.length) console.log('\nComprueba en tu banco que llegó cada pago antes de aprobarlo: npm run pagos -- --aprobar=N');
  }
} finally {
  db.close();
}
