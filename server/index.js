import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { scheduleBackups } from './backup.js';
import { writeConfigFromEnv } from './config-env.js';
import { backupTokenDigest, MIN_BACKUP_TOKEN_LENGTH } from './routes/backup.js';
import { LOOPBACK_HOSTS, parseAllowedHosts } from './security.js';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Opciones (o variables de entorno):
//   --port=3000 (PORT)  --host=127.0.0.1 (HOST)  --db=ruta/datos.db (DB_PATH)
//   --backup-dir=ruta (BACKUP_DIR, por defecto <carpeta de la BD>/backups)
//   --backup-hours=24 (BACKUP_INTERVAL_HOURS, 0 = desactivar)  --backup-keep=14 (BACKUP_KEEP)
//   ALLOWED_HOSTS=cuentaclara.co,www.cuentaclara.co  dominios aceptados (por defecto, solo localhost si escucha en 127.0.0.1)
//   TRUST_PROXY=1  la app está detrás de un proxy (Nginx, Caddy…) que envía la IP real en X-Forwarded-For
//   APP_URL=https://cuentaclara.co  dirección pública para los enlaces de los correos (o "url_app" en data/correo.json)
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

const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
const allowedHosts = parseAllowedHosts(process.env.ALLOWED_HOSTS) ?? (loopback ? LOOPBACK_HOSTS : null);
if (!allowedHosts) {
  console.warn('[seguridad] Escuchando en una dirección pública sin ALLOWED_HOSTS: define tu dominio (p. ej. ALLOWED_HOSTS=cuentaclara.co).');
}
// En hostings sin acceso al disco: responsable.json, cobro.json, correo.json y avisos.json desde variables de entorno.
const fromEnv = writeConfigFromEnv(path.dirname(dbPath));
if (fromEnv.length) console.log(`Configuración desde variables de entorno: ${fromEnv.join(', ')}`);
// Enlaces de los correos (fase 13): url_app de data/correo.json, APP_URL o, en local, http://localhost:<puerto>.
const appUrl = process.env.APP_URL?.replace(/\/+$/, '') || `http://localhost:${port}`;
const app = createApp({
  dbPath,
  appUrl,
  secureCookies: process.env.COOKIE_SECURE === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
  allowedHosts,
  backupToken: process.env.BACKUP_DOWNLOAD_TOKEN || null,
});
const backups = scheduleBackups(app.db, {
  dir: backupDir,
  intervalHours: args['backup-hours'] || process.env.BACKUP_INTERVAL_HOURS || 24,
  keep: Number(args['backup-keep'] || process.env.BACKUP_KEEP || 14),
});

app.server.listen(port, host, () => {
  console.log(`CuentaClara escuchando en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`Base de datos: ${dbPath}`);
  console.log(`Copias de seguridad: ${backupDir}`);
  const token = process.env.BACKUP_DOWNLOAD_TOKEN;
  if (backupTokenDigest(token)) console.log('Descarga de copias (npm run copia-servidor): activada');
  else if (token) console.warn(`[copias] BACKUP_DOWNLOAD_TOKEN es muy corta (mínimo ${MIN_BACKUP_TOKEN_LENGTH} caracteres): la descarga de copias queda desactivada.`);
  if (app.avisos.activo()) console.log('Avisos de cuentas nuevas y entradas (ntfy): activados');
  if (app.mail.mode() === 'brevo') console.log(`Correo: Brevo. Enlaces con ${app.mail.baseUrl()}`);
  else console.log('Correo: modo local (sin data/correo.json). Los correos NO se envían: su enlace aparece en esta ventana.');
  if (!loopback && app.mail.baseUrl().includes('localhost')) {
    console.warn('[correo] Los enlaces de los correos apuntan a localhost: pon "url_app" en data/correo.json (p. ej. https://cuentaclara.co).');
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    backups.stop();
    await app.close();
    process.exit(0);
  });
}
