/**
 * Avisos al administrador cuando alguien crea una cuenta o entra a la app (docs/15-avisos.md).
 *
 * Se envían a un tema de ntfy (https://ntfy.sh, gratis): la app «ntfy» del celular los muestra al instante y
 * `npm run avisos` los muestra en Windows. Se configuran en avisos.json, junto a la base de datos:
 *   { "ntfy": "https://ntfy.sh/<tema secreto>", "ignorar": ["tu@correo.com"] }
 * (en Railway, con la variable AVISOS_JSON). Sin ese archivo no se envía nada.
 *
 * Privacidad: el aviso lleva solo el número interno de la cuenta, nunca el nombre, el correo ni la IP. El nombre lo
 * pone tu computador con sus copias de seguridad. Nada de esto se guarda en la base de datos.
 * - Cuenta nueva: siempre.
 * - Entrada (iniciar sesión o abrir la app con la sesión abierta): como mucho un aviso por cuenta cada 3 horas.
 * - Las cuentas de «ignorar» (las tuyas) nunca avisan.
 */
import fs from 'node:fs';

export const ENTRADA_CADA_MS = 3 * 60 * 60 * 1000;
const TOPIC_RE = /^[-_A-Za-z0-9]{1,64}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Lee avisos.json. Devuelve { ntfy: { server, topic } | null, ignorar: Set }.
 * La dirección debe ser https (o http a este mismo computador, para las pruebas) y terminar en el tema.
 */
export function readAvisosConfig(file, logger = console) {
  const off = { ntfy: null, ignorar: new Set() };
  if (!file || !fs.existsSync(file)) return off;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    logger.error?.('[avisos] avisos.json no es un JSON válido: no se envían avisos.');
    return off;
  }
  const ignorar = new Set((Array.isArray(cfg?.ignorar) ? cfg.ignorar : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean));
  let url;
  try {
    url = new URL(String(cfg?.ntfy ?? ''));
  } catch {
    logger.error?.('[avisos] Falta "ntfy" en avisos.json (p. ej. "https://ntfy.sh/mi-tema-secreto"): no se envían avisos.');
    return { ...off, ignorar };
  }
  const topic = url.pathname.replace(/^\/+|\/+$/g, '');
  const httpsOk = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
  if (!httpsOk || !TOPIC_RE.test(topic) || url.search || url.username || url.password) {
    logger.error?.('[avisos] "ntfy" en avisos.json debe ser https://servidor/tema (tema: letras, números, - y _): no se envían avisos.');
    return { ...off, ignorar };
  }
  return { ntfy: { server: url.origin, topic }, ignorar };
}

/**
 * `configPath`: avisos.json. `appUrl`: a dónde lleva tocar el aviso. `fetchImpl`: solo para las pruebas.
 * Los avisos se envían en segundo plano: un fallo de ntfy nunca frena el registro ni la entrada.
 */
export function createAvisos({ db, configPath, appUrl, logger = console, now = () => new Date(), fetchImpl = globalThis.fetch }) {
  const { ntfy, ignorar } = readAvisosConfig(configPath, logger);
  // Última vez que avisamos de cada cuenta (en memoria: un reinicio, como mucho, repite un aviso).
  const ultimo = new Map();
  let enviando = Promise.resolve();

  const ignorada = (user) => !user || ignorar.has(String(user.email ?? '').toLowerCase());

  function push({ title, message, tags }) {
    const body = JSON.stringify({ topic: ntfy.topic, title, message, tags, ...(appUrl ? { click: appUrl } : {}) });
    const p = fetchImpl(`${ntfy.server}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
      .then((res) => {
        // Sin la dirección: el tema es secreto.
        if (!res.ok) logger.error?.(`[avisos] ntfy respondió ${res.status}: el aviso no se envió.`);
      })
      .catch((err) => logger.error?.(`[avisos] No se pudo enviar el aviso (${err.name}).`));
    enviando = enviando.then(() => p);
  }

  return {
    activo: () => Boolean(ntfy),
    /** Espera a que salgan los avisos pendientes (pruebas y cierre del servidor). */
    flush: () => enviando,

    cuentaNueva(user) {
      if (!ntfy || ignorada(user)) return;
      ultimo.set(user.id, now().getTime());
      const total = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
      push({
        title: 'Cuenta nueva en CuentaClara',
        message: `Se registró la cuenta #${user.id}. Ya van ${total} ${total === 1 ? 'cuenta' : 'cuentas'}.`,
        tags: ['tada', `cuenta-${user.id}`],
      });
    },

    /** Inicio de sesión o app abierta con la sesión activa. */
    entrada(user) {
      if (!ntfy || ignorada(user)) return;
      const ms = now().getTime();
      const antes = ultimo.get(user.id);
      if (antes !== undefined && ms - antes < ENTRADA_CADA_MS) return;
      ultimo.set(user.id, ms);
      if (ultimo.size > 10_000) for (const [k, v] of ultimo) if (ms - v >= ENTRADA_CADA_MS) ultimo.delete(k);
      push({
        title: 'Alguien entró a CuentaClara',
        message: `La cuenta #${user.id} entró a la app.`,
        tags: ['wave', `cuenta-${user.id}`],
      });
    },
  };
}
