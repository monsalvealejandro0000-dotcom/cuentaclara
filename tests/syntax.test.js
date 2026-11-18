// Todos los .js del servidor y de los scripts deben compilar. Las demás pruebas usan createApp
// y no cargan server/index.js: un error de sintaxis ahí solo se veía al arrancar la app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['server', 'server/routes', 'scripts'].flatMap((dir) =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(dir, f)),
);

test('el servidor y los scripts no tienen errores de sintaxis', () => {
  assert.ok(files.includes(path.join('server', 'index.js')));
  for (const file of files) {
    const out = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
    assert.equal(out.status, 0, `${file}: ${out.stderr}`);
  }
});
