/**
 * Correos de la app (fase 13, docs/13-correo-y-segundo-factor.md).
 *
 * - Se envían con la API de Brevo (HTTPS), configurada en data/correo.json (plantilla: docs/correo.ejemplo.json).
 *   El archivo se vuelve a leer cuando cambia: no hace falta reiniciar.
 * - Sin ese archivo (o con un archivo no válido) la app está en «modo local»: no envía nada y muestra en la
 *   ventana negra el destinatario, el asunto y el enlace, para probar en tu computador.
 * - Los enlaces se arman con `url_app` (o la dirección local), NUNCA con la cabecera Host de la petición:
 *   si no, un atacante podría hacer que el enlace de recuperación apunte a su web.
 * - Enviar nunca hace fallar la petición: si Brevo no responde, se anota el error en la ventana negra.
 */
import fs from 'node:fs';
import { APP_TIMEZONE } from './calc.js';

export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comprueba el contenido de correo.json. Lanza un Error con el motivo si no es válido. */
export function validateMailConfig(raw, env = process.env) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('debe ser un objeto JSON');
  if (raw.servicio !== 'brevo') throw new Error('"servicio" debe ser "brevo"');
  const key = typeof raw.clave_api === 'string' && raw.clave_api.trim() ? raw.clave_api.trim() : String(env.BREVO_API_KEY ?? '').trim();
  if (!key) throw new Error('falta "clave_api" (la clave de la API de Brevo)');
  if (/PEGA|TU[-_ ]/i.test(key)) throw new Error('"clave_api" todavía tiene el texto de ejemplo');
  const fromEmail = typeof raw.remitente_correo === 'string' ? raw.remitente_correo.trim() : '';
  if (!EMAIL_RE.test(fromEmail) || /TU-DOMINIO/i.test(fromEmail)) throw new Error('"remitente_correo" debe ser un correo de tu dominio, verificado en Brevo');
  const fromName = raw.remitente_nombre === undefined ? 'CuentaClara' : raw.remitente_nombre;
  if (typeof fromName !== 'string' || !fromName.trim() || fromName.length > 60) throw new Error('"remitente_nombre" debe ser texto de máximo 60 caracteres');
  let appUrl = null;
  if (raw.url_app !== undefined && raw.url_app !== '') appUrl = parseAppUrl(raw.url_app);
  return { service: 'brevo', key, from: { name: fromName.trim(), email: fromEmail }, appUrl };
}

/** «https://cuentaclara.co/» → «https://cuentaclara.co». Solo el origen: sin ruta, ni «?», ni «#». */
export function parseAppUrl(value) {
  let u;
  try {
    u = new URL(String(value).trim());
  } catch {
    throw new Error('"url_app" no es una dirección válida (p. ej. https://cuentaclara.co)');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('"url_app" debe empezar por https://');
  if (/TU-DOMINIO/i.test(u.hostname)) throw new Error('"url_app" todavía tiene el texto de ejemplo');
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash || u.username) throw new Error('"url_app" debe ser solo el dominio, sin rutas (p. ej. https://cuentaclara.co)');
  return u.origin;
}

/** Lector de correo.json: se relee cuando cambia. Sin archivo o con uno no válido devuelve null (modo local). */
export function mailConfigLoader(file, logger = console) {
  let cache = null;
  return function load() {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      cache = null;
      return null;
    }
    if (cache && cache.text === text) return cache.value;
    let value = null;
    try {
      value = validateMailConfig(JSON.parse(text.replace(/^﻿/, '')));
    } catch (err) {
      logger.error?.(`[correo] ${file} no es válido (${err.message}). Los correos NO se envían: se muestran en esta ventana.`);
    }
    cache = { text, value };
    return value;
  };
}

/** «ana.maria@correo.com» → «a***@correo.com» (para la ventana negra: no hace falta el correo completo). */
export const maskEmail = (email) => String(email).replace(/^(.)[^@]*(@.*)$/, '$1***$2');

/**
 * `configPath`: data/correo.json. `appUrl`: dirección de la app si correo.json no trae `url_app` (en local,
 * http://localhost:3000). `transport`: solo para las pruebas (recibe cada mensaje y no se envía nada).
 * `contact`: correo de contacto del responsable (Responder a), o null.
 */
export function createMailer({ configPath, appUrl = 'http://localhost:3000', logger = console, transport = null, fetchImpl = fetch, contact = null } = {}) {
  const loadConfig = configPath ? mailConfigLoader(configPath, logger) : () => null;
  const base = () => loadConfig()?.appUrl ?? appUrl;

  async function deliver(message) {
    if (transport) return transport(message);
    const config = loadConfig();
    if (!config) {
      logger.info?.(
        `[correo] Modo local (sin data/correo.json): este correo NO se envió.\n  Para: ${message.to}\n  Asunto: ${message.subject}` +
          (message.link ? `\n  Enlace: ${message.link}` : ''),
      );
      return;
    }
    const res = await fetchImpl(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': config.key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: config.from,
        to: [{ email: message.to, ...(message.toName ? { name: message.toName } : {}) }],
        ...(contact ? { replyTo: { email: contact } } : {}),
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        tags: [message.kind],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo respondió ${res.status}: ${detail.slice(0, 300)}`);
    }
    logger.info?.(`[correo] Enviado «${message.kind}» a ${maskEmail(message.to)}`);
  }

  return {
    /** 'prueba' (pruebas automáticas), 'brevo' o 'local' (se muestra en la ventana negra). */
    mode: () => (transport ? 'prueba' : loadConfig() ? 'brevo' : 'local'),
    baseUrl: base,
    /** Enlace de un correo. El código va después del «#»: el navegador nunca lo envía al servidor. */
    link: (route, token) => `${base()}/#${route}?t=${token}`,
    /**
     * Envía `kind` (ver TEMPLATES) a `to`. No espera ni lanza errores: la respuesta al usuario no depende
     * de que el correo salga (y así «Olvidé mi contraseña» tarda lo mismo exista o no la cuenta).
     */
    send(to, kind, data = {}) {
      const message = { to, toName: data.name, kind, link: data.link ?? null, ...renderEmail(kind, { ...data, contact, appUrl: base() }) };
      try {
        Promise.resolve(deliver(message)).catch((err) => logger.error?.(`[correo] No se pudo enviar «${kind}» a ${maskEmail(to)}: ${err.message}`));
      } catch (err) {
        logger.error?.(`[correo] No se pudo enviar «${kind}» a ${maskEmail(to)}: ${err.message}`);
      }
      return message;
    },
    /** Como send, pero espera el resultado y lanza el error (para `npm run seguridad -- --probar-correo`). */
    async sendNow(to, kind, data = {}) {
      const message = { to, toName: data.name, kind, link: data.link ?? null, ...renderEmail(kind, { ...data, contact, appUrl: base() }) };
      await deliver(message);
      return message;
    },
  };
}

// ---------------------------------------------------------------- plantillas

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const whenFmt = new Intl.DateTimeFormat('es-CO', { timeZone: APP_TIMEZONE, dateStyle: 'long', timeStyle: 'short' });
/** Fecha y hora en Colombia: «18 de noviembre de 2026, 10:42 a. m.». */
export const whenText = (date) => whenFmt.format(date instanceof Date ? date : new Date(date));

/** Navegador legible a partir del user agent («Chrome en Windows»). */
export function browserName(ua) {
  const s = String(ua ?? '');
  const b = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : null;
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : null;
  return b ? `${b}${os ? ` en ${os}` : ''}` : 'un navegador desconocido';
}

const notYou = (d) =>
  d.contact
    ? `Si no fuiste tú, cambia tu contraseña ya (en ${d.appUrl}/#/recuperar) y escríbenos a ${d.contact}.`
    : `Si no fuiste tú, cambia tu contraseña ya en ${d.appUrl}/#/recuperar.`;

/**
 * Cada plantilla: asunto, párrafos antes del botón, botón (opcional) y párrafos después.
 * `d`: name, link, when, browser, ip, email, newEmail, left, contact, appUrl.
 */
const TEMPLATES = {
  verificar: (d) => ({
    subject: 'Confirma tu correo en CuentaClara',
    before: ['Confirma que este correo es tuyo. Así podrás recuperar tu cuenta si olvidas la contraseña.'],
    button: 'Confirmar mi correo',
    after: ['El enlace vence en 24 horas y solo sirve una vez.', 'Si no creaste una cuenta en CuentaClara, ignora este correo.'],
  }),
  cambiar_correo: (d) => ({
    subject: 'Confirma tu nuevo correo en CuentaClara',
    before: ['Pediste usar este correo en tu cuenta de CuentaClara. El correo de tu cuenta cambiará cuando abras este enlace.'],
    button: 'Confirmar mi nuevo correo',
    after: ['El enlace vence en 24 horas y solo sirve una vez.', 'Si no lo pediste, ignora este correo: no cambiará nada.'],
  }),
  recuperar: (d) => ({
    subject: 'Restablece tu contraseña de CuentaClara',
    before: ['Recibimos un pedido para crear una contraseña nueva para tu cuenta de CuentaClara.'],
    button: 'Crear una contraseña nueva',
    after: [
      'El enlace vence en 30 minutos y solo sirve una vez. Al cambiar la contraseña se cerrará tu sesión en todos tus dispositivos.',
      'Si no lo pediste, ignora este correo: tu contraseña no cambia.',
    ],
  }),
  contrasena_cambiada: (d) => ({
    subject: 'Tu contraseña de CuentaClara cambió',
    before: [`La contraseña de tu cuenta cambió el ${d.when}, desde ${d.browser}.`, 'Si fuiste tú, no tienes que hacer nada.'],
    after: [d.contact ? `Si no fuiste tú, recupera tu cuenta ya en ${d.appUrl}/#/recuperar y escríbenos a ${d.contact}.` : `Si no fuiste tú, recupera tu cuenta ya en ${d.appUrl}/#/recuperar.`],
  }),
  correo_cambiado: (d) => ({
    subject: 'Tu correo de CuentaClara cambió',
    before: [`El correo de tu cuenta de CuentaClara ahora es ${d.newEmail} (${d.when}). Desde ahora te escribiremos ahí y ese es el correo para entrar.`],
    after: [d.contact ? `Si no fuiste tú, escríbenos de inmediato a ${d.contact} desde este correo.` : 'Si no fuiste tú, responde de inmediato desde este correo al administrador de CuentaClara.'],
  }),
  '2fa_activado': (d) => ({
    subject: 'Activaste la verificación en dos pasos',
    before: [
      `Activaste la verificación en dos pasos el ${d.when}. Desde ahora, al entrar te pediremos el código de tu app de autenticación.`,
      'Guarda tus códigos de respaldo en un lugar seguro: sirven para entrar si pierdes el celular.',
    ],
    after: [notYou(d)],
  }),
  '2fa_desactivado': (d) => ({
    subject: 'Desactivaste la verificación en dos pasos',
    before: [`Tu cuenta ya no pide un código al entrar (${d.when}, desde ${d.browser}).`],
    after: [notYou(d)],
  }),
  '2fa_quitado_admin': (d) => ({
    subject: 'Quitamos la verificación en dos pasos de tu cuenta',
    before: [
      `Por tu solicitud, quitamos la verificación en dos pasos de tu cuenta y cerramos tus sesiones (${d.when}).`,
      'Entra con tu contraseña y vuelve a activarla en Configuración, con tu celular nuevo.',
    ],
    after: [d.contact ? `Si no lo pediste, escríbenos de inmediato a ${d.contact}.` : 'Si no lo pediste, cambia tu contraseña de inmediato.'],
  }),
  codigo_respaldo: (d) => ({
    subject: 'Usaste un código de respaldo',
    before: [
      `Entraste a tu cuenta con un código de respaldo el ${d.when}, desde ${d.browser}. Te quedan ${d.left}.`,
      ...(d.left <= 3 ? ['Te quedan pocos: genera códigos nuevos en Configuración → Verificación en dos pasos.'] : []),
    ],
    after: [notYou(d)],
  }),
  '2fa_bloqueado': (d) => ({
    subject: 'Alguien intentó entrar a tu cuenta',
    before: [
      `Alguien escribió bien tu contraseña pero falló 5 veces el código de la verificación en dos pasos (${d.when}, IP ${d.ip}, ${d.browser}).`,
      'Si no fuiste tú, tu contraseña ya no es secreta: cámbiala ahora. Tu cuenta sigue protegida por el código de tu celular.',
    ],
    after: [d.contact ? `Cámbiala en ${d.appUrl}/#/recuperar. ¿Dudas? Escríbenos a ${d.contact}.` : `Cámbiala en ${d.appUrl}/#/recuperar.`],
  }),
  prueba: () => ({
    subject: 'Correo de prueba de CuentaClara',
    before: ['Si lees esto, CuentaClara ya puede enviar correos con tu cuenta de Brevo.'],
    after: [],
  }),
};

export const EMAIL_KINDS = Object.keys(TEMPLATES);

/** Asunto, texto plano y HTML sencillo (sin imágenes, seguimiento ni recursos de terceros). */
export function renderEmail(kind, d) {
  const t = TEMPLATES[kind];
  if (!t) throw new Error(`Correo desconocido: ${kind}`);
  const { subject, before, button, after } = t(d);
  const hello = d.name ? `Hola, ${d.name}:` : 'Hola:';
  const footer = `Mensaje automático de CuentaClara sobre la seguridad de tu cuenta. No incluye publicidad.${d.contact ? ` ¿Dudas? Escríbenos a ${d.contact}.` : ''}`;

  const text = [hello, '', ...before.flatMap((p) => [p, '']), ...(button && d.link ? [`${button}: ${d.link}`, ''] : []), ...after.flatMap((p) => [p, '']), '—', footer].join('\n');

  const p = (s) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1f2937">${esc(s)}</p>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 20px;font-size:17px;font-weight:bold;color:#111827">CuentaClara</p>
${p(hello)}
${before.map(p).join('\n')}
${
  button && d.link
    ? `<p style="margin:22px 0"><a href="${esc(d.link)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 20px;border-radius:10px">${esc(button)}</a></p>
<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#6b7280">¿El botón no funciona? Copia esta dirección en tu navegador:<br><span style="word-break:break-all">${esc(d.link)}</span></p>`
    : ''
}
${after.map(p).join('\n')}
<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">${esc(footer)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}
