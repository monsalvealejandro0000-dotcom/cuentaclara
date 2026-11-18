// Ajustes de la revisión final: «hoy» en hora de Colombia y HSTS detrás de HTTPS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { todayLocal, currentMonth, APP_TIMEZONE } from '../server/calc.js';
import { createApp } from '../server/app.js';
import { startServer } from './helpers.js';

test('«hoy» es el día en Colombia aunque el servidor esté en otro huso horario', () => {
  assert.equal(APP_TIMEZONE, process.env.APP_TIMEZONE?.trim() || 'America/Bogota');
  if (APP_TIMEZONE !== 'America/Bogota') return; // si alguien fijó otra zona, estas fechas no aplican
  // 16/11 a las 10 p. m. en Bogotá = 17/11 a las 03:00 UTC: sigue siendo 16 en Colombia.
  assert.equal(todayLocal(new Date('2026-11-17T03:00:00Z')), '2026-11-16');
  assert.equal(todayLocal(new Date('2026-11-17T04:59:59Z')), '2026-11-16');
  assert.equal(todayLocal(new Date('2026-11-17T05:00:00Z')), '2026-11-17');
  assert.equal(currentMonth(new Date('2026-12-01T02:00:00Z')), '2026-11', 'el cambio de mes también');
  assert.equal(todayLocal(new Date('2027-01-01T04:00:00Z')), '2026-12-31', 'y el de año');
});

test('HSTS solo cuando la app corre detrás de HTTPS (COOKIE_SECURE=1)', async () => {
  const plain = await startServer();
  try {
    assert.equal((await fetch(`${plain.baseUrl}/api/meta`)).headers.get('strict-transport-security'), null);
  } finally {
    await plain.destroy();
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-test-'));
  const app = createApp({ dbPath: path.join(dir, 'test.db'), secureCookies: true, logger: { error() {} } });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${app.server.address().port}`;
    for (const url of ['/', '/api/meta']) {
      assert.equal((await fetch(base + url)).headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', url);
    }
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
