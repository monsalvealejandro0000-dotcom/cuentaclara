/**
 * Avisos de CuentaClara en este computador: cuentas nuevas y entradas a la app (docs/15-avisos.md).
 *
 *   npm run avisos                 → muestra en Windows los avisos nuevos (la tarea programada lo hace cada 15 minutos)
 *   npm run avisos -- --probar     → envía un aviso de prueba al celular y muestra uno aquí
 *
 * Lee el tema de ntfy de data/avisos.json (el mismo que usa el servidor) y pide a ntfy los avisos desde el último
 * que mostró (ntfy los guarda 12 horas). El servidor solo manda el número de la cuenta: el nombre y el correo los
 * saca de la copia más reciente de data/copias-servidor y, si la cuenta es nueva y aún no está, baja una copia nueva.
 * Cada aviso queda anotado en data/avisos-registro.txt.
 *
 * Opciones: --datos=carpeta (por defecto data), --sin-descarga (no bajar copias).
 * Con AVISOS_SIN_VENTANA=1 escribe los avisos en la consola en lugar de mostrarlos en Windows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readAvisosConfig } from '../server/avisos.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COPY_RE = /^cuentaclara-\d{8}-\d{6}-\d{3}\.db$/;
const MAX_SEPARADOS = 4;

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=');
      return [k, rest.join('=') || true];
    }),
);

const dataDir = path.resolve(ROOT, typeof args.datos === 'string' ? args.datos : 'data');
const stateFile = path.join(dataDir, 'avisos-estado.json');
const log = (line) => fs.appendFileSync(path.join(dataDir, 'avisos-registro.txt'), `${new Date().toISOString()} ${line}\n`);
const hora = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

// Notificación de Windows con PowerShell (sin instalar nada). El texto va en una variable de entorno, no en el comando.
const TOAST_PS = `
$ErrorActionPreference = 'Stop'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($env:CUENTACLARA_AVISO)
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($toast)
`;

function mostrar(titulo, lineas, click) {
  if (process.platform !== 'win32' || process.env.AVISOS_SIN_VENTANA === '1') {
    console.log(`[aviso] ${titulo} | ${lineas.join(' | ')}`);
    return;
  }
  const launch = typeof click === 'string' && /^https:\/\/[^\s"]+$/.test(click) ? ` activationType="protocol" launch="${esc(click)}"` : '';
  const xml =
    `<toast${launch}><visual><binding template="ToastGeneric"><text>${esc(titulo)}</text>` +
    lineas.slice(0, 2).map((l) => `<text>${esc(l)}</text>`).join('') +
    '</binding></visual></toast>';
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(TOAST_PS, 'utf16le').toString('base64')],
    { env: { ...process.env, CUENTACLARA_AVISO: xml }, windowsHide: true, encoding: 'utf8', timeout: 30_000 },
  );
  if (r.status !== 0) throw new Error(`Windows no mostró el aviso (${String(r.stderr || r.error?.message || '').trim().split(/\r?\n/)[0]})`);
}

function readConfig() {
  const cfg = readAvisosConfig(path.join(dataDir, 'avisos.json'), { error: (m) => console.error(m) });
  if (!cfg.ntfy) throw new Error(`no hay un tema de ntfy en ${path.join(dataDir, 'avisos.json')} (docs/15-avisos.md)`);
  return cfg.ntfy;
}

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
};
const saveState = (since) => fs.writeFileSync(stateFile, `${JSON.stringify({ since })}\n`);

/** Nombre y correo de las cuentas, desde la copia del servidor más reciente. id → { name, email }. */
function personas(ids) {
  const dir = path.join(dataDir, 'copias-servidor');
  const newest = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => COPY_RE.test(f)).sort().at(-1) : null;
  const out = new Map();
  if (!newest || !ids.length) return out;
  const db = new DatabaseSync(path.join(dir, newest), { readOnly: true });
  try {
    const q = db.prepare('SELECT name, email FROM users WHERE id = ?');
    for (const id of ids) {
      const row = q.get(id);
      if (row) out.set(id, { name: row.name, email: row.email });
    }
  } finally {
    db.close();
  }
  return out;
}

const cuentaDe = (m) => Number((m.tags ?? []).map((t) => /^cuenta-(\d+)$/.exec(t)?.[1]).find(Boolean)) || null;

async function probar(ntfy) {
  const res = await fetch(`${ntfy.server}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: ntfy.topic, title: 'Prueba de CuentaClara', message: 'Si ves esto en el celular, los avisos funcionan.', tags: ['white_check_mark'] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ntfy respondió ${res.status}`);
  const sent = await res.json().catch(() => ({}));
  // Para que la próxima revisión no la vuelva a mostrar.
  if (sent.id) saveState(sent.id);
  mostrar('Prueba de CuentaClara', ['Si ves esto, los avisos de este computador funcionan.', 'Al celular también se envió una.']);
  log('PRUEBA enviada al celular y mostrada aquí');
  console.log('Aviso de prueba enviado al celular y mostrado en este computador.');
}

async function revisar(ntfy) {
  const since = readState().since || '12h';
  const res = await fetch(`${ntfy.server}/${ntfy.topic}/json?poll=1&since=${encodeURIComponent(since)}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ntfy respondió ${res.status}`);
  const msgs = (await res.text())
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .filter((m) => m.event === 'message')
    .sort((a, b) => a.time - b.time);
  if (!msgs.length) return console.log('No hay avisos nuevos.');

  const ids = [...new Set(msgs.map(cuentaDe).filter(Boolean))];
  let gente = personas(ids);
  if (ids.some((id) => !gente.has(id)) && !args['sin-descarga']) {
    // Cuenta nueva que aún no está en las copias: se baja una copia recién hecha.
    spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'descargar-copia.js')], { cwd: ROOT, windowsHide: true, timeout: 180_000 });
    gente = personas(ids);
  }

  const items = msgs.map((m) => {
    const id = cuentaDe(m);
    const p = id ? gente.get(id) : null;
    const quien = p ? `${p.name} (${p.email})` : id ? `Cuenta #${id}` : '';
    return { m, quien, cuando: hora.format(new Date(m.time * 1000)) };
  });
  for (const { m, quien } of items) log(`${m.title}: ${m.message}${quien ? ` | ${quien}` : ''}`);
  saveState(msgs.at(-1).id);

  if (items.length <= MAX_SEPARADOS) {
    for (const { m, quien, cuando } of items) mostrar(m.title, [quien || m.message, `${quien ? `${m.message} ` : ''}${cuando}`], m.click);
  } else {
    const nuevas = items.filter(({ m }) => m.tags?.includes('tada')).length;
    mostrar(`${items.length} avisos de CuentaClara`, [
      `${nuevas} ${nuevas === 1 ? 'cuenta nueva' : 'cuentas nuevas'} y ${items.length - nuevas} ${items.length - nuevas === 1 ? 'entrada' : 'entradas'}`,
      'El detalle está en data/avisos-registro.txt',
    ], items.at(-1).m.click);
  }
  console.log(`${items.length} ${items.length === 1 ? 'aviso nuevo' : 'avisos nuevos'}.`);
}

try {
  fs.mkdirSync(dataDir, { recursive: true });
  const ntfy = readConfig();
  if (args.probar) await probar(ntfy);
  else await revisar(ntfy);
} catch (err) {
  try {
    log(`ERROR ${err.message}`);
  } catch {
    /* sin carpeta de datos */
  }
  console.error(`No se pudieron revisar los avisos: ${err.message}`);
  process.exitCode = 1;
}
