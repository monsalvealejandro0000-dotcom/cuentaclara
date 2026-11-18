/**
 * Baja a este computador una copia de seguridad recién hecha de la app publicada (docs/14-publicar-en-railway.md).
 * Así hay copias fuera del servidor: si se pierde el disco de Railway, los datos siguen aquí.
 *
 *   npm run copia-servidor
 *
 * Lee la dirección y la clave de data/copia-remota.json ({ "url": "https://…", "clave": "…" })
 * o de las variables COPIA_URL y COPIA_CLAVE. La clave es la misma BACKUP_DOWNLOAD_TOKEN del servidor.
 *
 * Opciones: --dir=carpeta (por defecto data/copias-servidor), --keep=30 (copias que se conservan).
 * Cada intento queda anotado en <carpeta>/registro.txt (la tarea programada de Windows no tiene ventana).
 * Para restaurar una: npm run restore -- data/copias-servidor/<archivo>.db --confirmar
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneBackups, verifyBackup, backupFileName } from '../server/backup.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME_RE = /^cuentaclara-\d{8}-\d{6}-\d{3}\.db$/;

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=');
      return [k, rest.join('=')];
    }),
);

function readConfig() {
  let file = {};
  const configPath = path.join(ROOT, 'data', 'copia-remota.json');
  if (fs.existsSync(configPath)) file = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^﻿/, ''));
  const url = String(process.env.COPIA_URL || file.url || '').trim().replace(/\/+$/, '');
  const clave = String(process.env.COPIA_CLAVE || file.clave || '').trim();
  if (!url || !clave) throw new Error(`faltan la dirección y la clave: ponlas en ${configPath} ({ "url": "https://…", "clave": "…" })`);
  return { url, clave };
}

async function main() {
  const dir = path.resolve(ROOT, args.dir || path.join('data', 'copias-servidor'));
  const keep = Math.max(1, Number(args.keep) || 30);
  fs.mkdirSync(dir, { recursive: true });
  const log = (line) => fs.appendFileSync(path.join(dir, 'registro.txt'), `${new Date().toISOString()} ${line}\n`);

  try {
    const { url, clave } = readConfig();
    const res = await fetch(`${url}/api/admin/copia`, {
      headers: { Authorization: `Bearer ${clave}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const motivo = { 401: 'la clave no coincide con BACKUP_DOWNLOAD_TOKEN', 404: 'el servidor no tiene BACKUP_DOWNLOAD_TOKEN', 429: 'demasiados intentos; espera una hora' }[res.status];
      throw new Error(`el servidor respondió ${res.status}${motivo ? ` (${motivo})` : ''}`);
    }
    const suggested = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1];
    const name = suggested && NAME_RE.test(suggested) ? suggested : backupFileName();
    const file = path.join(dir, name);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    let counts;
    try {
      counts = verifyBackup(tmp);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
    fs.renameSync(tmp, file);
    const removed = pruneBackups(dir, keep);
    const msg = `OK ${name} (${counts.users} usuarios, ${counts.movements} movimientos, ${counts.invoices} facturas)` + (removed.length ? `; borradas ${removed.length} antiguas` : '');
    log(msg);
    console.log(`Copia guardada en ${file}`);
    console.log(msg);
  } catch (err) {
    log(`ERROR ${err.message}`);
    console.error(`No se pudo bajar la copia: ${err.message}`);
    process.exitCode = 1;
  }
}

await main();
