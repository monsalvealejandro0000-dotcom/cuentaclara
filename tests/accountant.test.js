// Fase 10: plan Contador. Invitaciones del cliente, panel del contador y lectura en SOLO LECTURA (docs/10-plan-contador.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, registerUser, movement, expense, invoice } from './helpers.js';
import { setPlanByAdmin } from '../server/plans.js';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'plan.js');
let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.destroy());

async function contador() {
  const u = await registerUser(srv.baseUrl, { name: 'Ana Contadora' });
  setPlanByAdmin(srv.app.db, u.user.id, 'contador');
  return u;
}
/** Cliente que invita al contador y el contador acepta. Devuelve el id del vínculo. */
async function link(client, acc) {
  assert.equal((await client.c.post('/api/accountant', { email: acc.creds.email, authorize: true })).status, 200);
  const inv = (await acc.c.get('/api/clients')).data.invitations.find((i) => i.email === client.creds.email);
  assert.ok(inv, 'el contador ve la invitación');
  assert.equal((await acc.c.post(`/api/clients/invitations/${inv.id}/accept`)).status, 204);
  return inv.id;
}

test('el plan Contador lo activa el administrador e incluye Pro', async () => {
  const acc = await registerUser(srv.baseUrl);
  const out = spawnSync(process.execPath, [SCRIPT, `--db=${srv.dbPath}`, `--email=${acc.creds.email}`, '--plan=contador'], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Contador, activado por el administrador, sin fecha de fin/);
  const plan = (await acc.c.get('/api/plan')).data.plan;
  assert.equal(plan.tier, 'contador');
  assert.equal(plan.trialAvailable, false);
  assert.equal((await acc.c.get('/api/report?month=2026-11')).status, 200, 'incluye el informe de Pro');
  assert.equal((await acc.c.get('/api/reminders')).status, 200, 'incluye los avisos de Pro');
  assert.equal((await acc.c.post('/api/plan/trial')).data.error.code, 'ALREADY_PRO');
  assert.equal((await acc.c.get('/api/clients')).status, 200);
  // Pro no es Contador.
  const pro = await registerUser(srv.baseUrl);
  setPlanByAdmin(srv.app.db, pro.user.id, 'pro');
  const r = await pro.c.get('/api/clients');
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'PLAN_REQUIRED');
});

test('invitar: valida, no revela si el correo tiene cuenta, no a uno mismo y máximo 10 al día', async () => {
  const client = await registerUser(srv.baseUrl);
  const acc = await contador();

  let r = await client.c.post('/api/accountant', { email: acc.creds.email });
  assert.equal(r.status, 400);
  assert.ok(r.data.error.fields.authorize, 'la autorización es obligatoria');
  r = await client.c.post('/api/accountant', { email: 'no-es-correo', authorize: true });
  assert.ok(r.data.error.fields.email);
  r = await client.c.post('/api/accountant', { email: client.creds.email.toUpperCase(), authorize: true });
  assert.equal(r.status, 400);
  assert.match(r.data.error.fields.email, /ti mismo/);

  // Misma respuesta exista o no la cuenta.
  const withAccount = await client.c.post('/api/accountant', { email: acc.creds.email, authorize: true });
  await client.c.del('/api/accountant');
  const without = await client.c.post('/api/accountant', { email: 'nadie-12345@test.local', authorize: true });
  assert.equal(withAccount.status, without.status);
  const shape = (l) => ({ ...l, email: 'x', invitedAt: 'x' });
  assert.deepEqual(shape(withAccount.data.link), shape(without.data.link));
  assert.deepEqual(shape(without.data.link), { email: 'x', status: 'pendiente', name: null, invitedAt: 'x', acceptedAt: null, lastAccessAt: null, accountantActive: null });

  r = await client.c.post('/api/accountant', { email: acc.creds.email, authorize: true });
  assert.equal(r.status, 409, 'una invitación a la vez');
  assert.equal((await client.c.del('/api/accountant')).status, 204);
  assert.equal((await client.c.get('/api/accountant')).data.link, null);

  // Límite diario: ya lleva 2 hoy; 8 más llegan a 10 y la 11.ª se rechaza.
  for (let i = 0; i < 8; i++) {
    assert.equal((await client.c.post('/api/accountant', { email: `c${i}@test.local`, authorize: true })).status, 200);
    await client.c.del('/api/accountant');
  }
  r = await client.c.post('/api/accountant', { email: 'otro@test.local', authorize: true });
  assert.equal(r.status, 429);
  assert.equal(r.data.error.code, 'TOO_MANY_INVITES');
});

test('el contador acepta y ve lo mismo que el cliente, en solo lectura', async () => {
  const client = await registerUser(srv.baseUrl, { name: 'Pedro Cliente' });
  const acc = await contador();
  await client.c.put('/api/settings', { business_name: 'Estudio Pérez', nif: '1020304050-1', address: '', default_vat_rate: 19, default_irpf_rate: 10 });
  await client.c.post('/api/movements', movement({ date: '2026-11-05' }));
  await client.c.post('/api/movements', expense({ date: '2026-11-10' }));
  const inv = (await client.c.post('/api/invoices', invoice({ issue_date: '2026-11-03' }))).data.invoice;

  // Antes de aceptar: pendiente, sin nombre del contador ni acceso.
  await client.c.post('/api/accountant', { email: acc.creds.email, authorize: true });
  const pending = (await acc.c.get('/api/clients')).data;
  const invitation = pending.invitations.find((i) => i.email === client.creds.email);
  assert.equal(invitation.name, 'Estudio Pérez');
  assert.equal((await acc.c.get(`/api/clients/${invitation.id}/summary`)).status, 404, 'pendiente: no ve nada');

  assert.equal((await acc.c.post(`/api/clients/invitations/${invitation.id}/accept`)).status, 204);
  const id = invitation.id;
  const mine = (await client.c.get('/api/accountant')).data.link;
  assert.equal(mine.status, 'activo');
  assert.equal(mine.name, 'Ana Contadora');
  assert.equal(mine.accountantActive, true);
  assert.equal(mine.lastAccessAt, null);

  const list = (await acc.c.get('/api/clients')).data;
  const row = list.clients.find((c) => c.id === id);
  assert.equal(row.name, 'Estudio Pérez');
  assert.equal(row.nif, '1020304050-1');
  assert.equal(typeof row.reserve, 'number');

  // Mismos datos que el cliente ve en su app.
  for (const [own, viaAcc] of [
    ['/api/summary?month=2026-11', `/api/clients/${id}/summary?month=2026-11`],
    ['/api/analytics?month=2026-11', `/api/clients/${id}/analytics?month=2026-11`],
    ['/api/movements?from=2026-11-01&to=2026-11-30', `/api/clients/${id}/movements?from=2026-11-01&to=2026-11-30`],
    ['/api/invoices?year=2026', `/api/clients/${id}/invoices?year=2026`],
    [`/api/invoices/${inv.id}`, `/api/clients/${id}/invoices/${inv.id}`],
  ]) {
    const a = await client.c.get(own);
    const b = await acc.c.get(viaAcc);
    assert.equal(b.status, 200, viaAcc);
    assert.deepEqual(b.data, a.data, viaAcc);
  }
  // Informe y declaraciones del cliente aunque él esté en Gratis (los paga el plan Contador).
  assert.equal((await client.c.get('/api/report?month=2026-11')).status, 403);
  const rep = await acc.c.get(`/api/clients/${id}/report?month=2026-11`);
  assert.equal(rep.status, 200);
  const sum = (await client.c.get('/api/summary?month=2026-11')).data;
  assert.equal(rep.data.totals.income, sum.monthSummary.income);
  assert.deepEqual(rep.data.renta, sum.renta);
  assert.equal(rep.data.issuer.name, 'Estudio Pérez');
  assert.equal((await acc.c.get(`/api/clients/${id}/reminders`)).status, 200);

  const profile = (await acc.c.get(`/api/clients/${id}`)).data.client;
  assert.equal(profile.email, client.creds.email);
  assert.equal(profile.nif, '1020304050-1');
  assert.ok(!('title' in profile), 'no expone la configuración del cliente');
  assert.equal((await acc.c.get(`/api/clients/${id}/events`)).status, 404, 'no ve el calendario');
  assert.equal((await acc.c.get(`/api/clients/${id}/settings`)).status, 404, 'no ve la configuración');

  // El cliente ve el último acceso.
  assert.ok((await client.c.get('/api/accountant')).data.link.lastAccessAt);
});

test('solo lectura: cualquier escritura sobre un cliente responde 405 y no cambia nada', async () => {
  const client = await registerUser(srv.baseUrl);
  const acc = await contador();
  await client.c.post('/api/movements', movement());
  const inv = (await client.c.post('/api/invoices', invoice())).data.invoice;
  const id = await link(client, acc);
  const before = (await client.c.get('/api/movements')).data;

  for (const [method, url, body] of [
    ['POST', `/api/clients/${id}/movements`, movement()],
    ['PUT', `/api/clients/${id}/movements`, movement()],
    ['DELETE', `/api/clients/${id}/movements`],
    ['POST', `/api/clients/${id}/invoices`, invoice()],
    ['PUT', `/api/clients/${id}/invoices/${inv.id}`, invoice()],
    ['DELETE', `/api/clients/${id}/invoices/${inv.id}`],
    ['PUT', `/api/clients/${id}/summary`, {}],
    ['POST', `/api/clients/${id}/report`, {}],
    ['PUT', `/api/clients/${id}/reminders`, { vat: false }],
    ['PUT', `/api/clients/${id}`, {}],
  ]) {
    assert.equal((await acc.c.raw(method, url, body)).status, 405, `${method} ${url}`);
  }
  assert.deepEqual((await client.c.get('/api/movements')).data, before, 'los datos del cliente no cambiaron');
  assert.equal((await client.c.get(`/api/invoices/${inv.id}`)).data.invoice.number, inv.number);
  // Lo que el contador escribe en su propia app va a sus libros, no a los del cliente.
  assert.equal((await acc.c.post('/api/movements', movement())).status, 201);
  assert.equal((await client.c.get('/api/movements')).data.movements.length, before.movements.length);
});

test('sin vínculo activo o sin plan, el contador no ve nada', async () => {
  const client = await registerUser(srv.baseUrl);
  const acc = await contador();
  const other = await contador();
  const id = await link(client, acc);
  const url = `/api/clients/${id}/summary?month=2026-11`;
  assert.equal((await acc.c.get(url)).status, 200);

  assert.equal((await other.c.get(url)).status, 404, 'otro contador');
  assert.equal((await other.c.get(`/api/clients/${id}`)).status, 404);
  assert.equal((await other.c.del(`/api/clients/${id}`)).status, 404);
  assert.equal((await client.c.get(url)).status, 403, 'un cliente no tiene panel de clientes');

  // Plan vencido: 403, el vínculo se conserva y vuelve a funcionar.
  setPlanByAdmin(srv.app.db, acc.user.id, 'contador', '2000-01-01');
  let r = await acc.c.get(url);
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'PLAN_REQUIRED');
  assert.equal((await client.c.get('/api/accountant')).data.link.accountantActive, false, 'el cliente ve que su contador no tiene el plan');
  setPlanByAdmin(srv.app.db, acc.user.id, 'contador');
  assert.equal((await acc.c.get(url)).status, 200);

  // El cliente quita el acceso: efecto inmediato.
  assert.equal((await client.c.del('/api/accountant')).status, 204);
  r = await acc.c.get(url);
  assert.equal(r.status, 404);
  assert.match(r.data.error.message, /ya no te da acceso/);
  assert.ok(!(await acc.c.get('/api/clients')).data.clients.some((c) => c.id === id));
});

test('rechazar una invitación y dejar de atender a un cliente', async () => {
  const client = await registerUser(srv.baseUrl);
  const acc = await contador();
  await client.c.post('/api/accountant', { email: acc.creds.email, authorize: true });
  let inv = (await acc.c.get('/api/clients')).data.invitations.find((i) => i.email === client.creds.email);
  assert.equal((await acc.c.post(`/api/clients/invitations/${inv.id}/reject`)).status, 204);
  assert.equal((await client.c.get('/api/accountant')).data.link.status, 'rechazado');
  assert.equal((await acc.c.post(`/api/clients/invitations/${inv.id}/accept`)).status, 404, 'ya no está pendiente');
  assert.equal((await acc.c.get(`/api/clients/${inv.id}/summary`)).status, 404);

  // Tras un rechazo puede invitar de nuevo.
  const id = await link(client, acc);
  assert.equal((await acc.c.del(`/api/clients/${id}`)).status, 204);
  assert.equal((await client.c.get('/api/accountant')).data.link, null, 'el cliente queda sin contador');
  assert.equal((await acc.c.get(`/api/clients/${id}/summary`)).status, 404);

  // Una invitación dirigida a otro correo no se puede aceptar.
  const stranger = await contador();
  await client.c.post('/api/accountant', { email: acc.creds.email, authorize: true });
  inv = (await acc.c.get('/api/clients')).data.invitations.find((i) => i.email === client.creds.email);
  assert.equal((await stranger.c.post(`/api/clients/invitations/${inv.id}/accept`)).status, 404);
  assert.ok(!(await stranger.c.get('/api/clients')).data.invitations.some((i) => i.id === inv.id));
});

test('«Último acceso» solo cuenta lecturas que salen bien; la reserva va con la moneda del cliente', async () => {
  const client = await registerUser(srv.baseUrl);
  const acc = await contador();
  const s = (await client.c.get('/api/settings')).data.settings;
  await client.c.put('/api/settings', { ...s, currency: 'USD' });
  const id = await link(client, acc);

  assert.equal((await acc.c.get(`/api/clients/${id}/summary?month=no-es-mes`)).status, 400);
  assert.equal((await acc.c.get(`/api/clients/${id}/report?year=26`)).status, 400);
  assert.equal((await client.c.get('/api/accountant')).data.link.lastAccessAt, null, 'una lectura fallida no cuenta como acceso');
  assert.equal((await acc.c.get(`/api/clients/${id}/summary?month=2026-11`)).status, 200);
  assert.ok((await client.c.get('/api/accountant')).data.link.lastAccessAt);

  const row = (await acc.c.get('/api/clients')).data.clients.find((c) => c.id === id);
  assert.equal(row.currency, 'USD');
});

test('el registro del límite diario de invitaciones no crece sin fin', async () => {
  const client = await registerUser(srv.baseUrl);
  const db = srv.app.db;
  db.prepare("INSERT INTO accountant_invites (user_id, invited_on) VALUES (?, '2000-01-01')").run(client.user.id);
  assert.equal((await client.c.post('/api/accountant', { email: 'alguien@test.local', authorize: true })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM accountant_invites WHERE invited_on < '2001-01-01'").get().n, 0, 'las de días anteriores se borran');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accountant_invites WHERE user_id = ?').get(client.user.id).n, 1);
});

test('eliminar la cuenta del cliente o del contador borra el vínculo', async () => {
  const count = () => srv.app.db.prepare('SELECT COUNT(*) AS n FROM accountant_links').get().n;
  const c1 = await registerUser(srv.baseUrl);
  const acc1 = await contador();
  await link(c1, acc1);
  let n = count();
  assert.equal((await c1.c.del('/api/account', { password: c1.creds.password })).status, 204);
  assert.equal(count(), n - 1, 'se fue el cliente');

  const c2 = await registerUser(srv.baseUrl);
  const acc2 = await contador();
  await link(c2, acc2);
  n = count();
  assert.equal((await acc2.c.del('/api/account', { password: acc2.creds.password })).status, 204);
  assert.equal(count(), n - 1, 'se fue el contador');
  assert.equal((await c2.c.get('/api/accountant')).data.link, null);
});
