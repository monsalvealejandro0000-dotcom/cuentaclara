// Plan de una cuenta, para el administrador. La app no cobra en línea: así se activa Pro a mano.
//   npm run plan -- --email=ana@correo.com                                → muestra su plan
//   npm run plan -- --email=ana@correo.com --plan=pro                     → Pro sin fecha de fin
//   npm run plan -- --email=ana@correo.com --plan=pro --hasta=2027-01-31  → Pro hasta ese día (incluido)
//   npm run plan -- --email=ana@correo.com --plan=contador                → plan Contador (incluye Pro y el panel de clientes)
//   npm run plan -- --email=ana@correo.com --plan=gratis                  → vuelve a Gratis (no borra ningún dato)
//   Opción: --db=ruta/app.db (o la variable DB_PATH). Se puede usar con el servidor en marcha.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { getPlan, setPlanByAdmin } from '../server/plans.js';
import { todayLocal } from '../server/calc.js';
import { isValidDate } from '../server/validation.js';

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
const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
const tier = args.plan;
const until = args.hasta;
const today = todayLocal();

if (!email) fail('Indica la cuenta con --email=correo@ejemplo.com');
if (tier !== undefined && !['pro', 'contador', 'gratis'].includes(tier)) fail('--plan debe ser "pro", "contador" o "gratis"');
if (until !== undefined) {
  if (tier !== 'pro' && tier !== 'contador') fail('--hasta solo se usa con --plan=pro o --plan=contador');
  if (!isValidDate(until)) fail('--hasta debe ser una fecha AAAA-MM-DD');
  if (until < today) fail(`--hasta (${until}) ya pasó: hoy es ${today}`);
}
if (!fs.existsSync(dbPath)) fail(`No existe la base de datos: ${dbPath}`);

const fmt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
function describe(p) {
  if (p.tier === 'gratis') {
    return `Gratis${p.trialEndedOn ? ` (su prueba de Pro terminó el ${fmt(p.trialEndedOn)})` : p.trialAvailable ? ' (puede probar Pro 30 días)' : ''}`;
  }
  const how = p.source === 'prueba' ? 'prueba gratis' : 'activado por el administrador';
  return `${p.tier === 'contador' ? 'Contador' : 'Pro'}, ${how}, ${p.until ? `hasta el ${fmt(p.until)}` : 'sin fecha de fin'}`;
}

const db = openDb(dbPath);
try {
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  if (!user) fail(`No hay ninguna cuenta con el email ${email}`);
  if (tier) {
    setPlanByAdmin(db, user.id, tier, tier === 'gratis' ? null : until ?? null);
    console.log(`Plan cambiado. ${user.email}: ${describe(getPlan(db, user.id, today))}`);
  } else {
    console.log(`${user.email}: ${describe(getPlan(db, user.id, today))}`);
  }
} finally {
  db.close();
}
