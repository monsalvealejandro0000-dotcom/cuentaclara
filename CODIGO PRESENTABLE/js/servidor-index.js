import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { scheduleBackups } from './backup.js';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Opciones (o variables de entorno):
//   --port=3000 (PORT)  --host=127.0.0.1 (HOST)  --db=ruta/datos.db (DB_PATH)
//   --backup-dir=ruta (BACKUP_DIR, por defecto <carpeta de la BD>/backups)
//   --backup-hours=24 (BACKUP_INTERVAL_HOURS, 0 = desactivar)  --backup-keep=14 (BACKUP_KEEP)
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=');
      return [k, rest.join('=')];
    }),
);

const port = Number(args.port || process.env.PORT || 3000);
const host = args.host || process.env.HOST || '127.0.0.1';
const dbPath = path.resolve(args.db || process.env.DB_PATH || path.join(APP_DIR, 'data', 'app.db'));
const backupDir = path.resolve(args['backup-dir'] || process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups'));

const app = createApp({ dbPath, secureCookies: process.env.COOKIE_SECURE === '1' });
const backups = scheduleBackups(app.db, {
  dir: backupDir,
  intervalHours: args['backup-hours'] || process.env.BACKUP_INTERVAL_HOURS || 24,
  keep: Number(args['backup-keep'] || process.env.BACKUP_KEEP || 14),
});

app.server.listen(port, host, () => {
  console.log(`CuentaClara escuchando en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`Base de datos: ${dbPath}`);
  console.log(`Copias de seguridad: ${backupDir}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    backups.stop();
    await app.close();
    process.exit(0);
  });
}
