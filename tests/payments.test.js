// Fase 11: cobro manual de los planes (docs/11-cobro-manual.md). Avisos de pago y `npm run pagos`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, registerUser } from './helpers.js';
import { setPlanByAdmin, startTrial, addDays } from '../server/plans.js';
import { todayLocal } from '../server/calc.js';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'pagos.js');
const CONFIG = { metodos: [{ nombre: 'Nequi', detalle: 'Número de prueba 300 000 0000' }, { nombre: 'Transferencia', detalle: 'Cuenta de prueba' }], contacto: 'pagos@test.local' };
let srv;
let configFile;
const today = todayLocal();

before(async () => {
  srv = await startServer();
  configFile = path.join(srv.tmpDir, 'cobro.json');
});
after(() => srv.destroy());

const writeConfig = (content) => fs.writeFileSync(configFile, typeof content === 'string' ? content : JSON.stringify(content));
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, `--db=${srv.dbPath}`, ...args], { encoding: 'utf8' });
const notice = (o = {}) => ({
  tier: 'pro',
  months: 3,
  method: 'Nequi',
  paid_on: today,
  amount_cents: 4_470_000,
  receipt: 'M123456',
  note: '',
  confirm: true,
  accept_terms: true,
  accept_privacy: true,
  ...o,
});
const planOf = async (c) => (await c.get('/api/plan')).data.plan;

test('sin cobro.json no hay cobro: la app queda como antes', async () => {
  if (fs.existsSync(configFile)) fs.rmSync(configFile);
  const { c } = await registerUser(srv.baseUrl);
  const r = await c.get('/api/payments/config');
  assert.equal(r.status, 404);
  assert.equal(r.data.error.code, 'NO_PAYMENT_CONFIG');
  assert.equal((await c.post('/api/payments', notice())).status, 404);
  assert.deepEqual((await c.get('/api/payments')).data, { payments: [], pending: null });
});

test('cobro.json se valida, admite BOM y se relee sin reiniciar', async () => {
  const { c } = await registerUser(srv.baseUrl);
  writeConfig('{ esto no es JSON');
  assert.equal((await c.get('/api/payments/config')).status, 404, 'JSON roto: como si no hubiera cobro');
  writeConfig({ metodos: [] });
  assert.equal((await c.get('/api/payments/config')).status, 404, 'sin métodos');
  writeConfig({ metodos: [{ nombre: 'Nequi', detalle: '' }] });
  assert.equal((await c.get('/api/payments/config')).status, 404, 'método sin detalle');

  writeConfig(`﻿${JSON.stringify(CONFIG)}`); // como lo guarda el Bloc de notas
  const r = await c.get('/api/payments/config');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.methods.map((m) => m.name), ['Nequi', 'Transferencia']);
  assert.equal(r.data.contact, 'pagos@test.local');
  assert.deepEqual(r.data.prices, { pro: 1_490_000, contador: 5_990_000 });
  assert.deepEqual(r.data.months, [1, 3, 6, 12]);
  assert.match(r.data.reference, /^CC-[A-HJ-NP-Z2-9]{6}$/, 'sin O, 0, I ni 1');
  assert.equal((await c.get('/api/payments/config')).data.reference, r.data.reference, 'la referencia es fija');
  const other = await registerUser(srv.baseUrl);
  assert.notEqual((await other.c.get('/api/payments/config')).data.reference, r.data.reference);
});

test('avisar un pago: se valida y el valor esperado lo calcula el servidor', async () => {
  writeConfig(CONFIG);
  const { c } = await registerUser(srv.baseUrl);
  const bad = [
    [{ tier: 'oro' }, 'tier'],
    [{ months: 2 }, 'months'],
    [{ months: '3' }, 'months'],
    [{ method: 'Efectivo' }, 'method'],
    [{ paid_on: addDays(today, 1) }, 'paid_on'],
    [{ paid_on: '2026-02-30' }, 'paid_on'],
    [{ amount_cents: 0 }, 'amount_cents'],
    [{ amount_cents: 12.5 }, 'amount_cents'],
    [{ receipt: '' }, 'receipt'],
    [{ receipt: 'x'.repeat(61) }, 'receipt'],
    [{ note: 'x'.repeat(301) }, 'note'],
    [{ confirm: false }, 'confirm'],
    [{ accept_terms: false }, 'accept_terms'],
    [{ accept_privacy: undefined }, 'accept_privacy'],
  ];
  for (const [o, field] of bad) {
    const r = await c.post('/api/payments', notice(o));
    assert.equal(r.status, 400, JSON.stringify(o));
    assert.ok(r.data.error.fields[field], `${JSON.stringify(o)} → ${field}`);
  }
  // El valor esperado no viene del navegador: 6 meses de Contador = 6 × $59.900, aunque diga otra cifra.
  const r = await c.post('/api/payments', notice({ tier: 'contador', months: 6, amount_cents: 100 }));
  assert.equal(r.status, 201);
  assert.equal(r.data.payment.expected_cents, 35_940_000);
  assert.equal(r.data.payment.amount_cents, 100);
  assert.equal(r.data.payment.status, 'pendiente');
  assert.match(r.data.payment.reference, /^CC-/);

  const again = await c.post('/api/payments', notice());
  assert.equal(again.status, 409, 'un solo aviso pendiente');
  assert.equal(again.data.error.code, 'PAYMENT_PENDING');
  assert.equal((await c.get('/api/payments')).data.pending.id, r.data.payment.id);
  assert.equal((await planOf(c)).tier, 'gratis', 'avisar no activa nada');

  // Quien ya es Contador no puede comprar Pro (lo incluye).
  const acc = await registerUser(srv.baseUrl);
  setPlanByAdmin(srv.app.db, acc.user.id, 'contador');
  const pro = await acc.c.post('/api/payments', notice());
  assert.equal(pro.status, 409);
  assert.equal(pro.data.error.code, 'ALREADY_INCLUDED');
});

test('cancelar: solo un aviso propio y pendiente', async () => {
  writeConfig(CONFIG);
  const a = await registerUser(srv.baseUrl);
  const b = await registerUser(srv.baseUrl);
  const id = (await a.c.post('/api/payments', notice())).data.payment.id;
  assert.equal((await b.c.del(`/api/payments/${id}`)).status, 404, 'otro usuario');
  assert.deepEqual((await b.c.get('/api/payments')).data.payments, [], 'no ve los avisos de otro');
  assert.equal((await a.c.del(`/api/payments/${id}`)).status, 204);
  assert.equal((await a.c.get('/api/payments')).data.payments[0].status, 'cancelado');
  assert.equal((await a.c.del(`/api/payments/${id}`)).status, 409, 'ya no está pendiente');
  assert.equal((await a.c.post('/api/payments', notice({ months: 1, amount_cents: 1_490_000 }))).status, 201, 'puede avisar de nuevo');
});

test('npm run pagos: lista, aprueba una sola vez y activa el plan por los meses pagados', async () => {
  writeConfig(CONFIG);
  const { c, creds } = await registerUser(srv.baseUrl);
  const p = (await c.post('/api/payments', notice({ amount_cents: 4_000_000 }))).data.payment;

  let out = cli();
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, new RegExp(`#${p.id}\\s+${p.reference}\\s+${creds.email.replace(/[.]/g, '\\.')}`));
  assert.match(out.stdout, /Pro · 3 meses · \$\s?44\.700/);
  assert.match(out.stdout, /dijo \$\s?40\.000, se esperaba \$\s?44\.700/, 'avisa si el valor no coincide');

  out = cli(`--aprobar=${p.id}`);
  assert.equal(out.status, 0, out.stderr);
  const until = addDays(today, 89); // 90 días contando hoy
  assert.match(out.stdout, new RegExp(`Pago #${p.id} aprobado\\..*Pro, pagado, hasta el ${until.slice(8, 10)}/${until.slice(5, 7)}/${until.slice(0, 4)}`));
  let plan = await planOf(c);
  assert.equal(plan.tier, 'pro');
  assert.equal(plan.source, 'pago');
  assert.equal(plan.until, until);
  assert.equal(plan.daysLeft, 90);
  const paid = (await c.get('/api/payments')).data.payments[0];
  assert.equal(paid.status, 'aprobado');
  assert.equal(paid.plan_until, until);

  out = cli(`--aprobar=${p.id}`);
  assert.equal(out.status, 1, 'aprobar dos veces');
  assert.match(out.stderr, /no está pendiente/);
  assert.equal((await planOf(c)).until, until, 'no suma dos veces');

  assert.doesNotMatch(cli().stdout, new RegExp(`#${p.id} `), 'ya no sale entre los pendientes');
  assert.match(cli('--todos').stdout, new RegExp(`#${p.id} .*\\[aprobado\\]`));

  // Errores del comando.
  for (const args of [['--aprobar=999999'], ['--aprobar=abc'], ['--rechazar=1'], ['--aprobar=1', '--rechazar=1']]) {
    assert.equal(cli(...args).status, 1, args.join(' '));
  }

  // Renovar suma desde la fecha de fin; pasar a Contador empieza hoy.
  const r2 = (await c.post('/api/payments', notice({ months: 1, amount_cents: 1_490_000 }))).data.payment;
  assert.equal(cli(`--aprobar=${r2.id}`).status, 0);
  plan = await planOf(c);
  assert.equal(plan.until, addDays(until, 30), 'renovar no pierde días');
  const r3 = (await c.post('/api/payments', notice({ tier: 'contador', months: 1, amount_cents: 5_990_000 }))).data.payment;
  assert.equal(cli(`--aprobar=${r3.id}`).status, 0);
  plan = await planOf(c);
  assert.equal(plan.tier, 'contador');
  assert.equal(plan.until, addDays(today, 29));
});

test('la prueba gratis + compra suma desde el fin de la prueba; sin fecha de fin se queda igual', async () => {
  writeConfig(CONFIG);
  const t = await registerUser(srv.baseUrl);
  const trial = startTrial(srv.app.db, t.user.id, today);
  const p = (await t.c.post('/api/payments', notice({ months: 1, amount_cents: 1_490_000 }))).data.payment;
  assert.equal(cli(`--aprobar=${p.id}`).status, 0);
  const plan = await planOf(t.c);
  assert.equal(plan.source, 'pago');
  assert.equal(plan.until, addDays(trial.until, 30));
  assert.equal(plan.trialAvailable, false);

  const admin = await registerUser(srv.baseUrl);
  setPlanByAdmin(srv.app.db, admin.user.id, 'pro');
  const q = (await admin.c.post('/api/payments', notice({ months: 1, amount_cents: 1_490_000 }))).data.payment;
  assert.equal(cli(`--aprobar=${q.id}`).status, 0);
  const pa = await planOf(admin.c);
  assert.equal(pa.source, 'administrador');
  assert.equal(pa.until, null, 'sigue sin fecha de fin');
});

test('rechazar guarda el motivo y no cambia el plan; al vencer vuelve a Gratis sin borrar el historial', async () => {
  writeConfig(CONFIG);
  const { c, user } = await registerUser(srv.baseUrl);
  const p = (await c.post('/api/payments', notice())).data.payment;
  assert.equal(cli(`--rechazar=${p.id}`, '--motivo=').status, 1, 'el motivo es obligatorio');
  const out = cli(`--rechazar=${p.id}`, '--motivo=No encontramos el pago con esa referencia');
  assert.equal(out.status, 0, out.stderr);
  const rejected = (await c.get('/api/payments')).data.payments[0];
  assert.equal(rejected.status, 'rechazado');
  assert.equal(rejected.reason, 'No encontramos el pago con esa referencia');
  assert.equal((await planOf(c)).tier, 'gratis');
  assert.equal(cli(`--aprobar=${p.id}`).status, 1, 'un rechazado no se puede aprobar');

  const ok = (await c.post('/api/payments', notice({ months: 1, amount_cents: 1_490_000 }))).data.payment;
  assert.equal(cli(`--aprobar=${ok.id}`).status, 0);
  srv.app.db.prepare("UPDATE plans SET pro_until = '2000-01-01' WHERE user_id = ?").run(user.id);
  assert.equal((await planOf(c)).tier, 'gratis', 'vencido');
  assert.equal((await c.get('/api/payments')).data.payments.length, 2, 'el historial se conserva');
});

test('eliminar la cuenta borra sus avisos y su referencia', async () => {
  writeConfig(CONFIG);
  const { c, user, creds } = await registerUser(srv.baseUrl);
  await c.get('/api/payments/config');
  await c.post('/api/payments', notice());
  const count = (t) => srv.app.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(user.id).n;
  assert.deepEqual([count('payments'), count('payment_refs')], [1, 1]);
  assert.equal((await c.del('/api/account', { password: creds.password })).status, 204);
  assert.deepEqual([count('payments'), count('payment_refs')], [0, 0]);
});
