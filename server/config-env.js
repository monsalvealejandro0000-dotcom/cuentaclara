/**
 * Archivos de configuración desde variables de entorno, para hostings sin acceso directo al disco (Railway, Render…).
 *
 * RESPONSABLE_JSON, COBRO_JSON, CORREO_JSON y AVISOS_JSON: si están definidas, al arrancar se escribe su contenido en
 * responsable.json, cobro.json, correo.json y avisos.json junto a la base de datos. La variable manda sobre el archivo.
 * El contenido nunca se muestra en la ventana negra: lleva datos personales y claves.
 */
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_ENV = {
  RESPONSABLE_JSON: 'responsable.json',
  COBRO_JSON: 'cobro.json',
  CORREO_JSON: 'correo.json',
  AVISOS_JSON: 'avisos.json',
};

/** Escribe en `dir` los archivos cuyas variables existen. Devuelve los nombres escritos. */
export function writeConfigFromEnv(dir, env = process.env, logger = console) {
  const written = [];
  for (const [name, file] of Object.entries(CONFIG_ENV)) {
    const raw = typeof env[name] === 'string' ? env[name].replace(/^﻿/, '').trim() : '';
    if (!raw) continue;
    try {
      JSON.parse(raw);
    } catch {
      // Sin err.message: V8 copia trozos del texto en el mensaje y podría mostrar una clave.
      logger.error?.(`[config] ${name} no es un JSON válido: no se usa.`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), `${raw}\n`, { mode: 0o600 });
    written.push(file);
  }
  return written;
}
