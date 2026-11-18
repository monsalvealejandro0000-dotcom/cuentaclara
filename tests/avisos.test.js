// Avisos al administrador por ntfy cuando alguien crea una cuenta o entra (server/avisos.js, scripts/avisos.js).
// docs/15-avisos.md. Un servidor ntfy de mentira en este computador: nada sale a internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { startServer, registerUser, client } from './helpers.js';
import { readAvisosConfig, ENTRADA_CADA_MS } from '../server/avisos.js';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'avisos.js');
const TOPIC = 'cc-prueba-Tema_123';
const JEFE = 'jefe@cuentaclara.test';

/** ntfy de mentira: guarda lo publicado y lo devuelve como ntfy (una línea JSON por mensaje). */
function fakeNtfy() {
  const messages = [];
  const polls = [];
  let fail = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/') {
      let raw = '';
      req.on('data', (d) => (raw += d));
      req.on('end', () => {
        if (fail) {
          res.writeHead(500).end();
          return;
        }
        const body = JSON.parse(raw);
        const m = { id: `m${messages.length + 1}`, time: Math.floor(Date.now() / 1000) + messages.length, event: 'message', ...body };
        messages.push(m);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(m));
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === `/${TOPIC}/json`) {
      const since = url.searchParams.get('since');
      polls.push(since);
      const at = messages.findIndex((m) => m.id === since);
      const out = (at >= 0 ? messages.slice(at + 1) : messages).map((m) => JSON.stringify(m)).join('\n');
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' }).end(out ? `${out}\n` : '');
      return;
    }
    res.writeHead(404).end();
  });
  return {
    messages,
    polls,
    setFail: (v) => (fail = v),
    start: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    stop: () => new Promise((r) => server.close(r)),
  };
}

let ntfy;
let ntfyUrl;
let clock;
let srv;
let errors;
before(async () => {
  ntfy = fakeNtfy();
  ntfyUrl = await ntfy.start();
  clock = Date.parse('2026-11-18T15:00:00Z');
  errors = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-avisos-'));
  fs.writeFileSync(path.join(dir, 'avisos.json'), JSON.stringify({ ntfy: `${ntfyUrl}/${TOPIC}`, ignorar: [JEFE.toUpperCase()] }));
  srv = await startServer({ dir, now: () => new Date(clock), appUrl: 'https://app.test', logger: { error: (m) => errors.push(m), warn() {}, log() {} } });
});
after(async () => {
  await srv.destroy();
  await ntfy.stop();
});

const settle = () => srv.app.avisos.flush();

test('una cuenta nueva avisa con su número y el total, sin nombre ni correo', async () => {
  const before = ntfy.messages.length;
  const { c, user, creds } = await registerUser(srv.baseUrl);
  await settle();
  const nuevos = ntfy.messages.slice(before);
  assert.equal(nuevos.length, 1);
  const [m] = nuevos;
  assert.equal(m.topic, TOPIC);
  assert.equal(m.title, 'Cuenta nueva en CuentaClara');
  assert.match(m.message, new RegExp(`cuenta #${user.id}\\. Ya van \\d+ cuentas?\\.`));
  assert.deepEqual(m.tags, ['tada', `cuenta-${user.id}`]);
  assert.equal(m.click, 'https://app.test');
  const raw = JSON.stringify(m);
  assert.ok(!raw.includes(creds.email) && !raw.includes(creds.name), 'el aviso no lleva datos personales');

  // Abrir la app y volver a entrar enseguida no repite el aviso.
  assert.equal((await c.get('/api/auth/me')).status, 200);
  const again = client(srv.baseUrl);
  assert.equal((await again.post('/api/auth/login', { email: creds.email, password: creds.password })).status, 200);
  await settle();
  assert.equal(ntfy.messages.length, before + 1);
});

test('una entrada avisa como mucho una vez cada 3 horas por cuenta (iniciar sesión o abrir la app)', async () => {
  const { c, user, creds } = await registerUser(srv.baseUrl);
  await settle();
  const before = ntfy.messages.length;

  clock += ENTRADA_CADA_MS;
  assert.equal((await c.get('/api/auth/me')).status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 200);
  await settle();
  assert.equal(ntfy.messages.length, before + 1);
  const m = ntfy.messages.at(-1);
  assert.equal(m.title, 'Alguien entró a CuentaClara');
  assert.equal(m.message, `La cuenta #${user.id} entró a la app.`);
  assert.deepEqual(m.tags, ['wave', `cuenta-${user.id}`]);

  clock += ENTRADA_CADA_MS - 1;
  const other = client(srv.baseUrl);
  assert.equal((await other.post('/api/auth/login', { email: creds.email, password: creds.password })).status, 200);
  await settle();
  assert.equal(ntfy.messages.length, before + 1, 'todavía no han pasado 3 horas');

  clock += 1;
  assert.equal((await other.post('/api/auth/login', { email: creds.email, password: creds.password })).status, 200);
  await settle();
  assert.equal(ntfy.messages.length, before + 2);
  assert.equal(ntfy.messages.at(-1).message, `La cuenta #${user.id} entró a la app.`);
});

test('las cuentas de «ignorar» (las del dueño) nunca avisan', async () => {
  const before = ntfy.messages.length;
  const { c } = await registerUser(srv.baseUrl, { email: JEFE });
  clock += 2 * ENTRADA_CADA_MS;
  assert.equal((await c.get('/api/auth/me')).status, 200);
  await settle();
  assert.equal(ntfy.messages.length, before);
});

test('si ntfy falla, el registro funciona igual y el error no muestra el tema secreto', async () => {
  ntfy.setFail(true);
  try {
    errors.length = 0;
    await registerUser(srv.baseUrl);
    await settle();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /ntfy respondió 500/);
    assert.ok(!errors[0].includes(TOPIC));
  } finally {
    ntfy.setFail(false);
  }
});

test('sin avisos.json no se envía nada', async () => {
  const s = await startServer();
  try {
    assert.equal(s.app.avisos.activo(), false);
    const before = ntfy.messages.length;
    await registerUser(s.baseUrl);
    await s.app.avisos.flush();
    assert.equal(ntfy.messages.length, before);
  } finally {
    await s.destroy();
  }
});

test('avisos.json: solo https (o http a este computador) y un tema válido', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-avisos-cfg-'));
  const file = path.join(dir, 'avisos.json');
  const quiet = { error() {} };
  const read = (cfg) => {
    fs.writeFileSync(file, typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
    return readAvisosConfig(file, quiet);
  };
  try {
    assert.deepEqual(read({ ntfy: 'https://ntfy.sh/mi-tema_1' }).ntfy, { server: 'https://ntfy.sh', topic: 'mi-tema_1' });
    assert.deepEqual(read({ ntfy: 'http://127.0.0.1:8080/t' }).ntfy, { server: 'http://127.0.0.1:8080', topic: 't' });
    for (const ntfy of ['http://ntfy.sh/tema', 'https://ntfy.sh/', 'https://ntfy.sh/a/b', 'https://ntfy.sh/tema?x=1', 'https://u:p@ntfy.sh/tema', 'ntfy.sh/tema', 42]) {
      assert.equal(read({ ntfy }).ntfy, null, String(ntfy));
    }
    assert.equal(read('{ no es json').ntfy, null);
    assert.deepEqual([...read({ ignorar: [' Yo@Correo.com ', ''] }).ignorar], ['yo@correo.com']);
    assert.equal(readAvisosConfig(path.join(dir, 'no-existe.json'), quiet).ntfy, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Ejecuta scripts/avisos.js con su carpeta de datos y devuelve el código de salida y lo que escribió. */
function runScript(dataDir, extra = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, `--datos=${dataDir}`, '--sin-descarga', ...extra], {
      env: { ...process.env, AVISOS_SIN_VENTANA: '1' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (status) => resolve({ status, out }));
  });
}

test('npm run avisos: muestra los avisos nuevos con el nombre sacado de la copia y recuerda el último', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-avisos-pc-'));
  try {
    fs.writeFileSync(path.join(dataDir, 'avisos.json'), JSON.stringify({ ntfy: `${ntfyUrl}/${TOPIC}` }));
    // Copia del servidor con dos cuentas (solo la tabla que se consulta).
    fs.mkdirSync(path.join(dataDir, 'copias-servidor'));
    const copy = new DatabaseSync(path.join(dataDir, 'copias-servidor', 'cuentaclara-20261118-120000-000.db'));
    copy.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT); INSERT INTO users VALUES (901, 'Ana Gómez', 'ana@correo.test')");
    copy.close();

    const firstId = ntfy.messages.length ? ntfy.messages.at(-1).id : null;
    if (firstId) fs.writeFileSync(path.join(dataDir, 'avisos-estado.json'), JSON.stringify({ since: firstId }));
    ntfy.messages.push(
      { id: 'x1', time: 1_800_000_000, event: 'message', topic: TOPIC, title: 'Cuenta nueva en CuentaClara', message: 'Se registró la cuenta #901. Ya van 9 cuentas.', tags: ['tada', 'cuenta-901'] },
      { id: 'x2', time: 1_800_000_060, event: 'message', topic: TOPIC, title: 'Alguien entró a CuentaClara', message: 'La cuenta #902 entró a la app.', tags: ['wave', 'cuenta-902'] },
    );

    const r1 = await runScript(dataDir);
    assert.equal(r1.status, 0, r1.out);
    assert.match(r1.out, /\[aviso\] Cuenta nueva en CuentaClara \| Ana Gómez \(ana@correo\.test\) \| Se registró la cuenta #901/);
    assert.match(r1.out, /\[aviso\] Alguien entró a CuentaClara \| Cuenta #902 \| La cuenta #902 entró a la app\./);
    assert.match(r1.out, /2 avisos nuevos/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'avisos-estado.json'), 'utf8')), { since: 'x2' });
    const registro = fs.readFileSync(path.join(dataDir, 'avisos-registro.txt'), 'utf8');
    assert.match(registro, /Cuenta nueva en CuentaClara: Se registró la cuenta #901\. Ya van 9 cuentas\. \| Ana Gómez \(ana@correo\.test\)/);

    const r2 = await runScript(dataDir);
    assert.equal(r2.status, 0, r2.out);
    assert.match(r2.out, /No hay avisos nuevos/);
    assert.equal(ntfy.polls.at(-1), 'x2');

    // --probar publica en el tema y no vuelve a mostrar la prueba en la siguiente revisión.
    const r3 = await runScript(dataDir, ['--probar']);
    assert.equal(r3.status, 0, r3.out);
    assert.equal(ntfy.messages.at(-1).title, 'Prueba de CuentaClara');
    assert.match((await runScript(dataDir)).out, /No hay avisos nuevos/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('npm run avisos sin avisos.json termina con error y lo anota', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-avisos-pc-'));
  try {
    const r = await runScript(dataDir);
    assert.equal(r.status, 1);
    assert.match(r.out, /no hay un tema de ntfy/);
    assert.match(fs.readFileSync(path.join(dataDir, 'avisos-registro.txt'), 'utf8'), /ERROR no hay un tema de ntfy/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
