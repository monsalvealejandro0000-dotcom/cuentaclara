/**
 * Copias de seguridad de la base de datos SQLite.
 *
 * - `VACUUM INTO` genera una copia coherente (incluye lo que aún está en el WAL)
 *   sin parar el servidor.
 * - Cada copia se verifica (PRAGMA integrity_check + tablas esperadas) antes de darla por buena.
 * - Se conservan las `keep` más recientes; las antiguas se borran.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const NAME_RE = /^cuentaclara-\d{8}-\d{6}-\d{3}\.db$/;
const REQUIRED_TABLES = ['users', 'settings', 'movements', 'invoices', 'schema_migrations'];
const MAX_INTERVAL_HOURS = 24 * 7;

function stamp(d) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${p(d.getUTCMilliseconds(), 3)}`
  );
}

/** Copias existentes, de la más antigua a la más reciente (el nombre lleva la fecha UTC). */
export function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => NAME_RE.test(f))
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      return { name, file, size: st.size, createdAt: st.mtime };
    });
}

/** Abre la copia en solo lectura y comprueba que está íntegra. Devuelve el nº de filas por tabla. */
export function verifyBackup(file) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const result = db.prepare('PRAGMA integrity_check').get();
    if (result?.integrity_check !== 'ok') throw new Error(`integridad: ${result?.integrity_check}`);
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    for (const t of REQUIRED_TABLES) if (!tables.has(t)) throw new Error(`falta la tabla ${t}`);
    const counts = {};
    for (const t of ['users', 'movements', 'invoices', 'events']) {
      if (tables.has(t)) counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    }
    return counts;
  } catch (err) {
    throw new Error(`Copia no válida (${path.basename(file)}): ${err.message}`);
  } finally {
    db?.close();
  }
}

/** Borra las copias más antiguas y deja solo las `keep` más recientes. */
export function pruneBackups(dir, keep) {
  const all = listBackups(dir);
  const toRemove = all.slice(0, Math.max(0, all.length - Math.max(1, keep)));
  for (const b of toRemove) fs.rmSync(b.file, { force: true });
  return toRemove.map((b) => b.name);
}

export function createBackup(db, dir, { keep = 14, now = new Date() } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `cuentaclara-${stamp(now)}.db`);
  const tmp = `${file}.tmp`;
  fs.rmSync(tmp, { force: true });
  try {
    db.prepare('VACUUM INTO ?').run(tmp);
    const counts = verifyBackup(tmp);
    fs.renameSync(tmp, file);
    const removed = pruneBackups(dir, keep);
    return { file, counts, removed };
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Programa copias periódicas. Si la última copia es más antigua que el intervalo
 * (o no hay ninguna), hace una nada más arrancar.
 */
export function scheduleBackups(db, { dir, intervalHours = 24, keep = 14, logger = console } = {}) {
  const hours = Number(intervalHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    logger.log('[copias] Copias automáticas desactivadas');
    return { stop() {}, runNow() {} };
  }
  const intervalMs = Math.min(hours, MAX_INTERVAL_HOURS) * 3_600_000;

  const runNow = () => {
    try {
      const r = createBackup(db, dir, { keep });
      const c = r.counts;
      logger.log(`[copias] ${path.basename(r.file)} verificada (${c.users} usuarios, ${c.movements} movimientos, ${c.invoices} facturas)`);
      return r;
    } catch (err) {
      logger.error(`[copias] ERROR: no se pudo crear la copia de seguridad: ${err.message}`);
      return null;
    }
  };

  const last = listBackups(dir).at(-1);
  const age = last ? Date.now() - last.createdAt.getTime() : Infinity;
  let timer;
  const tick = () => {
    runNow();
    timer = setTimeout(tick, intervalMs);
    timer.unref?.();
  };
  timer = setTimeout(tick, age >= intervalMs ? 0 : intervalMs - age);
  timer.unref?.();

  return {
    stop: () => clearTimeout(timer),
    runNow,
  };
}
