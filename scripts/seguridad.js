// Seguridad de las cuentas, para el administrador (docs/13-correo-y-segundo-factor.md).
//   npm run seguridad -- --email=ana@correo.com                    → estado: correo, verificación en dos pasos, sesiones y actividad
//   npm run seguridad -- --email=ana@correo.com --quitar-2fa       → quita la verificación en dos pasos y cierra sus sesiones
//   npm run seguridad -- --email=ana@correo.com --cerrar-sesiones  → cierra todas sus sesiones abiertas
//   npm run seguridad -- --email=ana@correo.com --confirmar-correo → da su correo por confirmado (sin enlace)
//   npm run seguridad -- --probar-correo=tu@correo.com             → envía un correo de prueba (comprueba data/correo.json)
//   Opciones: --db=ruta/app.db (o la variable DB_PATH). Se puede usar con el servidor en marcha.
//
// ANTES de quitar la verificación en dos pasos, comprueba que quien lo pide es la persona: por ejemplo, que te
// escribió desde el correo de la cuenta y sabe datos que solo ella conoce (sus últimos movimientos, su NIT…).
// Lo mismo antes de confirmar un correo a mano: úsalo solo con cuentas que sabes que son de quien dice (p. ej. la tuya).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, transaction } from '../server/db.js';
import { APP_TIMEZONE } from '../server/calc.js';
import { createMailer, browserName, whenText } from '../server/mail.js';
import { readResponsable } from '../server/legal.js';
import { backupCodesLeft, disableTwoFactor, logSecurityEvent, securityEvents } from '../server/account.js';

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
const dataDir = path.dirname(dbPath);
const responsable = readResponsable(path.join(dataDir, 'responsable.json'), { error() {} });
const mail = createMailer({
  configPath: path.join(dataDir, 'correo.json'),
  appUrl: process.env.APP_URL?.replace(/\/+$/, '') || 'http://localhost:3000',
  logger: console,
  contact: responsable.complete ? responsable.values.correo : null,
});
const when = new Intl.DateTimeFormat('es-CO', { timeZone: APP_TIMEZONE, dateStyle: 'short', timeStyle: 'short' });
const fmt = (iso) => when.format(new Date(iso));

if (args['probar-correo'] !== undefined) {
  const to = String(args['probar-correo']).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) fail('Indica un correo: --probar-correo=tu@correo.com');
  if (mail.mode() === 'local') {
    fail(
      `No hay un ${path.join(dataDir, 'correo.json')} válido: la app está en modo local y no envía correos.
` +
        'Copia docs/correo.ejemplo.json a data/correo.json y pon tus datos de Brevo (docs/13-correo-y-segundo-factor.md).',
    );
  }
  try {
    await mail.sendNow(to, 'prueba');
    console.log(`Correo de prueba enviado a ${to}. Si no llega en unos minutos, mira en spam y en Brevo → Transaccional → Registros.`);
  } catch (err) {
    fail(`Brevo no aceptó el correo: ${err.message}`);
  }
  process.exit(0);
}

const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
if (!email) fail('Indica la cuenta: --email=ana@correo.com (o --probar-correo=tu@correo.com)');
if (!fs.existsSync(dbPath)) fail(`No existe la base de datos: ${dbPath}`);

const db = openDb(dbPath);
try {
  const user = db.prepare('SELECT id, email, name, email_verified_at, totp_enabled_at FROM users WHERE email = ?').get(email);
  if (!user) fail(`No existe una cuenta con el correo ${email}`);
  const now = new Date();
  const notify = async (kind) => {
    if (!user.email_verified_at) return console.log('No se envió aviso por correo: su correo no está confirmado.');
    try {
      await mail.sendNow(user.email, kind, { name: user.name, when: whenText(now), browser: browserName('') });
      if (mail.mode() === 'brevo') console.log(`Le enviamos un aviso a ${user.email}.`);
    } catch (err) {
      console.error(`AVISO: no se pudo enviar el correo de aviso (${err.message}). Avísale tú.`);
    }
  };

  if (args['quitar-2fa']) {
    if (!user.totp_enabled_at) fail(`${user.email} no tiene activada la verificación en dos pasos.`);
    transaction(db, () => {
      disableTwoFactor(db, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      logSecurityEvent(db, user.id, '2fa_quitado_admin', { ip: 'administrador', userAgent: 'npm run seguridad', now });
    });
    console.log(`Verificación en dos pasos quitada a ${user.email} y sesiones cerradas. Ya puede entrar solo con su contraseña y volver a activarla.`);
    await notify('2fa_quitado_admin');
  } else if (args['confirmar-correo']) {
    if (user.email_verified_at) {
      console.log(`El correo de ${user.email} ya estaba confirmado (${fmt(user.email_verified_at)}).`);
    } else {
      transaction(db, () => {
        db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(now.toISOString(), user.id);
        logSecurityEvent(db, user.id, 'correo_confirmado', { ip: 'administrador', userAgent: 'npm run seguridad', detail: `${user.email} (por el administrador)`, now });
      });
      console.log(`Correo de ${user.email} confirmado por el administrador: ya no tiene que confirmarlo.`);
    }
  } else if (args['cerrar-sesiones']) {
    const n = transaction(db, () => {
      const r = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      logSecurityEvent(db, user.id, 'sesiones_cerradas_admin', { ip: 'administrador', userAgent: 'npm run seguridad', detail: `${r.changes} sesiones`, now });
      return r.changes;
    });
    console.log(`${n} ${n === 1 ? 'sesión cerrada' : 'sesiones cerradas'} de ${user.email}.`);
  } else {
    const sessions = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?').get(user.id, Date.now()).n;
    console.log(`${user.name} <${user.email}>`);
    console.log(`  Correo: ${user.email_verified_at ? `confirmado (${fmt(user.email_verified_at)})` : 'SIN confirmar'}`);
    console.log(
      `  Verificación en dos pasos: ${user.totp_enabled_at ? `activada desde ${fmt(user.totp_enabled_at)}, ${backupCodesLeft(db, user.id)} códigos de respaldo sin usar` : 'desactivada'}`,
    );
    console.log(`  Sesiones abiertas: ${sessions}`);
    const events = securityEvents(db, user.id, 15);
    console.log(events.length ? '  Actividad de seguridad (más reciente primero):' : '  Sin actividad de seguridad registrada.');
    for (const e of events) console.log(`    ${fmt(e.at)}  ${e.label}${e.detail ? ` (${e.detail})` : ''}  · IP ${e.ip || '—'}`);
  }
} finally {
  db.close();
}
