// Peticiones, quejas y reclamos (PQR), para el administrador (docs/12-legal-y-seguridad.md).
// Plazos máximos de respuesta: 15 días hábiles (reclamos y quejas; también reclamos de datos personales)
// y 10 días hábiles para las consultas de datos personales.
//   npm run pqr                                          → PQR sin responder, de la más antigua a la más nueva
//   npm run pqr -- --todos                               → también las respondidas
//   npm run pqr -- --ver=12                              → el mensaje completo
//   npm run pqr -- --responder=12 --respuesta="…"        → la persona verá la respuesta en la app
//   Opción: --db=ruta/app.db (o la variable DB_PATH). Se puede usar con el servidor en marcha.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { APP_TIMEZONE } from '../server/calc.js';
import { answerPqr, radicado } from '../server/routes/pqr.js';

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
const idArg = args.responder ?? args.ver;
if (idArg !== undefined && !/^\d{1,15}$/.test(String(idArg))) fail('Indica el número de la PQR, p. ej. --responder=12');
if (args.responder !== undefined && (typeof args.respuesta !== 'string' || !args.respuesta.trim())) fail('Para responder, indica la respuesta: --respuesta="…"');

const TYPE = { peticion: 'Petición', queja: 'Queja', reclamo: 'Reclamo', datos: 'Datos personales' };
const when = new Intl.DateTimeFormat('es-CO', { timeZone: APP_TIMEZONE, dateStyle: 'short', timeStyle: 'short' });
const daysAgo = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const db = openDb(dbPath);
try {
  if (args.responder !== undefined) {
    try {
      const p = answerPqr(db, Number(args.responder), args.respuesta);
      console.log(`${p.radicado} respondida. La persona la verá en la app (Peticiones, quejas y reclamos).`);
    } catch (err) {
      fail(err.message);
    }
  } else if (args.ver !== undefined) {
    const r = db.prepare('SELECT * FROM pqrs WHERE id = ?').get(Number(args.ver));
    if (!r) fail(`No existe la PQR #${args.ver}`);
    console.log(`${radicado(r)} · ${TYPE[r.type]} · ${r.email} · radicada ${when.format(new Date(r.created_at))} (hace ${daysAgo(r.created_at)} días)`);
    console.log(`Asunto: ${r.subject}\n\n${r.message}\n`);
    console.log(r.status === 'respondida' ? `Respondida ${when.format(new Date(r.responded_at))}:\n${r.response}` : 'Sin responder.');
  } else {
    const rows = db.prepare(`SELECT * FROM pqrs ${args.todos ? '' : "WHERE status = 'radicada'"} ORDER BY id`).all();
    if (!rows.length) console.log(args.todos ? 'No hay PQR.' : 'No hay PQR sin responder.');
    for (const r of rows) {
      const state = r.status === 'respondida' ? `  [respondida ${when.format(new Date(r.responded_at))}]` : `  (hace ${daysAgo(r.created_at)} días)`;
      console.log(`#${r.id}  ${radicado(r)}  ${TYPE[r.type]}  ${r.email}  «${r.subject}»  radicada ${when.format(new Date(r.created_at))}${state}`);
    }
  }
} finally {
  db.close();
}
