// Descarga de copias de seguridad con la clave del administrador (GET /api/admin/copia)
// y el script que las baja al computador (scripts/descargar-copia.js). docs/14-publicar-en-railway.md.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, registerUser } from './helpers.js';
import { verifyBackup } from '../server/backup.js';

const TOKEN = 'k'.repeat(20) + '-clave-de-prueba-larga-0123456789';
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'descargar-copia.js');
let srv;
before(async () => {
  srv = await startServer({ backupToken: TOKEN });
  await registerUser(srv.baseUrl);
  await registerUser(srv.baseUrl);
});
after(() => srv.destroy());

const download = (baseUrl, headers = {}) => fetch(`${baseUrl}/api/admin/copia`, { headers });

/** Ejecuta el script con su propio entorno y devuelve el código de salida y lo que escribió. */
function runScript(env, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (status) => resolve({ status, out }));
  });
}

test('sin clave configurada (o demasiado corta) la descarga no existe', async () => {
  for (const backupToken of [null, 'corta-de-31-caracteres-xxxxxxxx']) {
    const s = await startServer({ backupToken });
    try {
      assert.equal((await download(s.baseUrl, { Authorization: `Bearer ${backupToken}` })).status, 404);
    } finally {
      await s.destroy();
    }
  }
});

test('sin la clave o con una incorrecta responde 401 y no entrega datos', async () => {
  for (const headers of [{}, { Authorization: 'Bearer otra-clave-cualquiera-de-mas-de-32-caracteres' }, { Authorization: TOKEN }]) {
    const res = await download(srv.baseUrl, headers);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    assert.match(res.headers.get('content-type'), /application\/json/);
  }
});

test('con la clave entrega una copia completa y válida, sin guardarla en caché', async () => {
  const res = await download(srv.baseUrl, { Authorization: `Bearer ${TOKEN}` });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/vnd.sqlite3');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="cuentaclara-\d{8}-\d{6}-\d{3}\.db"$/);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-copia-')), 'copia.db');
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  assert.equal(verifyBackup(file).users, 2);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  // El servidor borra su temporal justo después de enviar el último byte: se le da un momento.
  const leftovers = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('cuentaclara-descarga-'));
  for (let i = 0; i < 50 && leftovers().length; i++) await new Promise((ok) => setTimeout(ok, 20));
  assert.deepEqual(leftovers(), [], 'no deja temporales');
});

test('10 intentos por hora y por IP, acierten o no', async () => {
  const s = await startServer({ backupToken: TOKEN });
  try {
    for (let i = 0; i < 10; i++) assert.equal((await download(s.baseUrl)).status, 401);
    const res = await download(s.baseUrl, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
  } finally {
    await s.destroy();
  }
});

test('el script baja la copia, la verifica, la anota y conserva solo las más recientes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-copias-pc-'));
  try {
    const env = { COPIA_URL: `${srv.baseUrl}/`, COPIA_CLAVE: TOKEN };
    for (let i = 0; i < 3; i++) {
      const r = await runScript(env, [`--dir=${dir}`, '--keep=2']);
      assert.equal(r.status, 0, r.out);
      assert.match(r.out, /2 usuarios/);
      await new Promise((ok) => setTimeout(ok, 5)); // nombres distintos (llevan milisegundos)
    }
    const copias = fs.readdirSync(dir).filter((f) => f.endsWith('.db'));
    assert.equal(copias.length, 2, 'borra las antiguas');
    assert.equal(verifyBackup(path.join(dir, copias[0])).users, 2);
    const registro = fs.readFileSync(path.join(dir, 'registro.txt'), 'utf8').trim().split('\n');
    assert.equal(registro.length, 3);
    assert.ok(registro.every((l) => / OK cuentaclara-/.test(l)));

    const mal = await runScript({ COPIA_URL: srv.baseUrl, COPIA_CLAVE: 'clave-equivocada' }, [`--dir=${dir}`]);
    assert.equal(mal.status, 1);
    assert.match(mal.out, /401 \(la clave no coincide/);
    assert.match(fs.readFileSync(path.join(dir, 'registro.txt'), 'utf8'), /ERROR el servidor respondió 401/);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'registro.txt'), 'utf8'), /clave-equivocada/, 'no anota la clave');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
