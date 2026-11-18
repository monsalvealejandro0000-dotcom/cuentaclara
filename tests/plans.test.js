// Fase 9: planes Gratis y Pro, informe para el contador y avisos de declaración (docs/09-planes.md).
// El reloj del servidor se controla con `clock` para comprobar fechas (fin de la prueba, ventanas de los avisos).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, registerUser, movement, expense, invoice } from './helpers.js';
import { setPlanByAdmin } from '../server/plans.js';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'plan.js');
const clock = { today: '2026-11-16' };
const at = (d) => {
  clock.today = d;
};

let srv;
before(async () => {
  // Mediodía en Colombia (UTC-5), para que el día no dependa del huso horario de la máquina.
  srv = await startServer({ now: () => new Date(`${clock.today}T12:00:00-05:00`) });
});
after(() => srv.destroy());

/** Usuario con Pro activado por el administrador. */
async function proUser() {
  const u = await registerUser(srv.baseUrl);
  setPlanByAdmin(srv.app.db, u.user.id, 'pro');
  return u;
}

const planOf = async (c) => (await c.get('/api/plan')).data.plan;
const reminders = async (c) => (await c.get('/api/reminders')).data;
const keys = (list) => list.map((d) => d.key);

test('una cuenta nueva es Gratis y puede probar Pro', async () => {
  at('2026-11-16');
  const { c } = await registerUser(srv.baseUrl);
  const p = await planOf(c);
  assert.equal(p.tier, 'gratis');
  assert.equal(p.source, null);
  assert.equal(p.until, null);
  assert.equal(p.trialAvailable, true);
  assert.equal(p.trialEndedOn, null);
  assert.equal(p.today, '2026-11-16');
});

test('Gratis: el servidor bloquea el informe y los avisos (403 PLAN_REQUIRED); lo demás sigue igual', async () => {
  at('2026-11-16');
  const { c } = await registerUser(srv.baseUrl);
  const blocked = [
    ['GET', '/api/report?month=2026-11'],
    ['GET', '/api/report?year=2026'],
    ['GET', '/api/reminders'],
    ['PUT', '/api/reminders', { vat: false }],
    ['PUT', '/api/reminders/renta-2026', { filed: true }],
  ];
  for (const [method, url, body] of blocked) {
    const r = await c.raw(method, url, body);
    assert.equal(r.status, 403, `${method} ${url}`);
    assert.equal(r.data.error.code, 'PLAN_REQUIRED');
  }
  // Las funciones de antes no cambian en Gratis.
  assert.equal((await c.post('/api/movements', movement())).status, 201);
  assert.equal((await c.get('/api/movements?from=2026-11-01&to=2026-11-30')).data.movements.length, 1);
  assert.equal((await c.get('/api/summary?month=2026-11')).status, 200);
  assert.equal((await c.post('/api/invoices', invoice())).status, 201);
  assert.equal((await c.get('/api/events')).status, 200);
  assert.equal((await c.get('/api/analytics?month=2026-11')).status, 200);
});

test('la prueba gratis: 30 días contando el de activación, una sola vez, y termina sola', async () => {
  at('2026-11-16');
  const { c } = await registerUser(srv.baseUrl);
  const r = await c.post('/api/plan/trial');
  assert.equal(r.status, 200);
  assert.equal(r.data.plan.tier, 'pro');
  assert.equal(r.data.plan.source, 'prueba');
  // Del 16/11 al 15/12, ambos incluidos: 30 días.
  assert.equal(r.data.plan.until, '2026-12-15');
  assert.equal(r.data.plan.daysLeft, 30);
  assert.equal(r.data.plan.trialAvailable, false);

  const again = await c.post('/api/plan/trial');
  assert.equal(again.status, 409);
  assert.equal(again.data.error.code, 'ALREADY_PRO');
  assert.equal((await c.get('/api/report?month=2026-11')).status, 200);

  at('2026-12-15'); // último día
  let p = await planOf(c);
  assert.equal(p.tier, 'pro');
  assert.equal(p.daysLeft, 1);
  assert.equal((await c.get('/api/reminders')).status, 200);

  at('2026-12-16'); // vuelve a Gratis sin hacer nada
  p = await planOf(c);
  assert.equal(p.tier, 'gratis');
  assert.equal(p.trialAvailable, false);
  assert.equal(p.trialEndedOn, '2026-12-15');
  assert.equal((await c.get('/api/report?month=2026-11')).status, 403);
  const used = await c.post('/api/plan/trial');
  assert.equal(used.status, 409);
  assert.equal(used.data.error.code, 'TRIAL_USED');
});

test('el administrador activa y quita Pro con npm run plan, sin borrar datos', async () => {
  at('2026-12-20');
  const { c, user, creds } = await registerUser(srv.baseUrl);
  const cli = (...args) => spawnSync(process.execPath, [SCRIPT, `--db=${srv.dbPath}`, ...args], { encoding: 'utf8' });

  let out = cli(`--email=${creds.email}`);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Gratis \(puede probar Pro 30 días\)/);

  out = cli(`--email=${creds.email.toUpperCase()}`, '--plan=pro');
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Pro, activado por el administrador, sin fecha de fin/);
  let p = await planOf(c);
  assert.equal(p.tier, 'pro');
  assert.equal(p.source, 'administrador');
  assert.equal(p.until, null);

  await c.post('/api/movements', movement({ date: '2026-10-05' }));
  assert.equal((await c.put('/api/reminders/iva-2026-cuatrimestral-3', { filed: true })).status, 200);
  assert.equal((await c.put('/api/reminders', { renta: false })).status, 200);

  out = cli(`--email=${creds.email}`, '--plan=gratis');
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Plan cambiado\. .*: Gratis/);
  assert.equal((await planOf(c)).tier, 'gratis');
  assert.equal((await c.get('/api/reminders')).status, 403);
  // Nada se borró: lo marcado y las preferencias siguen guardados…
  const state = srv.app.db.prepare('SELECT filed_on FROM reminder_states WHERE user_id = ? AND decl_key = ?').get(user.id, 'iva-2026-cuatrimestral-3');
  assert.equal(state.filed_on, '2026-12-20');
  // …y vuelven al regresar a Pro (esta vez con fecha de fin).
  out = cli(`--email=${creds.email}`, '--plan=pro', '--hasta=2099-01-31');
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /hasta el 31\/01\/2099/);
  p = await planOf(c);
  assert.equal(p.until, '2099-01-31');
  const r = await reminders(c);
  assert.equal(r.preferences.renta, false);
  assert.equal(r.upcoming.find((d) => d.key === 'iva-2026-cuatrimestral-3').filed, true);

  // Errores del comando: mensaje y código de salida 1.
  for (const args of [
    ['--email=no-existe@test.local', '--plan=pro'],
    [`--email=${creds.email}`, '--plan=oro'],
    [`--email=${creds.email}`, '--plan=pro', '--hasta=2020-01-01'],
    [`--email=${creds.email}`, '--plan=gratis', '--hasta=2099-01-01'],
    ['--plan=pro'],
  ]) {
    const e = cli(...args);
    assert.equal(e.status, 1, args.join(' '));
    assert.match(e.stderr, /ERROR/);
  }
});

test('informe: mismas cifras que el Dashboard, para un mes y para el año', async () => {
  at('2026-11-16');
  const { c, user } = await proUser();
  await c.post('/api/movements', movement({ date: '2026-11-05' }));
  await c.post('/api/movements', expense({ date: '2026-11-10' }));
  await c.post('/api/movements', expense({ date: '2026-11-12', concept: 'Oficina', category: 'Arriendo', base_cents: 50000, vat_rate: 0 }));
  await c.post('/api/movements', movement({ date: '2026-03-02', base_cents: 300000 }));
  const inv = await c.post('/api/invoices', invoice({ issue_date: '2026-11-03' }));
  assert.equal(inv.status, 201);

  const sum = (await c.get('/api/summary?month=2026-11')).data;
  const res = await c.get('/api/report?month=2026-11');
  assert.equal(res.status, 200);
  const r = res.data;
  assert.deepEqual(r.period, { kind: 'month', month: '2026-11', year: 2026, from: '2026-11-01', to: '2026-11-30' });
  for (const k of ['income', 'expenses', 'profit', 'withholdings', 'vatOutput', 'vatInput', 'vatNet']) {
    assert.equal(r.totals[k], sum.monthSummary[k], k);
  }
  assert.deepEqual(r.renta, sum.renta);
  assert.deepEqual(r.vatPeriods, [sum.currentVatPeriod]);
  assert.equal(r.movements.length, 4, '3 movimientos + el ingreso de la factura');
  assert.ok(r.movements.every((m) => m.date.startsWith('2026-11')));
  assert.deepEqual(r.invoices.map((i) => i.number), [inv.data.invoice.number]);
  assert.equal(r.invoices[0].amounts.total, inv.data.invoice.amounts.total);
  assert.equal(r.expenseCategories.reduce((s, x) => s + x.total, 0), r.totals.expenses);
  assert.equal(r.issuer.name, user.name);
  assert.equal(r.generatedOn, '2026-11-16');

  const y = (await c.get('/api/report?year=2026')).data;
  const dec = (await c.get('/api/summary?month=2026-12')).data;
  assert.deepEqual(y.period, { kind: 'year', month: null, year: 2026, from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(y.vatPeriods, dec.vatPeriods);
  assert.deepEqual(y.renta, dec.renta);
  assert.equal(y.totals.income, dec.yearToDate.income);
  assert.equal(y.movements.length, 5);

  assert.equal((await c.get('/api/report')).data.period.month, '2026-11', 'sin periodo: el mes actual');
  for (const q of ['month=2026-13', 'month=noviembre', 'year=26', 'year=1999']) {
    assert.equal((await c.get(`/api/report?${q}`)).status, 400, q);
  }
});

test('avisos: aparecen en su ventana, se marcan como presentados y se deshacen', async () => {
  at('2026-11-16');
  const { c } = await proUser();
  await c.post('/api/movements', movement({ date: '2026-10-05' })); // IVA de sep–dic: 19 % de 1.000,00

  let r = await reminders(c);
  assert.deepEqual(r.preferences, { vat: true, renta: true });
  assert.deepEqual(r.active, []);
  assert.deepEqual(keys(r.upcoming), ['iva-2026-cuatrimestral-3', 'renta-2026']);
  const iva = r.upcoming[0];
  assert.equal(iva.title, 'IVA septiembre–diciembre 2026');
  assert.equal(iva.dueFrom, '2027-01');
  assert.equal(iva.windowFrom, '2026-12-15');
  assert.equal(iva.windowTo, '2027-01-31');
  assert.equal(iva.amount, 19000);

  at('2026-12-14');
  assert.deepEqual((await reminders(c)).active, []);
  at('2026-12-15');
  assert.deepEqual(keys((await reminders(c)).active), ['iva-2026-cuatrimestral-3']);

  r = (await c.put('/api/reminders/iva-2026-cuatrimestral-3', { filed: true })).data;
  assert.deepEqual(r.active, [], '«Ya la presenté» oculta el aviso');
  assert.equal(r.upcoming[0].filed, true);
  assert.equal(r.upcoming[0].filedOn, '2026-12-15');
  r = (await c.put('/api/reminders/iva-2026-cuatrimestral-3', { filed: false })).data;
  assert.deepEqual(keys(r.active), ['iva-2026-cuatrimestral-3'], 'deshacer');

  r = (await c.put('/api/reminders', { vat: false })).data;
  assert.deepEqual(r.preferences, { vat: false, renta: true });
  assert.deepEqual(r.active, []);
  assert.equal(r.upcoming[0].enabled, false);
  r = (await c.put('/api/reminders', { vat: true })).data;
  assert.equal(r.active.length, 1);
  assert.equal((await c.put('/api/reminders', { vat: 'si' })).status, 400);

  at('2027-01-31');
  assert.deepEqual(keys((await reminders(c)).active), ['iva-2026-cuatrimestral-3']);
  at('2027-02-01');
  r = await reminders(c);
  assert.deepEqual(r.active, []);
  assert.ok(!keys(r.upcoming).includes('iva-2026-cuatrimestral-3'), 'pasado el mes ya no aparece');

  // Renta 2026: del 15 de julio al 31 de octubre de 2027, con la estimación del año completo.
  const dec = (await c.get('/api/summary?month=2026-12')).data;
  at('2027-07-14');
  assert.ok(!keys((await reminders(c)).active).includes('renta-2026'));
  at('2027-07-15');
  r = await reminders(c);
  const renta = r.active.find((d) => d.key === 'renta-2026');
  assert.ok(renta);
  assert.equal(renta.amount, dec.renta.balance);
  assert.equal(renta.dueFrom, '2027-08');
  assert.equal(renta.dueTo, '2027-10');
  at('2027-10-31');
  assert.ok(keys((await reminders(c)).active).includes('renta-2026'));
  at('2027-11-01');
  r = await reminders(c);
  assert.ok(!keys(r.active).includes('renta-2026'));
  assert.ok(keys(r.upcoming).includes('renta-2027'), 'la siguiente renta');
});

test('avisos: el día exacto se guarda como evento del calendario', async () => {
  at('2026-12-20');
  const { c } = await proUser();
  await c.post('/api/movements', movement({ date: '2026-10-05' }));

  let r = (await c.put('/api/reminders/iva-2026-cuatrimestral-3', { date: '2027-01-22' })).data;
  assert.equal(r.active[0].exactDate, '2027-01-22');
  assert.equal(r.active[0].daysUntil, 33);
  let events = (await c.get('/api/events?from=2027-01-01&to=2027-01-31')).data.events;
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.title, 'Declarar IVA septiembre–diciembre 2026 (formulario 300)');
  assert.equal(ev.category, 'fiscal');
  assert.equal(ev.all_day, true);

  // Cambiar el día mueve el mismo evento (no crea otro).
  await c.put('/api/reminders/iva-2026-cuatrimestral-3', { date: '2027-01-25' });
  events = (await c.get('/api/events?from=2027-01-01&to=2027-01-31')).data.events;
  assert.deepEqual(events.map((e) => [e.id, e.date]), [[ev.id, '2027-01-25']]);

  // Si lo mueve en el Calendario, el aviso sigue al evento.
  await c.put(`/api/events/${ev.id}`, { title: ev.title, date: '2027-01-27', all_day: true, category: 'fiscal', notes: '' });
  assert.equal((await reminders(c)).active[0].exactDate, '2027-01-27');
  // Si lo borra, el aviso vuelve a mostrar solo el mes.
  assert.equal((await c.del(`/api/events/${ev.id}`)).status, 204);
  r = await reminders(c);
  assert.equal(r.active[0].exactDate, null);
  assert.equal(r.active[0].daysUntil, null);
  // Y se puede volver a anotar (crea un evento nuevo).
  r = (await c.put('/api/reminders/iva-2026-cuatrimestral-3', { date: '2027-01-20' })).data;
  assert.equal(r.active[0].exactDate, '2027-01-20');

  // Validación y declaraciones que no existen.
  const bad = await c.put('/api/reminders/iva-2026-cuatrimestral-3', { date: '2027-02-30' });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.error.fields.date);
  assert.equal((await c.put('/api/reminders/iva-2026-cuatrimestral-3', {})).status, 400);
  assert.equal((await c.put('/api/reminders/iva-2026-cuatrimestral-3', { filed: 'si' })).status, 400);
  for (const key of ['iva-2026-cuatrimestral-9', 'iva-2026-bimestral-1', 'renta-1999', 'cualquier-cosa']) {
    assert.equal((await c.put(`/api/reminders/${key}`, { filed: true })).status, 404, key);
  }

  // Otro usuario no ve ni el evento ni el estado.
  const other = await proUser();
  assert.deepEqual((await other.c.get('/api/events')).data.events, []);
  const o = await reminders(other.c);
  assert.deepEqual(o.active, [], 'sin movimientos no hay IVA que avisar');
  assert.ok(o.upcoming.every((d) => !d.filed && !d.exactDate), 'sin el estado del otro usuario');
});

test('avisos: sin IVA si no es responsable; periodos bimestrales', async () => {
  at('2027-03-01');
  const { c } = await proUser();
  const settings = (o) => ({ business_name: '', nif: '', address: '', default_vat_rate: 19, default_irpf_rate: 10, ...o });

  assert.equal((await c.put('/api/settings', settings({ vat_responsible: false, default_vat_rate: 0 }))).status, 200);
  let r = await reminders(c);
  assert.equal(r.vatResponsible, false);
  assert.ok([...r.active, ...r.upcoming].every((d) => d.kind === 'renta'));

  assert.equal((await c.put('/api/settings', settings({ vat_responsible: true, vat_period: 'bimestral' }))).status, 200);
  r = await reminders(c);
  assert.deepEqual(r.active, [], 'sin ingresos ni IVA descontable en ene–feb no hay nada que declarar');
  assert.equal(r.upcoming.find((d) => d.key === 'iva-2027-bimestral-1').hasOperations, false);

  await c.post('/api/movements', movement({ date: '2027-02-10', vat_rate: 0 })); // ingreso exento: sí es una operación
  r = await reminders(c);
  assert.deepEqual(keys(r.active), ['iva-2027-bimestral-1'], 'ene–feb se declara en marzo');
  assert.equal(r.active[0].title, 'IVA enero–febrero 2027');
  assert.equal(r.active[0].amount, 0);
});

test('eliminar la cuenta borra también el plan y los avisos', async () => {
  at('2026-12-20');
  const { c, user, creds } = await proUser();
  await c.put('/api/reminders', { renta: false });
  await c.put('/api/reminders/renta-2026', { date: '2027-08-20' });
  const count = (table) => srv.app.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(user.id).n;
  assert.deepEqual([count('plans'), count('reminder_settings'), count('reminder_states'), count('events')], [1, 1, 1, 1]);
  assert.equal((await c.del('/api/account', { password: creds.password })).status, 204);
  assert.deepEqual([count('plans'), count('reminder_settings'), count('reminder_states'), count('events')], [0, 0, 0, 0]);
});
