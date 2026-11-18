// Restaurar una copia de seguridad. DETÉN EL SERVIDOR ANTES.
//   npm run restore -- data/backups/cuentaclara-AAAAMMDD-HHMMSS-mmm.db --confirmar
//   Opción: --db=ruta/app.db (por defecto data/app.db)
// La base de datos actual no se borra: se renombra a "<app.db>.antes-de-restaurar-<fecha>".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { verifyBackup } from '../server/backup.js';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const args = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...rest] = a.slice(2).split('=');
    return [k, rest.join('=') || true];
  }),
);
const source = argv.find((a) => !a.startsWith('--'));
const dbPath = path.resolve(args.db || process.env.DB_PATH || path.join(APP_DIR, 'data', 'app.db'));

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!source) fail('indica la copia a restaurar: npm run restore -- <fichero.db> --confirmar');
const backupFile = path.resolve(source);
if (!fs.existsSync(backupFile)) fail(`no existe ${backupFile}`);
if (backupFile === dbPath) fail('la copia y la base de datos de destino son el mismo fichero');

let counts;
try {
  counts = verifyBackup(backupFile);
} catch (err) {
  fail(err.message);
}
console.log(`Copia verificada: ${path.basename(backupFile)} → ${JSON.stringify(counts)}`);

if (!args.confirmar) {
  console.log(`\nSe sustituirá ${dbPath} por esta copia.`);
  console.log('Detén el servidor y repite el comando añadiendo --confirmar.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (fs.existsSync(dbPath)) {
  // Integra el WAL en el fichero principal para que la copia de seguridad previa quede completa.
  try {
    const current = new DatabaseSync(dbPath);
    current.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    current.close();
  } catch {
    /* si no se puede abrir, se conserva tal cual junto con su WAL */
  }
  const saved = `${dbPath}.antes-de-restaurar-${stamp}`;
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.renameSync(dbPath + suffix, saved + suffix);
    }
  } catch (err) {
    fail(`no se pudo apartar la base de datos actual (${err.code}). ¿Está el servidor en marcha? Detenlo y vuelve a intentarlo.`);
  }
  console.log(`Base de datos anterior guardada como: ${saved}`);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.copyFileSync(backupFile, dbPath);
const restored = verifyBackup(dbPath);
console.log(`Restaurada en ${dbPath} → ${JSON.stringify(restored)}`);
console.log('Ya puedes arrancar el servidor (npm start).');
