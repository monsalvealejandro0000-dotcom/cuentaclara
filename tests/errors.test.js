// Fase 5: errores. Peticiones mal formadas, rutas inexistentes, ficheros estáticos y fallos del servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, registerUser, client } from './helpers.js';
import { inlineStyleHashes } from '../server/app.js';

let srv;
let c;
before(async () => {
  srv = await startServer();
  ({ c } = await registerUser(srv.baseUrl));
});
after(() => srv.destroy());

test('JSON mal formado → 400', async () => {
  const r = await c.raw('POST', '/api/movements', '{"type": "ingreso",');
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'INVALID_JSON');
});

test('JSON que no es un objeto → 400', async () => {
  for (const body of ['[]', 'null', '42', '"texto"']) {
    const r = await c.raw('POST', '/api/movements', body);
    assert.equal(r.status, 400, body);
  }
});

test('tipo de contenido incorrecto → 415', async () => {
  const r = await c.raw('POST', '/api/movements', 'type=ingreso', { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(r.status, 415);
});

test('cuerpo demasiado grande → 413', async () => {
  const r = await c.post('/api/movements', { concept: 'x'.repeat(200 * 1024) });
  assert.equal(r.status, 413);
  assert.equal(r.data.error.code, 'PAYLOAD_TOO_LARGE');
});

test('ruta de API inexistente → 404 JSON; método no permitido → 405', async () => {
  const nf = await c.get('/api/no-existe');
  assert.equal(nf.status, 404);
  assert.equal(nf.data.error.code, 'NOT_FOUND');
  const na = await c.raw('PATCH', '/api/movements', {});
  assert.equal(na.status, 405);
});

test('mes no válido en el resumen → 400', async () => {
  for (const m of ['2026-13', 'noviembre', '2026-1', '1999-12']) {
    assert.equal((await c.get(`/api/summary?month=${m}`)).status, 400, m);
  }
});

test('ficheros estáticos: sin acceso fuera de /public', async () => {
  for (const p of ['/../server/app.js', '/%2e%2e/server/app.js', '/%2e%2e%2fpackage.json', '/..%5cserver%5capp.js', '/css/../../data/app.db']) {
    const res = await fetch(srv.baseUrl + p);
    const text = await res.text();
    assert.ok(!text.includes('createApp'), `filtró código con ${p}`);
    assert.ok(!text.includes('"scripts"'), `filtró package.json con ${p}`);
    assert.ok([200, 400, 404].includes(res.status), `${p} → ${res.status}`);
    if (res.status === 200) assert.match(text, /<!doctype html>/i, `${p} solo puede devolver la SPA`);
  }
  assert.equal((await fetch(`${srv.baseUrl}/js/no-existe.js`)).status, 404);
  const spa = await fetch(`${srv.baseUrl}/cualquier-ruta`);
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /<div id="app">/);
});

test('cabeceras de seguridad en páginas y API', async () => {
  for (const url of ['/', '/api/meta']) {
    const res = await fetch(srv.baseUrl + url);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/, url);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', url);
  }
  assert.equal((await fetch(`${srv.baseUrl}/api/meta`)).headers.get('cache-control'), 'no-store');
});

test('index.html: el aviso para quien lo abre sin servidor solo se permite por su huella en la CSP', async () => {
  const res = await fetch(`${srv.baseUrl}/`);
  const html = await res.text();
  assert.match(html, /<div id="app"><div class="cc-sin-servidor">/, 'el aviso va dentro de #app (React lo sustituye)');
  assert.match(html, /Abrir CuentaClara/);
  const styles = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  assert.equal(styles.length, 1, 'un único <style> en línea');
  assert.match(styles[0], /^\s*\.cc-sin-servidor\{/, 'la huella se calcula sobre el contenido real del <style>');
  // Lo mismo que hace el navegador: el contenido entre la etiqueta de apertura del elemento y su cierre.
  const start = html.indexOf('>', html.search(/<style\b(?![^<]*-->)/i)) + 1;
  assert.equal(html.slice(start, html.indexOf('</style>', start)), styles[0]);
  // Como el navegador: sobre el texto del <style> con los saltos de línea normalizados a LF.
  const hash = crypto.createHash('sha256').update(styles[0].replace(/\r\n?/g, '\n'), 'utf8').digest('base64');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /style-src 'self' 'sha256-[A-Za-z0-9+/=]+';/);
  assert.ok(csp.includes(`'sha256-${hash}'`), 'la huella coincide con el <style> servido');
  assert.ok(!csp.includes('unsafe-inline'), 'sin unsafe-inline');
  assert.match(csp, /script-src 'self';/);
  assert.equal(res.headers.get('content-length'), String(Buffer.byteLength(html)));
  // La API y los ficheros que no son HTML no permiten estilos en línea.
  assert.match((await fetch(`${srv.baseUrl}/api/meta`)).headers.get('content-security-policy'), /style-src 'self';/);
  assert.match((await fetch(`${srv.baseUrl}/favicon.svg`)).headers.get('content-security-policy'), /style-src 'self';/);
  // HEAD: mismas cabeceras, sin cuerpo.
  const head = await fetch(`${srv.baseUrl}/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(head.headers.get('content-security-policy').includes(`'sha256-${hash}'`));
  assert.equal(await head.text(), '');
});

test('la huella CSP de un <style> no depende de los saltos de línea CRLF', () => {
  const lf = inlineStyleHashes('<style>\na{b:c}\n</style>');
  assert.deepEqual(inlineStyleHashes('<style>\r\na{b:c}\r\n</style>'), lf);
  assert.deepEqual(lf, [crypto.createHash('sha256').update('\na{b:c}\n').digest('base64')]);
  assert.deepEqual(inlineStyleHashes('<p>sin estilos</p>'), []);
  // Un "<style>" dentro de un comentario no es un elemento: no debe desplazar la huella.
  assert.deepEqual(inlineStyleHashes('<!-- usa <style> --><style>\na{b:c}\n</style>'), lf);
});

test('el contenido del usuario se guarda tal cual (el escapado se hace al pintar)', async () => {
  const xss = '<img src=x onerror=alert(1)>';
  const r = await c.post('/api/movements', {
    type: 'gasto', date: '2026-11-01', concept: xss, category: 'Otros gastos', base_cents: 100, vat_rate: 0,
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.movement.concept, xss);
  assert.match(r.headers.get('content-type'), /application\/json/);
});

test('un fallo interno responde 500 sin filtrar detalles', async () => {
  const s = await startServer();
  const { c: u } = await registerUser(s.baseUrl);
  s.app.db.exec('DROP TABLE movements'); // simula una base de datos dañada
  const r = await u.get('/api/movements');
  assert.equal(r.status, 500);
  assert.equal(r.data.error.code, 'INTERNAL');
  assert.ok(!JSON.stringify(r.data).includes('movements'), 'no expone SQL ni nombres de tabla');
  assert.ok(!JSON.stringify(r.data).includes('at '), 'no expone la traza');
  await s.destroy();
});

test('el servidor sigue respondiendo después de errores', async () => {
  await c.raw('POST', '/api/movements', '{roto');
  await c.post('/api/movements', { concept: 'x'.repeat(200 * 1024) });
  assert.equal((await c.get('/api/auth/me')).status, 200);
  assert.equal((await client(srv.baseUrl).get('/api/meta')).status, 200);
});
