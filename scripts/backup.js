// Copia de seguridad manual (se puede ejecutar con el servidor en marcha).
//   npm run backup                       → crea una copia verificada
//   npm run backup -- --list             → lista las copias existentes
//   Opciones: --db=ruta/app.db  --dir=ruta/copias  --keep=14
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createBackup, listBackups } from '../server/backup.js';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...rest] = a.slice(2).split('=');
    return [k, rest.join('=') || true];
  }),
);

const dbPath = path.resolve(args.db || process.env.DB_PATH || path.join(APP_DIR, 'data', 'app.db'));
const dir = path.resolve(args.dir || process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups'));
const keep = Number(args.keep || process.env.BACKUP_KEEP || 14);

if (args.list) {
  const all = listBackups(dir);
  if (!all.length) console.log(`No hay copias en ${dir}`);
  for (const b of all) console.log(`${b.name}  ${(b.size / 1024).toFixed(1)} KB  ${b.createdAt.toLocaleString('es-ES')}`);
  process.exit(0);
}

if (!fs.existsSync(dbPath)) {
  console.error(`No existe la base de datos: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000;');
try {
  const r = createBackup(db, dir, { keep });
  console.log(`Copia creada y verificada: ${r.file}`);
  console.log(`Contenido: ${JSON.stringify(r.counts)}`);
  if (r.removed.length) console.log(`Copias antiguas eliminadas (se conservan ${keep}): ${r.removed.join(', ')}`);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
