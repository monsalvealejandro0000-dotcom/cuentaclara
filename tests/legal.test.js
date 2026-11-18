// Fase 12: documentos legales, registro de consentimientos y PQR (docs/12-legal-y-seguridad.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer, client, registerUser, ACCEPT } from './helpers.js';
import { verifyConsentChain, readResponsable } from '../server/legal.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LEGAL = path.join(ROOT, 'legal');

let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.destroy());

const uniq = () => `l${Date.now()}${Math.random().toString(36).slice(2, 7)}@test.local`;

test('los documentos legales son públicos y llevan versión y huella', async () => {
  const c = client(srv.baseUrl);
  const info = await c.get('/api/legal');
  assert.equal(info.status, 200);
  assert.deepEqual(info.data.docs.map((d) => d.key), ['terminos', 'privacidad', 'cookies', 'reembolsos']);
  assert.deepEqual(info.data.required, ['terminos', 'privacidad']);
  assert.equal(info.data.sicUrl, 'https://www.sic.gov.co');
  assert.ok(info.data.labels.terminos && info.data.labels.privacidad);
  for (const d of info.data.docs) {
    const r = await c.get(`/api/legal/${d.key}`);
    assert.equal(r.status, 200, d.key);
    assert.equal(r.data.version, d.version);
    assert.match(r.data.sha256, /^[0-9a-f]{64}$/);
    assert.ok(r.data.text.length > 500, `${d.key} tiene contenido`);
    assert.ok(!/\{\{\w+\}\}/.test(r.data.text), `${d.key}: no quedan marcadores sin rellenar`);
  }
  assert.equal((await c.get('/api/legal/otro')).status, 404);
  assert.equal(info.headers.get('set-cookie'), null, 'leer los documentos no crea cookies');
});

test('sin data/responsable.json los datos aparecen como pendientes; con él, se rellenan', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-test-'));
  try {
    const file = path.join(dir, 'responsable.json');
    const missing = readResponsable(file, { error() {} });
    assert.equal(missing.complete, false);
    assert.match(missing.values.nombre, /pendiente/);
    fs.copyFileSync(path.join(ROOT, 'docs', 'responsable.ejemplo.json'), file);
    assert.equal(readResponsable(file).complete, false, 'los valores de ejemplo cuentan como pendientes');
    fs.writeFileSync(
      file,
      `﻿${JSON.stringify({ nombre: 'Ana Pérez', documento: 'C.C. 1.234.567', direccion: 'Calle 1 # 2-3', ciudad: 'Medellín, Colombia', correo: 'hola@ejemplo.co', telefono: '300 000 0000', alojamiento: 'Servidor propio en Colombia' })}`,
    );
    const ok = readResponsable(file);
    assert.equal(ok.complete, true);
    assert.equal(ok.values.nombre, 'Ana Pérez');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('registro: dos casillas separadas y la prueba de cuándo y cómo aceptó', async () => {
  const c = client(srv.baseUrl);
  const email = uniq();
  const info = (await c.get('/api/legal')).data;
  const versions = Object.fromEntries(info.docs.map((d) => [d.key, d.version]));
  const r = await c.post('/api/auth/register', { name: 'Ana', email, password: 'clave-larga-77', ...ACCEPT, versions }, { 'user-agent': 'Navegador de prueba/1.0' });
  assert.equal(r.status, 201);

  const { history, pending } = (await c.get('/api/consents')).data;
  assert.deepEqual(pending, []);
  assert.equal(history.length, 2);
  const byPurpose = Object.fromEntries(history.map((h) => [h.purpose, h]));
  for (const key of ['terminos', 'privacidad']) {
    const h = byPurpose[key];
    assert.equal(h.action, 'acepta');
    assert.equal(h.context, 'registro');
    assert.equal(h.version, versions[key]);
    assert.equal(h.sha256, info.docs.find((d) => d.key === key).sha256);
    assert.equal(h.label, info.labels[key], 'se guarda el texto exacto de la casilla');
    assert.equal(h.ip, '127.0.0.1');
    assert.equal(h.userAgent, 'Navegador de prueba/1.0');
    assert.ok(Date.now() - new Date(h.at).getTime() < 60_000, 'fecha y hora de la aceptación');
  }
  assert.equal(verifyConsentChain(srv.app.db).ok, true);
});

test('si un documento cambió mientras el formulario estaba abierto → 409 y no se crea la cuenta', async () => {
  const email = uniq();
  const r = await client(srv.baseUrl).post('/api/auth/register', { name: 'Ana', email, password: 'clave-larga-77', ...ACCEPT, versions: { terminos: '2000-01-01' } });
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, 'LEGAL_CHANGED');
  assert.equal(srv.app.db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get(email).n, 0);
});

test('el registro de consentimientos no se puede cambiar ni borrar, y la manipulación se detecta', async () => {
  const { user } = await registerUser(srv.baseUrl);
  const db = srv.app.db;
  assert.throws(() => db.prepare('UPDATE consents SET ip = ? WHERE user_id = ?').run('8.8.8.8', user.id), /no se puede modificar/);
  assert.throws(() => db.prepare('DELETE FROM consents WHERE user_id = ?').run(user.id), /no se puede borrar/);
  assert.throws(() => db.prepare("UPDATE legal_texts SET content = 'otro'").run(), /no se pueden modificar/);

  // Alguien con acceso directo al archivo quita la protección y cambia una fila: la cadena de huellas lo delata.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-test-'));
  try {
    const copy = path.join(dir, 'copia.db');
    db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
    const { DatabaseSync } = await import('node:sqlite');
    const evil = new DatabaseSync(copy);
    evil.exec('DROP TRIGGER consents_no_update');
    evil.prepare("UPDATE consents SET accepted_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?").run(user.id);
    const result = verifyConsentChain(evil);
    evil.close();
    assert.equal(result.ok, false);
    assert.match(result.reason, /modific/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('una versión nueva de los términos obliga a aceptarla antes de seguir', async () => {
  // Servidor con una copia de los documentos en la que los términos tienen otra versión.
  const legalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-legal-'));
  for (const f of fs.readdirSync(LEGAL)) fs.copyFileSync(path.join(LEGAL, f), path.join(legalDir, f));
  const first = await startServer();
  const { c, creds, user } = await registerUser(first.baseUrl);
  await first.stop();
  const terms = path.join(legalDir, 'terminos.md');
  fs.writeFileSync(terms, fs.readFileSync(terms, 'utf8').replace(/^version: .+$/m, 'version: 2099-01-01'));

  const { createApp } = await import('../server/app.js');
  const app = createApp({ dbPath: first.dbPath, legalDir, logger: { error() {} } });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const u = client(base);
    const login = await u.post('/api/auth/login', { email: creds.email, password: creds.password });
    assert.equal(login.status, 200);
    assert.deepEqual(login.data.consent.pending, ['terminos'], 'solo los términos cambiaron');
    assert.deepEqual((await u.get('/api/auth/me')).data.consent.pending, ['terminos']);

    // Mientras no acepte: ni sus datos ni nada más…
    const blocked = await u.get('/api/movements');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.error.code, 'CONSENT_REQUIRED');
    // …pero sí leer los documentos, enviar una PQR y ver sus consentimientos.
    assert.equal((await u.get('/api/legal/terminos')).status, 200);
    assert.equal((await u.get('/api/consents')).status, 200);
    assert.equal((await u.post('/api/pqrs', { type: 'queja', subject: 'No estoy de acuerdo', message: 'Con el punto 3' })).status, 201);

    const missing = await u.post('/api/consents', { accept_terms: true });
    assert.equal(missing.status, 400);
    assert.ok(missing.data.error.fields.accept_privacy);
    const ok = await u.post('/api/consents', { ...ACCEPT, versions: { terminos: '2099-01-01' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data.pending, []);
    assert.equal((await u.get('/api/movements')).status, 200);
    const last = (await u.get('/api/consents')).data.history[0];
    assert.equal(last.context, 'actualizacion');
    assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM consents WHERE user_id = ? AND version = '2099-01-01'").get(user.id).n, 1);
    assert.equal((await u.post('/api/consents', ACCEPT)).status, 409, 'aceptar dos veces no duplica');
    void c;
  } finally {
    await app.close();
    fs.rmSync(first.tmpDir, { recursive: true, force: true });
    fs.rmSync(legalDir, { recursive: true, force: true });
  }
});

test('eliminar la cuenta es posible sin aceptar y conserva solo la prueba de los consentimientos', async () => {
  const { c, creds, user } = await registerUser(srv.baseUrl);
  await c.post('/api/pqrs', { type: 'peticion', subject: 'Hola', message: 'Una petición' });
  assert.equal((await c.del('/api/account', { password: creds.password })).status, 204);
  const db = srv.app.db;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM consents WHERE user_id = ?').get(user.id).n, 2);
  const pqr = db.prepare('SELECT user_id, email FROM pqrs WHERE email = ?').get(creds.email);
  assert.equal(pqr.user_id, null, 'la PQR queda sin cuenta asociada');
  // Una cuenta nueva que reutilice el mismo id no hereda nada.
  const again = await registerUser(srv.baseUrl);
  const history = (await again.c.get('/api/consents')).data.history;
  assert.ok(history.every((h) => h.at && h.context === 'registro'));
  assert.equal(history.length, 2);
  assert.deepEqual((await again.c.get('/api/pqrs')).data.pqrs, []);
});

test('avisar un pago guarda la aceptación de términos, reembolsos y privacidad', async () => {
  const configFile = path.join(path.dirname(srv.dbPath), 'cobro.json');
  fs.writeFileSync(configFile, JSON.stringify({ metodos: [{ nombre: 'Nequi', detalle: '300 000 0000' }] }));
  try {
    const { c } = await registerUser(srv.baseUrl);
    const today = (await c.get('/api/plan')).data.plan.today;
    const body = { tier: 'pro', months: 1, method: 'Nequi', paid_on: today, amount_cents: 1_490_000, receipt: 'M1', note: '', confirm: true };
    const no = await c.post('/api/payments', body);
    assert.equal(no.status, 400);
    assert.ok(no.data.error.fields.accept_terms && no.data.error.fields.accept_privacy);
    const r = await c.post('/api/payments', { ...body, ...ACCEPT });
    assert.equal(r.status, 201);
    const pago = (await c.get('/api/consents')).data.history.filter((h) => h.context === 'pago');
    assert.deepEqual(pago.map((h) => h.purpose).sort(), ['privacidad', 'reembolsos', 'terminos']);
    assert.ok(pago.every((h) => h.detail.includes(`#${r.data.payment.id}`)));
  } finally {
    fs.rmSync(configFile, { force: true });
  }
});

test('invitar al contador y quitarle el acceso queda registrado', async () => {
  const { c } = await registerUser(srv.baseUrl);
  const email = uniq();
  assert.equal((await c.post('/api/accountant', { email, authorize: true })).status, 200);
  assert.equal((await c.del('/api/accountant')).status, 204);
  const h = (await c.get('/api/consents')).data.history.filter((x) => x.purpose === 'compartir_contador');
  assert.deepEqual(h.map((x) => x.action), ['revoca', 'acepta']);
  assert.ok(h.every((x) => x.detail === `Contador: ${email}`));
});

test('PQR: radicado con fecha y hora, seguimiento y respuesta', async () => {
  const { c, creds } = await registerUser(srv.baseUrl);
  const bad = await c.post('/api/pqrs', { type: 'otro', subject: '', message: 'x'.repeat(3001) });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.error.fields.type && bad.data.error.fields.subject && bad.data.error.fields.message);

  const r = await c.post('/api/pqrs', { type: 'reclamo', subject: 'Reembolso', message: 'Quiero ejercer el retracto' });
  assert.equal(r.status, 201);
  const p = r.data.pqr;
  assert.match(p.radicado, /^PQR-\d{4}-\d{5}$/);
  assert.equal(p.status, 'radicada');
  assert.ok(p.createdAt);
  assert.equal((await c.get('/api/pqrs')).data.pqrs[0].radicado, p.radicado);
  // Otra persona no la ve.
  const other = await registerUser(srv.baseUrl);
  assert.deepEqual((await other.c.get('/api/pqrs')).data.pqrs, []);

  // El administrador responde con npm run pqr.
  const run = (...args) => execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'pqr.js'), `--db=${srv.dbPath}`, ...args], { encoding: 'utf8' });
  assert.match(run(), new RegExp(p.radicado));
  assert.match(run(`--responder=${p.id}`, '--respuesta=Te devolvimos el dinero'), /respondida/);
  const after = (await c.get('/api/pqrs')).data.pqrs[0];
  assert.equal(after.status, 'respondida');
  assert.equal(after.response, 'Te devolvimos el dinero');
  assert.ok(after.respondedAt);

  // npm run consentimientos muestra la prueba de esta persona y verifica el registro.
  const consents = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'consentimientos.js'), `--db=${srv.dbPath}`, `--email=${creds.email}`, '--verificar'], { encoding: 'utf8' });
  assert.match(consents, /Registro íntegro/);
  assert.match(consents, /ACEPTÓ terminos/);
  assert.match(consents, /ACEPTÓ privacidad/);

  // Máximo 5 por día.
  for (let i = 0; i < 4; i++) assert.equal((await c.post('/api/pqrs', { type: 'peticion', subject: `P${i}`, message: 'm' })).status, 201);
  assert.equal((await c.post('/api/pqrs', { type: 'peticion', subject: 'otra', message: 'm' })).status, 429);
});
