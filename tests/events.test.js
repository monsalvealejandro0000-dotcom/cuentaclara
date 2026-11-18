// Fase 4: calendario. Crear, editar y eliminar eventos contra el servidor y la BD reales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, registerUser, client } from './helpers.js';

let srv;
let c;
before(async () => {
  srv = await startServer();
  ({ c } = await registerUser(srv.baseUrl));
});
after(() => srv.destroy());

const ev = (o = {}) => ({
  title: 'Reunión con cliente',
  date: '2026-11-12',
  all_day: false,
  start_time: '10:00',
  end_time: '11:30',
  category: 'reunion',
  notes: '',
  ...o,
});

test('CRUD de eventos', async (t) => {
  let id;
  await t.test('crear', async () => {
    const r = await c.post('/api/events', ev());
    assert.equal(r.status, 201);
    id = r.data.event.id;
    assert.equal(r.data.event.title, 'Reunión con cliente');
    assert.equal(r.data.event.all_day, false);
    assert.equal(r.data.event.start_time, '10:00');
    assert.equal(r.data.event.end_time, '11:30');
  });
  await t.test('leer y listar por rango', async () => {
    assert.equal((await c.get(`/api/events/${id}`)).data.event.id, id);
    const inRange = await c.get('/api/events?from=2026-11-01&to=2026-11-30');
    assert.deepEqual(inRange.data.events.map((e) => e.id), [id]);
    const outRange = await c.get('/api/events?from=2026-12-01&to=2026-12-31');
    assert.deepEqual(outRange.data.events, []);
  });
  await t.test('editar (incluye pasar a todo el día)', async () => {
    const r = await c.put(`/api/events/${id}`, ev({ title: 'Declarar IVA (formulario 300)', category: 'fiscal', all_day: true, date: '2026-11-20' }));
    assert.equal(r.status, 200);
    assert.equal(r.data.event.title, 'Declarar IVA (formulario 300)');
    assert.equal(r.data.event.all_day, true);
    assert.equal(r.data.event.start_time, null); // las horas se descartan
    assert.equal(r.data.event.end_time, null);
    assert.equal((await c.get(`/api/events/${id}`)).data.event.date, '2026-11-20');
  });
  await t.test('eliminar', async () => {
    assert.equal((await c.del(`/api/events/${id}`)).status, 204);
    assert.equal((await c.get(`/api/events/${id}`)).status, 404);
    assert.equal((await c.del(`/api/events/${id}`)).status, 404);
    assert.equal((await c.put(`/api/events/${id}`, ev())).status, 404);
  });
});

test('orden: por fecha, primero los de todo el día y luego por hora', async () => {
  await c.post('/api/events', ev({ title: 'C', date: '2026-10-05', start_time: '16:00', end_time: null }));
  await c.post('/api/events', ev({ title: 'B', date: '2026-10-05', start_time: '09:00', end_time: null }));
  await c.post('/api/events', ev({ title: 'A', date: '2026-10-05', all_day: true }));
  await c.post('/api/events', ev({ title: 'Z', date: '2026-10-01', start_time: '23:00', end_time: null }));
  const r = await c.get('/api/events?from=2026-10-01&to=2026-10-31');
  assert.deepEqual(r.data.events.map((e) => e.title), ['Z', 'A', 'B', 'C']);
});

test('validación de eventos', async () => {
  const cases = [
    [{}, ['title', 'date', 'start_time']],
    [ev({ title: '  ' }), ['title']],
    [ev({ title: 'x'.repeat(121) }), ['title']],
    [ev({ date: '2026-02-30' }), ['date']],
    [ev({ start_time: '25:00' }), ['start_time']],
    [ev({ start_time: '' }), ['start_time']],
    [ev({ end_time: '09:00' }), ['end_time']], // antes del inicio
    [ev({ end_time: '10:00' }), ['end_time']], // igual al inicio
    [ev({ category: 'fiesta' }), ['category']],
    [ev({ all_day: 'sí' }), ['all_day']],
    [ev({ notes: 'x'.repeat(1001) }), ['notes']],
  ];
  for (const [body, fields] of cases) {
    const r = await c.post('/api/events', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    for (const f of fields) assert.ok(r.data.error.fields[f], `falta error en ${f} para ${JSON.stringify(body)}`);
  }
  assert.equal((await c.get('/api/events?from=no-es-fecha')).status, 400);
});

test('permisos: sin sesión 401 y eventos de otro usuario 404', async () => {
  const mine = (await c.post('/api/events', ev({ title: 'Privado' }))).data.event;
  const anon = client(srv.baseUrl);
  assert.equal((await anon.get('/api/events')).status, 401);
  assert.equal((await anon.post('/api/events', ev())).status, 401);
  const { c: other } = await registerUser(srv.baseUrl);
  assert.equal((await other.get(`/api/events/${mine.id}`)).status, 404);
  assert.equal((await other.put(`/api/events/${mine.id}`, ev({ title: 'Hackeado' }))).status, 404);
  assert.equal((await other.del(`/api/events/${mine.id}`)).status, 404);
  assert.deepEqual((await other.get('/api/events')).data.events, []);
  assert.equal((await c.get(`/api/events/${mine.id}`)).data.event.title, 'Privado');
});

test('los eventos persisten tras reiniciar el servidor', async () => {
  const s1 = await startServer();
  const { c: u } = await registerUser(s1.baseUrl);
  const created = (await u.post('/api/events', ev({ title: 'Persistente' }))).data.event;
  const cookie = u.cookie;
  await s1.stop();
  const s2 = await startServer({ dir: s1.tmpDir });
  try {
    const again = client(s2.baseUrl);
    again.cookie = cookie;
    const r = await again.get(`/api/events/${created.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.event.title, 'Persistente');
  } finally {
    await s2.destroy();
  }
});

test('al eliminar la cuenta se eliminan sus eventos', async () => {
  const { c: u, creds } = await registerUser(srv.baseUrl);
  await u.post('/api/events', ev());
  assert.equal((await u.del('/api/account', { password: creds.password })).status, 204);
  const count = srv.app.db.prepare('SELECT COUNT(*) AS n FROM events WHERE user_id NOT IN (SELECT id FROM users)').get().n;
  assert.equal(count, 0);
});
