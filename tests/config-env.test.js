// Configuración desde variables de entorno (despliegue en Railway): responsable.json, cobro.json y correo.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeConfigFromEnv } from '../server/config-env.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cuentaclara-env-'));
const quiet = { error() {} };

test('escribe solo los archivos cuyas variables existen', () => {
  const dir = path.join(tmp(), 'data');
  const written = writeConfigFromEnv(dir, { RESPONSABLE_JSON: '﻿ {"nombre":"Ana"} ', OTRA: 'x' }, quiet);
  assert.deepEqual(written, ['responsable.json']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'responsable.json'), 'utf8')), { nombre: 'Ana' });
  assert.equal(fs.existsSync(path.join(dir, 'cobro.json')), false);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('la variable reemplaza el archivo existente', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'cobro.json'), '{"viejo":true}');
  writeConfigFromEnv(dir, { COBRO_JSON: '{"nuevo":true}' }, quiet);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'cobro.json'), 'utf8')), { nuevo: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('un JSON no válido no se escribe ni borra el archivo anterior', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'correo.json'), '{"ok":1}');
  const errors = [];
  const written = writeConfigFromEnv(dir, { CORREO_JSON: '{roto', COBRO_JSON: '   ' }, { error: (m) => errors.push(m) });
  assert.deepEqual(written, []);
  assert.equal(fs.readFileSync(path.join(dir, 'correo.json'), 'utf8'), '{"ok":1}');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /CORREO_JSON no es un JSON válido/);
  assert.doesNotMatch(errors[0], /roto/, 'no muestra el contenido');
  fs.rmSync(dir, { recursive: true, force: true });
});
