// Copias de seguridad: creación, verificación, rotación, programación y restauración completa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { startServer, registerUser, client, movement, invoice } from './helpers.js';
import { createBackup, listBackups, verifyBackup, scheduleBackups } from '../server/backup.js';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const silent = { log() {}, error() {} };
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-test-backup-'));
const runScript = (script, args) =>
  spawnSync(process.execPath, [path.join(APP_DIR, 'scripts', script), ...args], { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('la copia es coherente con el servidor en marcha (incluye datos aún en el WAL)', async () => {
  const srv = await startServer();
  const dir = path.join(srv.tmpDir, 'copias');
  try {
    const { c } = await registerUser(srv.baseUrl);
    await c.post('/api/movements', movement({ concept: 'Dato a proteger' }));
    await c.post('/api/invoices', invoice());
    const r = createBackup(srv.app.db, dir);
    assert.deepEqual(r.counts, { users: 1, movements: 2, invoices: 1, events: 0 });
    const copy = new DatabaseSync(r.file, { readOnly: true });
    const concepts = copy.prepare('SELECT concept FROM movements ORDER BY id').all().map((x) => x.concept);
    copy.close();
    assert.ok(concepts.includes('Dato a proteger'));
    assert.equal(fs.existsSync(`${r.file}.tmp`), false, 'no deja ficheros temporales');
  } finally {
    await srv.destroy();
  }
});

test('una copia dañada o incompleta se rechaza', () => {
  const dir = tmpDir();
  try {
    const garbage = path.join(dir, 'basura.db');
    fs.writeFileSync(garbage, 'esto no es una base de datos');
    assert.throws(() => verifyBackup(garbage), /Copia no válida/);
    const empty = path.join(dir, 'vacia.db');
    new DatabaseSync(empty).close();
    assert.throws(() => verifyBackup(empty), /falta la tabla users/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rotación: se conservan solo las copias más recientes', async () => {
  const srv = await startServer();
  const dir = path.join(srv.tmpDir, 'copias');
  try {
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(path.basename(createBackup(srv.app.db, dir, { keep: 3, now: new Date(Date.UTC(2026, 10, 1 + i, 3)) }).file));
    }
    assert.deepEqual(listBackups(dir).map((b) => b.name), created.slice(2));
  } finally {
    await srv.destroy();
  }
});

test('programación: copia al arrancar si no hay ninguna reciente; no repite si ya la hay; 0 desactiva', async () => {
  const srv = await startServer();
  const dir = path.join(srv.tmpDir, 'copias');
  try {
    const off = scheduleBackups(srv.app.db, { dir, intervalHours: 0, logger: silent });
    await sleep(200);
    off.stop();
    assert.equal(listBackups(dir).length, 0, 'desactivadas');

    const first = scheduleBackups(srv.app.db, { dir, intervalHours: 24, logger: silent });
    for (let i = 0; i < 40 && listBackups(dir).length === 0; i++) await sleep(50);
    first.stop();
    assert.equal(listBackups(dir).length, 1, 'copia inicial');

    const second = scheduleBackups(srv.app.db, { dir, intervalHours: 24, logger: silent });
    await sleep(300);
    second.stop();
    assert.equal(listBackups(dir).length, 1, 'no duplica si la última es reciente');
  } finally {
    await srv.destroy();
  }
});

test('restauración completa con los comandos npm run backup / restore', async () => {
  const srv = await startServer();
  const backupDir = path.join(srv.tmpDir, 'copias');
  const { c, creds } = await registerUser(srv.baseUrl);
  const important = (await c.post('/api/movements', movement({ concept: 'Factura importante' }))).data.movement;

  // 1. Copia manual con el servidor en marcha
  const backup = runScript('backup.js', [`--db=${srv.dbPath}`, `--dir=${backupDir}`]);
  assert.equal(backup.status, 0, backup.stderr);
  assert.match(backup.stdout, /Copia creada y verificada/);
  const list = runScript('backup.js', [`--db=${srv.dbPath}`, `--dir=${backupDir}`, '--list']);
  assert.match(list.stdout, /cuentaclara-\d{8}-\d{6}-\d{3}\.db/);
  const file = listBackups(backupDir)[0].file;

  // 2. Borrado accidental
  assert.equal((await c.del(`/api/movements/${important.id}`)).status, 204);
  await srv.stop();

  // 3. Sin --confirmar no toca nada
  const dry = runScript('restore.js', [file, `--db=${srv.dbPath}`]);
  assert.equal(dry.status, 1);
  assert.match(dry.stdout, /--confirmar/);

  // 4. Una copia no válida se rechaza sin tocar la BD
  const garbage = path.join(srv.tmpDir, 'basura.db');
  fs.writeFileSync(garbage, 'no es sqlite');
  const bad = runScript('restore.js', [garbage, `--db=${srv.dbPath}`, '--confirmar']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Copia no válida/);

  // 5. Restaurar de verdad
  const restore = runScript('restore.js', [file, `--db=${srv.dbPath}`, '--confirmar']);
  assert.equal(restore.status, 0, restore.stderr);
  const saved = fs.readdirSync(srv.tmpDir).filter((f) => /^test\.db\.antes-de-restaurar-[^-]/.test(f) && !/-(wal|shm)$/.test(f));
  assert.equal(saved.length, 1, 'la BD anterior se conserva aparte');

  // 6. Arrancar de nuevo: el movimiento borrado ha vuelto y se puede iniciar sesión
  const again = await startServer({ dir: srv.tmpDir });
  try {
    const u = client(again.baseUrl);
    assert.equal((await u.post('/api/auth/login', { email: creds.email, password: creds.password })).status, 200);
    const concepts = (await u.get('/api/movements')).data.movements.map((m) => m.concept);
    assert.ok(concepts.includes('Factura importante'));
  } finally {
    await again.destroy();
  }
});
