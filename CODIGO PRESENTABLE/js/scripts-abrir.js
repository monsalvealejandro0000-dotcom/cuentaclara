// Abre CuentaClara: doble clic en «Abrir CuentaClara.cmd» (Windows) o `npm run abrir`.
//  - Si el servidor ya está en marcha, solo abre el navegador.
//  - Si no, compila la interfaz si falta, arranca el servidor en esta ventana y abre el navegador cuando responde.
// Acepta las mismas opciones que `npm start` (--port, --host, --db…) y --sin-navegador (no abre el navegador).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=');
      return [k, rest.join('=') || true];
    }),
);

const port = Number(args.port || process.env.PORT || 3000);
const host = args.host || process.env.HOST || '127.0.0.1';
const localHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
const hostInUrl = localHost.includes(':') ? `[${localHost}]` : localHost;
const checkUrl = `http://${hostInUrl}:${port}`;
const appUrl = `http://${localHost === '127.0.0.1' ? 'localhost' : hostInUrl}:${port}`;

/** ¿Responde CuentaClara en ese puerto? (y no otro programa) */
async function cuentaClaraResponde() {
  try {
    const res = await fetch(`${checkUrl}/api/meta`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data?.currencies) && Array.isArray(data?.vatRates);
  } catch {
    return false;
  }
}

/** ¿Se puede abrir el puerto? (falso si lo usa otro programa) */
function puertoLibre() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

function abrirNavegador() {
  if (args['sin-navegador']) return console.log(`Abre ${appUrl} en el navegador.`);
  console.log(`Abriendo ${appUrl} en el navegador…`);
  const [cmd, cmdArgs, extra] =
    process.platform === 'win32'
      ? ['cmd.exe', ['/d', '/s', '/c', `"start "" "${appUrl}""`], { windowsVerbatimArguments: true }]
      : process.platform === 'darwin'
        ? ['open', [appUrl], {}]
        : ['xdg-open', [appUrl], {}];
  const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true, ...extra });
  child.on('error', () => console.log(`No se pudo abrir el navegador: abre ${appUrl}`));
  child.unref();
}

if (await cuentaClaraResponde()) {
  console.log(`CuentaClara ya está en marcha en ${appUrl}.`);
  abrirNavegador();
} else if (!(await puertoLibre())) {
  console.error(
    `El puerto ${port} lo está usando otro programa. Ciérralo o abre CuentaClara en otro puerto: npm run abrir -- --port=3001`,
  );
  process.exitCode = 1;
} else {
  if (!fs.existsSync(path.join(APP_DIR, 'dist', 'index.html'))) {
    console.log('Compilando la interfaz (solo hace falta la primera vez)…');
    const build = spawnSync('npm run build', { cwd: APP_DIR, stdio: 'inherit', shell: true });
    if (build.status !== 0) {
      console.error('No se pudo compilar la interfaz. Ejecuta "npm install" en la carpeta del proyecto y vuelve a intentarlo.');
      process.exit(1);
    }
  }
  console.log('Arrancando CuentaClara. Deja esta ventana abierta mientras uses la app: al cerrarla, la app se apaga.\n');
  await import('../server/index.js');
  let listo = false;
  for (let i = 0; i < 60 && !listo; i++) {
    listo = await cuentaClaraResponde();
    if (!listo) await new Promise((r) => setTimeout(r, 500));
  }
  if (listo) abrirNavegador();
  else console.error(`El servidor no responde todavía. Prueba a abrir ${appUrl} dentro de un momento.`);
}
