// Fase 13: confirmar el correo, recuperar la contraseña y verificación en dos pasos (docs/13-correo-y-segundo-factor.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer, client, registerUser, tokenOf, ACCEPT, TEST_LIMITS } from './helpers.js';
import { base32Decode, base32Encode, hotp, newBackupCodes, normalizeBackupCode, otpauthUri, timeStep, totpCode, verifyTotp } from '../server/totp.js';
import { BREVO_URL, createMailer, EMAIL_KINDS, parseAppUrl, renderEmail, validateMailConfig } from '../server/mail.js';
import { setPlanByAdmin } from '../server/plans.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Reloj del servidor que las pruebas pueden adelantar (enlaces que vencen, códigos de 30 segundos).
let offset = 0;
const clock = () => new Date(Date.now() + offset);
/** Adelanta el reloj 30 s y devuelve el código que mostraría la app en ese momento (cada uso, un intervalo nuevo). */
const nextCode = (secret) => {
  offset += 30_000;
  return totpCode(secret, clock().getTime());
};

let srv;
before(async () => {
  srv = await startServer({ now: clock });
});
after(() => srv.destroy());

const uniq = () => `c${Date.now()}${Math.random().toString(36).slice(2, 7)}@test.local`;
const PASSWORD = 'clave-segura-123';

/** Petición con una cabecera Host inventada (fetch no deja cambiarla). */
function rawPost(urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `${srv.baseUrl}${urlPath}`,
      { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

/** Cuenta con la verificación en dos pasos activada. Devuelve la clave y los códigos de respaldo. */
async function withTwoFactor(overrides) {
  const u = await registerUser(srv.baseUrl, overrides);
  const setup = await u.c.post('/api/account/2fa/setup', { password: u.creds.password });
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  const secret = setup.data.secret.replace(/\s/g, '');
  const enable = await u.c.post('/api/account/2fa/enable', { code: nextCode(secret) });
  assert.equal(enable.status, 200, JSON.stringify(enable.data));
  return { ...u, secret, backupCodes: enable.data.backupCodes };
}

/** Inicia sesión con contraseña y, si se pide, con el código. */
async function login(email, password, code) {
  const c = client(srv.baseUrl);
  const first = await c.post('/api/auth/login', { email, password });
  if (!first.data?.twoFactor || code === undefined) return { c, first };
  const second = await c.post('/api/auth/login/2fa', { ticket: first.data.twoFactor.ticket, code });
  return { c, first, second };
}

// ---------------------------------------------------------------- piezas sueltas

test('TOTP: vectores del RFC 6238, base32, ventana de ±30 s y sin repetir códigos', () => {
  const key = Buffer.from('12345678901234567890');
  // Tabla del apéndice B del RFC 6238 (SHA-1, 8 dígitos).
  for (const [t, expected] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ]) {
    assert.equal(hotp(key, timeStep(t * 1000), 8), expected, `t=${t}`);
  }
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.equal(base32Decode('MZXW 6YTB OI').toString(), 'foobar');

  const secret = base32Encode(crypto.randomBytes(20));
  const t = 1_700_000_000_000;
  const step = timeStep(t);
  assert.equal(verifyTotp(secret, totpCode(secret, t), t), step);
  assert.equal(verifyTotp(secret, totpCode(secret, t - 30_000), t), step - 1, 'acepta el código anterior');
  assert.equal(verifyTotp(secret, totpCode(secret, t + 30_000), t), step + 1, 'acepta el siguiente');
  assert.equal(verifyTotp(secret, totpCode(secret, t - 90_000), t), null, 'no acepta uno de hace 90 s');
  assert.equal(verifyTotp(secret, totpCode(secret, t), t, step), null, 'un código ya usado no vuelve a servir');
  assert.equal(verifyTotp(secret, '12345', t), null);
  assert.equal(verifyTotp(secret, 'abcdef', t), null);

  const uri = otpauthUri(secret, 'ana+1@correo.com');
  assert.match(uri, /^otpauth:\/\/totp\/CuentaClara:ana%2B1%40correo\.com\?secret=[A-Z2-7]+&issuer=CuentaClara&algorithm=SHA1&digits=6&period=30$/);

  const codes = newBackupCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[2-9a-hjkmnp-z]{5}-[2-9a-hjkmnp-z]{5}$/);
  assert.equal(normalizeBackupCode(' K7M2P x9qrt '), 'k7m2px9qrt');
  assert.equal(normalizeBackupCode('123'), null);
});

test('data/correo.json: se valida y el envío a Brevo lleva lo necesario', async () => {
  assert.throws(() => validateMailConfig({ servicio: 'smtp' }, {}), /brevo/);
  assert.throws(() => validateMailConfig({ servicio: 'brevo' }, {}), /clave_api/);
  assert.throws(() => validateMailConfig({ servicio: 'brevo', clave_api: 'PEGA-AQUI-TU-CLAVE', remitente_correo: 'a@b.co' }, {}), /ejemplo/);
  assert.throws(() => validateMailConfig({ servicio: 'brevo', clave_api: 'xkeysib-1', remitente_correo: 'no-responder@TU-DOMINIO.co' }, {}), /remitente/);
  assert.throws(() => parseAppUrl('https://cuentaclara.co/app'), /solo el dominio/);
  assert.throws(() => parseAppUrl('ftp://cuentaclara.co'), /https/);
  assert.equal(parseAppUrl('https://cuentaclara.co/'), 'https://cuentaclara.co');
  const fromEnv = validateMailConfig({ servicio: 'brevo', remitente_correo: 'hola@cuentaclara.co' }, { BREVO_API_KEY: 'xkeysib-env' });
  assert.equal(fromEnv.key, 'xkeysib-env');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-correo-'));
  try {
    const file = path.join(dir, 'correo.json');
    // El Bloc de notas guarda con BOM: también se acepta.
    fs.writeFileSync(
      file,
      '﻿' + JSON.stringify({ servicio: 'brevo', clave_api: 'xkeysib-123', remitente_nombre: 'CuentaClara', remitente_correo: 'no-responder@cuentaclara.co', url_app: 'https://cuentaclara.co' }),
    );
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messageId: '<1@brevo>' }), { status: 201 });
    };
    const mailer = createMailer({ configPath: file, fetchImpl, logger: { info() {}, error() {} }, contact: 'soporte@cuentaclara.co' });
    assert.equal(mailer.mode(), 'brevo');
    assert.equal(mailer.link('/restablecer', 'abc'), 'https://cuentaclara.co/#/restablecer?t=abc');
    await mailer.sendNow('ana@correo.com', 'recuperar', { name: 'Ana', link: mailer.link('/restablecer', 'abc') });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, BREVO_URL);
    assert.equal(calls[0].init.headers['api-key'], 'xkeysib-123');
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.sender, { name: 'CuentaClara', email: 'no-responder@cuentaclara.co' });
    assert.deepEqual(body.to, [{ email: 'ana@correo.com', name: 'Ana' }]);
    assert.deepEqual(body.replyTo, { email: 'soporte@cuentaclara.co' });
    assert.equal(body.subject, 'Restablece tu contraseña de CuentaClara');
    assert.match(body.textContent, /https:\/\/cuentaclara\.co\/#\/restablecer\?t=abc/);
    assert.match(body.htmlContent, /href="https:\/\/cuentaclara\.co\/#\/restablecer\?t=abc"/);

    // Si Brevo falla, la petición del usuario no falla: se anota el error.
    const errors = [];
    const failing = createMailer({ configPath: file, fetchImpl: async () => new Response('{"message":"key not found"}', { status: 401 }), logger: { info() {}, error: (m) => errors.push(m) } });
    failing.send('ana@correo.com', 'verificar', { link: 'x' });
    await new Promise((r) => setTimeout(r, 20));
    assert.match(errors[0], /No se pudo enviar «verificar» a a\*\*\*@correo\.com: Brevo respondió 401/);

    // Sin archivo: modo local, muestra el enlace en la ventana negra y no llama a internet.
    const logs = [];
    const local = createMailer({ configPath: path.join(dir, 'no-existe.json'), appUrl: 'http://localhost:3000', fetchImpl: () => assert.fail('no debe llamar a Brevo'), logger: { info: (m) => logs.push(m) } });
    assert.equal(local.mode(), 'local');
    local.send('ana@correo.com', 'verificar', { link: local.link('/confirmar-correo', 'xyz') });
    await new Promise((r) => setTimeout(r, 10));
    assert.match(logs[0], /Modo local[\s\S]*Enlace: http:\/\/localhost:3000\/#\/confirmar-correo\?t=xyz/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('plantillas de correo: texto y HTML sin recursos de terceros y con el nombre escapado', () => {
  for (const kind of EMAIL_KINDS) {
    const r = renderEmail(kind, { name: '<b>Ana</b>', link: 'https://cuentaclara.co/#/x?t=1', when: 'hoy', browser: 'Chrome', ip: '1.2.3.4', left: 2, newEmail: 'n@c.co', appUrl: 'https://cuentaclara.co' });
    assert.ok(r.subject && r.text && r.html, kind);
    assert.ok(!r.html.includes('<b>Ana</b>'), `${kind}: el nombre va escapado`);
    assert.doesNotMatch(r.html, /<img|<script|src=/i, `${kind}: sin imágenes ni código`);
  }
});

// ---------------------------------------------------------------- confirmar el correo

test('al registrarse llega el enlace para confirmar el correo; sirve una vez y se guarda solo como huella', async () => {
  const email = uniq();
  const c = client(srv.baseUrl);
  const r = await c.post('/api/auth/register', { name: 'Ana', email, password: PASSWORD, ...ACCEPT });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.emailVerified, false);
  assert.equal(r.data.user.twoFactor, false);
  assert.equal(r.data.delivery, 'prueba');
  const mail = srv.lastMail(email, 'verificar');
  assert.ok(mail, 'llega el correo');
  assert.equal(mail.subject, 'Confirma tu correo en CuentaClara');
  assert.match(mail.link, /^http:\/\/localhost:3000\/#\/confirmar-correo\?t=[A-Za-z0-9_-]{43}$/);
  const token = tokenOf(mail);
  const db = srv.app.db;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_tokens WHERE token_sha256 = ?').get(token).n, 0, 'el código no se guarda en claro');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_tokens WHERE token_sha256 = ?').get(sha256(token)).n, 1, 'solo su huella');

  // Se puede abrir sin sesión (p. ej. en el celular).
  const other = client(srv.baseUrl);
  assert.deepEqual((await other.post('/api/auth/email/confirm', { token })).data, { status: 'confirmado', email });
  assert.equal((await c.get('/api/auth/me')).data.user.emailVerified, true);
  // Abrirlo otra vez no confirma nada nuevo, pero tampoco asusta a la persona.
  assert.deepEqual((await other.post('/api/auth/email/confirm', { token })).data, { status: 'ya_confirmado', email });
  assert.equal((await c.post('/api/account/email/resend')).status, 409);
  for (const bad of ['', 'x', 'a'.repeat(43), 12345, null]) {
    const res = await other.post('/api/auth/email/confirm', { token: bad });
    assert.equal(res.status, 400, String(bad));
    assert.equal(res.data.error.code, 'TOKEN_INVALID');
  }
  const security = (await c.get('/api/account/security')).data;
  assert.equal(security.emailVerified, true);
  assert.equal(security.events[0].type, 'correo_confirmado');
});

test('reenviar el enlace anula el anterior; el enlace vence a las 24 horas', async () => {
  const { c, user } = await registerUser(srv.baseUrl, { verified: false });
  const first = tokenOf(srv.lastMail(user.email, 'verificar'));
  const resend = await c.post('/api/account/email/resend');
  assert.equal(resend.status, 200);
  const second = tokenOf(srv.lastMail(user.email, 'verificar'));
  assert.notEqual(first, second);
  assert.equal((await c.post('/api/auth/email/confirm', { token: first })).status, 400, 'el anterior ya no sirve');
  offset += 24 * 60 * 60 * 1000 + 1000;
  try {
    assert.equal((await c.post('/api/auth/email/confirm', { token: second })).status, 400, 'vencido');
  } finally {
    offset -= 24 * 60 * 60 * 1000 + 1000;
  }
  assert.equal((await c.post('/api/account/email/resend')).status, 200);
  assert.equal((await c.post('/api/auth/email/confirm', { token: tokenOf(srv.lastMail(user.email, 'verificar')) })).status, 200);
});

test('reenviar tiene límite: 5 correos por hora y cuenta', async () => {
  const { c } = await registerUser(srv.baseUrl, { verified: false });
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/account/email/resend')).status, 200);
  const r = await c.post('/api/account/email/resend');
  assert.equal(r.status, 429);
  assert.ok(r.headers.get('retry-after'));
});

test('sin correo confirmado no se puede invitar ni ser contador, avisar un pago ni activar la verificación en dos pasos', async () => {
  const client1 = await registerUser(srv.baseUrl, { verified: false });
  let r = await client1.c.post('/api/accountant', { email: uniq(), authorize: true });
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'EMAIL_UNVERIFIED');
  r = await client1.c.post('/api/account/2fa/setup', { password: client1.creds.password });
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'EMAIL_UNVERIFIED');

  fs.writeFileSync(path.join(srv.tmpDir, 'cobro.json'), JSON.stringify({ metodos: [{ nombre: 'Nequi', detalle: '300 000 0000' }] }));
  try {
    r = await client1.c.post('/api/payments', {
      tier: 'pro', months: 1, method: 'Nequi', paid_on: '2026-11-01', amount_cents: 1_490_000, receipt: 'M1', confirm: true, ...ACCEPT,
    });
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, 'EMAIL_UNVERIFIED');
  } finally {
    fs.rmSync(path.join(srv.tmpDir, 'cobro.json'), { force: true });
  }

  // Alguien se registra con el correo del contador antes que él: no ve la invitación del cliente.
  const realClient = await registerUser(srv.baseUrl);
  const impostor = await registerUser(srv.baseUrl, { verified: false });
  setPlanByAdmin(srv.app.db, impostor.user.id, 'contador');
  assert.equal((await realClient.c.post('/api/accountant', { email: impostor.user.email, authorize: true })).status, 200);
  const view = (await impostor.c.get('/api/clients')).data;
  assert.deepEqual(view.invitations, []);
  assert.equal(view.invitationsHidden, true);
  const id = srv.app.db.prepare('SELECT id FROM accountant_links WHERE client_user_id = ?').get(realClient.user.id).id;
  r = await impostor.c.post(`/api/clients/invitations/${id}/accept`);
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'EMAIL_UNVERIFIED');
  // Al confirmar su correo (demuestra que es suyo), sí la ve.
  await impostor.c.post('/api/account/email/resend');
  await impostor.c.post('/api/auth/email/confirm', { token: tokenOf(srv.lastMail(impostor.user.email, 'verificar')) });
  const after = (await impostor.c.get('/api/clients')).data;
  assert.equal(after.invitationsHidden, false);
  assert.equal(after.invitations.length, 1);
});

// ---------------------------------------------------------------- recuperar la contraseña

test('olvidé mi contraseña: misma respuesta exista o no la cuenta; el enlace usa la dirección configurada, no la cabecera Host', async () => {
  const nobody = uniq();
  const c = client(srv.baseUrl);
  const before = srv.outbox.length;
  const a = await c.post('/api/auth/password/forgot', { email: nobody });
  assert.equal(a.status, 200);
  assert.equal(srv.outbox.length, before, 'no se envía nada a un correo sin cuenta');

  const { user } = await registerUser(srv.baseUrl);
  const b = await c.post('/api/auth/password/forgot', { email: user.email.toUpperCase() });
  assert.deepEqual(b.data, a.data, 'la respuesta es idéntica');
  const mail = srv.lastMail(user.email, 'recuperar');
  assert.match(mail.link, /^http:\/\/localhost:3000\/#\/restablecer\?t=/);

  assert.equal(await rawPost('/api/auth/password/forgot', { email: user.email }, { host: 'atacante.example' }), 200);
  assert.match(srv.lastMail(user.email, 'recuperar').link, /^http:\/\/localhost:3000\//, 'nunca un enlace a otro dominio');

  assert.equal((await c.post('/api/auth/password/forgot', { email: 'no-es-correo' })).status, 400);
  assert.equal((await c.post('/api/auth/password/forgot', {})).status, 400);
});

test('olvidé mi contraseña: máximo 3 correos por hora a una misma dirección, sin decirlo', async () => {
  const { user } = await registerUser(srv.baseUrl);
  const c = client(srv.baseUrl);
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/password/forgot', { email: user.email })).status, 200);
  assert.equal(srv.outbox.filter((m) => m.to === user.email && m.kind === 'recuperar').length, 3);
});

test('olvidé mi contraseña: límite por IP', async () => {
  const s = await startServer({ limits: { ...TEST_LIMITS, forgot: { max: 2 } } });
  try {
    const c = client(s.baseUrl);
    assert.equal((await c.post('/api/auth/password/forgot', { email: uniq() })).status, 200);
    assert.equal((await c.post('/api/auth/password/forgot', { email: uniq() })).status, 200);
    const r = await c.post('/api/auth/password/forgot', { email: uniq() });
    assert.equal(r.status, 429);
    assert.ok(r.headers.get('retry-after'));
  } finally {
    await s.destroy();
  }
});

test('restablecer la contraseña: cambia la clave, cierra todas las sesiones, confirma el correo y avisa', async () => {
  const { c, user, creds } = await registerUser(srv.baseUrl, { verified: false });
  const second = await login(user.email, creds.password);
  assert.equal((await second.c.get('/api/auth/me')).status, 200);

  await client(srv.baseUrl).post('/api/auth/password/forgot', { email: user.email });
  const token = tokenOf(srv.lastMail(user.email, 'recuperar'));
  const anon = client(srv.baseUrl);
  assert.deepEqual((await anon.post('/api/auth/password/reset/check', { token })).data, { email: user.email });
  assert.equal((await anon.post('/api/auth/password/reset/check', { token: 'x' })).status, 400);

  let r = await anon.post('/api/auth/password/reset', { token, password: 'corta1' });
  assert.equal(r.status, 400);
  assert.ok(r.data.error.fields.password);
  r = await anon.post('/api/auth/password/reset', { token: 'b'.repeat(43), password: 'otra-clave-larga-9' });
  assert.equal(r.data.error.code, 'TOKEN_INVALID');

  r = await anon.post('/api/auth/password/reset', { token, password: 'otra-clave-larga-9' });
  assert.equal(r.status, 204);
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await c.get('/api/auth/me')).status, 401, 'se cerró la sesión del registro');
  assert.equal((await second.c.get('/api/auth/me')).status, 401, 'y la del otro dispositivo');
  assert.equal((await anon.post('/api/auth/password/reset', { token, password: 'tercera-clave-77' })).status, 400, 'el enlace sirve una sola vez');

  assert.equal((await login(user.email, creds.password)).first.status, 401, 'la contraseña anterior ya no sirve');
  const ok = await login(user.email, 'otra-clave-larga-9');
  assert.equal(ok.first.status, 200);
  assert.equal(ok.first.data.user.emailVerified, true, 'abrir el enlace demostró que el correo es suyo');
  assert.ok(srv.lastMail(user.email, 'contrasena_cambiada'), 'llega el aviso de seguridad');
  const types = (await ok.c.get('/api/account/security')).data.events.map((e) => e.type);
  assert.ok(types.includes('contrasena_restablecida'));
});

test('el enlace de recuperación vence a los 30 minutos; pedir otro anula el anterior', async () => {
  const { user } = await registerUser(srv.baseUrl);
  const c = client(srv.baseUrl);
  await c.post('/api/auth/password/forgot', { email: user.email });
  const first = tokenOf(srv.lastMail(user.email, 'recuperar'));
  offset += 31 * 60 * 1000;
  try {
    assert.equal((await c.post('/api/auth/password/reset/check', { token: first })).status, 400);
  } finally {
    offset -= 31 * 60 * 1000;
  }
  await c.post('/api/auth/password/forgot', { email: user.email });
  const second = tokenOf(srv.lastMail(user.email, 'recuperar'));
  await c.post('/api/auth/password/forgot', { email: user.email });
  const third = tokenOf(srv.lastMail(user.email, 'recuperar'));
  assert.equal((await c.post('/api/auth/password/reset/check', { token: second })).status, 400);
  assert.equal((await c.post('/api/auth/password/reset/check', { token: third })).status, 200);
});

test('cambiar la contraseña desde Configuración anula los enlaces de recuperación y avisa por correo', async () => {
  const { c, user, creds } = await registerUser(srv.baseUrl);
  await client(srv.baseUrl).post('/api/auth/password/forgot', { email: user.email });
  const token = tokenOf(srv.lastMail(user.email, 'recuperar'));
  assert.equal((await c.put('/api/account/password', { current_password: creds.password, new_password: 'nueva-clave-segura-4' })).status, 204);
  assert.equal((await c.post('/api/auth/password/reset/check', { token })).status, 400);
  const notice = srv.lastMail(user.email, 'contrasena_cambiada');
  assert.ok(notice);
  assert.match(notice.text, /Si no fuiste tú/);
});

// ---------------------------------------------------------------- verificación en dos pasos

test('verificación en dos pasos: activar, entrar con el código, sin repetir códigos y con códigos de respaldo', async () => {
  const u = await registerUser(srv.baseUrl);
  const otherDevice = await login(u.user.email, u.creds.password);

  assert.equal((await u.c.post('/api/account/2fa/setup', {})).status, 400);
  assert.equal((await u.c.post('/api/account/2fa/setup', { password: 'no-es-la-clave-1' })).status, 400);
  const setup = await u.c.post('/api/account/2fa/setup', { password: u.creds.password });
  assert.equal(setup.status, 200);
  assert.match(setup.data.secret, /^([A-Z2-7]{4} )+[A-Z2-7]{4}$/);
  assert.match(setup.data.uri, /^otpauth:\/\/totp\//);
  const secret = setup.data.secret.replace(/\s/g, '');

  assert.equal((await u.c.post('/api/account/2fa/enable', { code: 'abcdef' })).status, 400);
  const enable = await u.c.post('/api/account/2fa/enable', { code: nextCode(secret) });
  assert.equal(enable.status, 200);
  const codes = enable.data.backupCodes;
  assert.equal(codes.length, 10);
  assert.equal(srv.app.db.prepare('SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ? AND code_sha256 = ?').get(u.user.id, codes[0]).n, 0, 'no se guardan en claro');
  assert.equal((await u.c.get('/api/auth/me')).data.user.twoFactor, true);
  assert.equal((await otherDevice.c.get('/api/auth/me')).status, 401, 'las otras sesiones se cierran');
  assert.ok(srv.lastMail(u.user.email, '2fa_activado'));
  assert.equal((await u.c.post('/api/account/2fa/setup', { password: u.creds.password })).status, 409);
  const sec = (await u.c.get('/api/account/security')).data;
  assert.equal(sec.twoFactor.enabled, true);
  assert.equal(sec.twoFactor.backupCodesLeft, 10);

  // La contraseña sola ya no abre sesión.
  const step1 = await login(u.user.email, u.creds.password);
  assert.equal(step1.first.status, 200);
  assert.ok(step1.first.data.twoFactor.ticket);
  assert.equal(step1.first.data.user, undefined);
  assert.equal(step1.first.headers.get('set-cookie'), null);
  assert.equal((await step1.c.get('/api/auth/me')).status, 401);

  const wrong = await step1.c.post('/api/auth/login/2fa', { ticket: step1.first.data.twoFactor.ticket, code: '000000' === totpCode(secret, clock().getTime()) ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  assert.ok(wrong.data.error.fields.code);
  const code = nextCode(secret);
  const ok = await step1.c.post('/api/auth/login/2fa', { ticket: step1.first.data.twoFactor.ticket, code });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.twoFactor, true);
  assert.equal((await step1.c.get('/api/auth/me')).status, 200);
  assert.equal((await step1.c.post('/api/auth/login/2fa', { ticket: step1.first.data.twoFactor.ticket, code })).status, 401, 'el paso ya se usó');

  // El mismo código no sirve dos veces (quien lo vea por encima del hombro no puede reutilizarlo).
  const replay = await login(u.user.email, u.creds.password, code);
  assert.equal(replay.second.status, 400);

  // Código de respaldo, escrito de cualquier forma: sirve una vez y avisa.
  const backup = await login(u.user.email, u.creds.password, ` ${codes[0].toUpperCase().replace('-', ' ')} `);
  assert.equal(backup.second.status, 200);
  assert.equal(backup.second.data.backupCodesLeft, 9);
  assert.match(srv.lastMail(u.user.email, 'codigo_respaldo').text, /Te quedan 9/);
  assert.equal((await login(u.user.email, u.creds.password, codes[0])).second.status, 400);

  // Códigos nuevos: piden contraseña y código; los anteriores dejan de servir.
  assert.equal((await u.c.post('/api/account/2fa/backup-codes', { password: u.creds.password })).status, 400);
  const regen = await u.c.post('/api/account/2fa/backup-codes', { password: u.creds.password, code: nextCode(secret) });
  assert.equal(regen.status, 200);
  assert.equal(regen.data.backupCodes.length, 10);
  assert.equal((await login(u.user.email, u.creds.password, codes[1])).second.status, 400);
  assert.equal((await login(u.user.email, u.creds.password, regen.data.backupCodes[0])).second.status, 200);

  // Recuperar la contraseña NO quita el segundo factor.
  await client(srv.baseUrl).post('/api/auth/password/forgot', { email: u.user.email });
  const token = tokenOf(srv.lastMail(u.user.email, 'recuperar'));
  assert.equal((await client(srv.baseUrl).post('/api/auth/password/reset', { token, password: 'clave-nueva-2fa-9' })).status, 204);
  const afterReset = await login(u.user.email, 'clave-nueva-2fa-9');
  assert.ok(afterReset.first.data.twoFactor, 'sigue pidiendo el código');

  // Desactivar: contraseña y código.
  const s = await login(u.user.email, 'clave-nueva-2fa-9', nextCode(secret));
  assert.equal(s.second.status, 200);
  assert.equal((await s.c.post('/api/account/2fa/disable', { password: 'clave-nueva-2fa-9', code: '12' })).status, 400);
  assert.equal((await s.c.post('/api/account/2fa/disable', { password: 'clave-nueva-2fa-9', code: nextCode(secret) })).status, 204);
  assert.ok(srv.lastMail(u.user.email, '2fa_desactivado'));
  const plain = await login(u.user.email, 'clave-nueva-2fa-9');
  assert.ok(plain.first.data.user, 'ya entra solo con la contraseña');
  assert.equal(srv.app.db.prepare('SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ?').get(u.user.id).n, 0);
  const types = (await plain.c.get('/api/account/security')).data.events.map((e) => e.type);
  for (const t of ['2fa_activado', 'codigo_respaldo_usado', 'codigos_nuevos', 'contrasena_restablecida', '2fa_desactivado']) assert.ok(types.includes(t), t);
});

test('5 códigos incorrectos: el paso caduca, la cuenta se bloquea un rato y llega una alerta', async () => {
  const u = await withTwoFactor();
  const step = await login(u.user.email, u.creds.password);
  const ticket = step.first.data.twoFactor.ticket;
  const good = totpCode(u.secret, clock().getTime());
  const bad = good === '123456' ? '654321' : '123456';
  for (let i = 0; i < 4; i++) assert.equal((await step.c.post('/api/auth/login/2fa', { ticket, code: bad })).status, 400);
  const fifth = await step.c.post('/api/auth/login/2fa', { ticket, code: bad });
  assert.equal(fifth.status, 401);
  assert.equal(fifth.data.error.code, 'TWO_FACTOR_EXPIRED');
  const alert = srv.lastMail(u.user.email, '2fa_bloqueado');
  assert.ok(alert, 'llega la alerta');
  assert.match(alert.text, /escribió bien tu contraseña/);
  // Aunque vuelva a escribir la contraseña, el código correcto espera al desbloqueo.
  const again = await login(u.user.email, u.creds.password, nextCode(u.secret));
  assert.equal(again.second.status, 429);
});

test('el paso del código caduca a los 5 minutos', async () => {
  const u = await withTwoFactor();
  const step = await login(u.user.email, u.creds.password);
  offset += 5 * 60 * 1000 + 1000;
  const r = await step.c.post('/api/auth/login/2fa', { ticket: step.first.data.twoFactor.ticket, code: totpCode(u.secret, clock().getTime()) });
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'TWO_FACTOR_EXPIRED');
  assert.equal((await step.c.post('/api/auth/login/2fa', { ticket: 'inventado', code: '123456' })).status, 401);
});

// ---------------------------------------------------------------- cambiar de correo

test('cambiar de correo: cambia al abrir el enlace del correo nuevo, avisa al anterior y conserva las aceptaciones', async () => {
  const u = await registerUser(srv.baseUrl);
  const taken = await registerUser(srv.baseUrl);
  const newEmail = uniq();

  let r = await u.c.post('/api/account/email', { new_email: newEmail });
  assert.ok(r.data.error.fields.password);
  r = await u.c.post('/api/account/email', { new_email: u.user.email, password: u.creds.password });
  assert.ok(r.data.error.fields.new_email);
  r = await u.c.post('/api/account/email', { new_email: taken.user.email, password: u.creds.password });
  assert.equal(r.status, 409);
  r = await u.c.post('/api/account/email', { new_email: newEmail.toUpperCase(), password: 'no-es-la-clave-1' });
  assert.equal(r.status, 400);
  r = await u.c.post('/api/account/email', { new_email: newEmail.toUpperCase(), password: u.creds.password });
  assert.equal(r.status, 200);
  assert.equal(r.data.pendingEmail, newEmail);
  assert.equal((await u.c.get('/api/account/security')).data.pendingEmail, newEmail);
  assert.equal((await u.c.get('/api/auth/me')).data.user.email, u.user.email, 'aún no cambia');

  // Cancelar y volver a pedirlo.
  const cancelled = tokenOf(srv.lastMail(newEmail, 'cambiar_correo'));
  assert.equal((await u.c.del('/api/account/email/pending')).status, 204);
  assert.equal((await u.c.post('/api/auth/email/confirm', { token: cancelled })).status, 400);
  await u.c.post('/api/account/email', { new_email: newEmail, password: u.creds.password });

  const token = tokenOf(srv.lastMail(newEmail, 'cambiar_correo'));
  r = await client(srv.baseUrl).post('/api/auth/email/confirm', { token });
  assert.deepEqual(r.data, { status: 'cambiado', email: newEmail });
  const me = (await u.c.get('/api/auth/me')).data;
  assert.equal(me.user.email, newEmail);
  assert.equal(me.user.emailVerified, true);
  assert.deepEqual(me.consent.pending, [], 'las aceptaciones hechas con el correo anterior siguen valiendo');
  assert.ok((await u.c.get('/api/consents')).data.history.length >= 2);
  const notice = srv.lastMail(u.user.email, 'correo_cambiado');
  assert.ok(notice, 'aviso al correo anterior');
  assert.match(notice.text, new RegExp(newEmail.replace('.', '\\.')));

  assert.equal((await login(u.user.email, u.creds.password)).first.status, 401);
  assert.equal((await login(newEmail, u.creds.password)).first.status, 200);
  assert.deepEqual((await client(srv.baseUrl).post('/api/auth/email/confirm', { token })).data, { status: 'ya_confirmado', email: newEmail });
});

test('si otra cuenta toma el correo nuevo antes de confirmarlo, el cambio no se hace', async () => {
  const u = await registerUser(srv.baseUrl);
  const newEmail = uniq();
  await u.c.post('/api/account/email', { new_email: newEmail, password: u.creds.password });
  const token = tokenOf(srv.lastMail(newEmail, 'cambiar_correo'));
  await registerUser(srv.baseUrl, { email: newEmail });
  const r = await client(srv.baseUrl).post('/api/auth/email/confirm', { token });
  assert.equal(r.status, 409);
  assert.equal((await u.c.get('/api/auth/me')).data.user.email, u.user.email);
});

// ---------------------------------------------------------------- administrador y borrado

test('npm run seguridad: estado, quitar la verificación en dos pasos y cerrar sesiones', async () => {
  const u = await withTwoFactor();
  const run = (...args) => execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seguridad.js'), `--db=${srv.dbPath}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  let out = run(`--email=${u.user.email}`);
  assert.match(out, /Correo: confirmado/);
  assert.match(out, /Verificación en dos pasos: activada desde .*10 códigos de respaldo/);
  assert.match(out, /Verificación en dos pasos activada/);

  out = run(`--email=${u.user.email}`, '--quitar-2fa');
  assert.match(out, /Verificación en dos pasos quitada/);
  assert.equal((await u.c.get('/api/auth/me')).status, 401, 'sus sesiones se cerraron');
  const back = await login(u.user.email, u.creds.password);
  assert.ok(back.first.data.user, 'entra solo con la contraseña');
  const types = (await back.c.get('/api/account/security')).data.events.map((e) => e.type);
  assert.ok(types.includes('2fa_quitado_admin'));

  out = run(`--email=${u.user.email}`, '--cerrar-sesiones');
  assert.match(out, /1 sesión cerrada/);
  assert.equal((await back.c.get('/api/auth/me')).status, 401);

  assert.throws(() => run('--email=nadie@test.local'), /No existe una cuenta/);
  assert.throws(() => run('--probar-correo=yo@test.local'), /modo local/);

  // Confirmar un correo a mano (la cuenta del dueño de la app, sin enlace).
  const sin = await registerUser(srv.baseUrl, { verified: false });
  assert.equal((await sin.c.get('/api/auth/me')).data.user.emailVerified, false);
  out = run(`--email=${sin.user.email}`, '--confirmar-correo');
  assert.match(out, /confirmado por el administrador/);
  assert.equal((await sin.c.get('/api/auth/me')).data.user.emailVerified, true);
  assert.match(run(`--email=${sin.user.email}`, '--confirmar-correo'), /ya estaba confirmado/);
  const ev = (await sin.c.get('/api/account/security')).data.events.find((e) => e.type === 'correo_confirmado');
  assert.match(ev.detail, /por el administrador/);
});

test('eliminar la cuenta borra enlaces, códigos de respaldo, correos anteriores y actividad', async () => {
  const u = await withTwoFactor();
  await u.c.post('/api/account/email', { new_email: uniq(), password: u.creds.password });
  const db = srv.app.db;
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(u.user.id).n;
  assert.ok(count('backup_codes') > 0 && count('email_tokens') > 0 && count('security_events') > 0);
  assert.equal((await u.c.del('/api/account', { password: u.creds.password })).status, 204);
  for (const t of ['backup_codes', 'email_tokens', 'security_events', 'email_changes']) assert.equal(count(t), 0, t);
});
