// Registro de consentimientos, para el administrador (docs/12-legal-y-seguridad.md).
// Sirve para demostrar ante una autoridad o un reclamo cuándo y cómo aceptó cada persona.
//   npm run consentimientos -- --email=ana@correo.com    → todas las aceptaciones y revocaciones de ese correo
//   npm run consentimientos -- --texto=<huella>          → el texto exacto del documento que se aceptó
//   npm run consentimientos -- --verificar               → comprueba que nadie haya modificado el registro
//   Opción: --db=ruta/app.db (o la variable DB_PATH). Se puede usar con el servidor en marcha.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { APP_TIMEZONE } from '../server/calc.js';
import { CONTEXT_LABELS, verifyConsentChain } from '../server/legal.js';

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
if (!args.email && !args.verificar && !args.texto) fail('Usa --email=correo, --texto=huella o --verificar');

const when = new Intl.DateTimeFormat('es-CO', { timeZone: APP_TIMEZONE, dateStyle: 'long', timeStyle: 'medium' });

const db = openDb(dbPath);
try {
  if (args.verificar) {
    const r = verifyConsentChain(db);
    if (r.ok) console.log(`Registro íntegro: ${r.rows} filas verificadas, ninguna modificada ni borrada.`);
    else fail(`Registro alterado en la fila #${r.brokenAt}: ${r.reason}.`);
  }
  if (typeof args.texto === 'string') {
    const t = db.prepare('SELECT * FROM legal_texts WHERE sha256 = ?').get(args.texto.trim().toLowerCase());
    if (!t) fail('No hay ningún texto con esa huella');
    console.log(`${t.doc} · versión ${t.version} · publicado desde ${when.format(new Date(t.first_seen_at))}\n\n${t.content}`);
  }
  if (typeof args.email === 'string') {
    const rows = db.prepare('SELECT * FROM consents WHERE email = ? ORDER BY id').all(args.email.trim().toLowerCase());
    if (!rows.length) console.log(`No hay consentimientos registrados para ${args.email}.`);
    for (const r of rows) {
      console.log(
        `#${r.id}  ${when.format(new Date(r.accepted_at))}  ${r.action === 'acepta' ? 'ACEPTÓ' : 'REVOCÓ'} ${r.purpose} v${r.version}` +
          `  · ${CONTEXT_LABELS[r.context] ?? r.context}${r.detail ? ` · ${r.detail}` : ''}\n` +
          `     casilla: «${r.label}»\n     IP ${r.ip} · ${r.user_agent || 'navegador desconocido'}\n     texto aceptado (huella): ${r.text_sha256}`,
      );
    }
  }
} finally {
  db.close();
}
