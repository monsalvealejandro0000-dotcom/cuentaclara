/**
 * Documentos legales y registro de consentimientos (docs/12-legal-y-seguridad.md).
 *
 * - Los textos están en legal/*.md. Cada uno lleva su versión en la cabecera. Al arrancar se guardan
 *   en `legal_texts` con su huella SHA-256, así siempre se puede mostrar el texto exacto que aceptó cada persona.
 * - Los datos del responsable (nombre, NIT o cédula, dirección…) se rellenan desde data/responsable.json.
 * - Cada aceptación (o revocación) queda en `consents`: quién, qué documento y versión, cuándo, desde qué IP
 *   y navegador, en qué formulario y con qué texto exacto de la casilla. La tabla no deja cambiar ni borrar
 *   filas (triggers) y cada fila lleva la huella de la anterior: si alguien la manipula, `verifyConsentChain` lo detecta.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HttpError } from './validation.js';
import { transaction } from './db.js';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_LEGAL_DIR = path.join(APP_DIR, 'legal');

/** Documentos publicados, en el orden en que se muestran. */
export const DOC_KEYS = ['terminos', 'privacidad', 'cookies', 'reembolsos'];
/** Los que hay que aceptar para usar la app (y volver a aceptar cuando cambia su versión). */
export const REQUIRED_DOCS = ['terminos', 'privacidad'];
/** Los que se aceptan al avisar un pago. */
export const PAYMENT_DOCS = ['terminos', 'reembolsos', 'privacidad'];

export const SIC_URL = 'https://www.sic.gov.co';

/**
 * Texto exacto de cada casilla. Es el mismo que ve la persona (la interfaz lo pide a /api/legal)
 * y el que queda guardado en el registro.
 */
export const CONSENT_LABELS = {
  terminos: 'He leído y acepto los Términos y condiciones de CuentaClara.',
  privacidad: 'Autorizo el tratamiento de mis datos personales según la Política de privacidad (Ley 1581 de 2012).',
  pagoTerminos: 'Acepto los Términos y condiciones y la Política de reembolsos para esta compra.',
  pagoPrivacidad: 'Autorizo el tratamiento de los datos de este pago según la Política de privacidad.',
  contador:
    'Autorizo a esta persona a ver, en solo lectura, mis movimientos, facturas, declaraciones e informes de CuentaClara, para la gestión de mis impuestos. Puedo quitarle el acceso cuando quiera.',
  contadorRevoca: 'Quitó el acceso de su contador.',
};

/** Formulario donde se dio el consentimiento. */
export const CONTEXT_LABELS = {
  registro: 'Formulario de registro',
  actualizacion: 'Aceptación de una versión nueva',
  pago: 'Formulario de aviso de pago',
  contador: 'Configuración → Mi contador',
};

// ---------------------------------------------------------------- datos del responsable

const RESPONSABLE_FIELDS = {
  nombre: 'nombre o razón social del responsable',
  documento: 'cédula o NIT del responsable',
  direccion: 'dirección de notificación',
  ciudad: 'ciudad',
  correo: 'correo de contacto',
  telefono: 'teléfono de contacto',
  alojamiento: 'proveedor y país del servidor donde se alojan los datos',
};

/** Lee data/responsable.json. Devuelve los valores (o un aviso «[pendiente: …]») y si está completo. */
export function readResponsable(file, logger = console) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    if (err.code !== 'ENOENT') logger.error?.(`[legal] ${file} no es un JSON válido (${err.message}).`);
  }
  const values = {};
  const missing = [];
  for (const [key, what] of Object.entries(RESPONSABLE_FIELDS)) {
    const v = typeof raw?.[key] === 'string' ? raw[key].trim().slice(0, 300) : '';
    // Los valores de ejemplo van en MAYÚSCULAS con «TU …»: también cuentan como pendientes.
    if (!v || /\bTU\s+[A-ZÁÉÍÓÚÑ]/.test(v)) {
      values[key] = `[pendiente: ${what}]`;
      missing.push(key);
    } else values[key] = v;
  }
  return { values, complete: missing.length === 0, missing };
}

// ---------------------------------------------------------------- documentos

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** Separa la cabecera («---\nclave: valor\n---») del texto. */
function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) throw new Error('falta la cabecera con titulo y version');
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.titulo || !meta.version) throw new Error('la cabecera necesita «titulo» y «version»');
  return { meta, body: text.slice(m[0].length).replace(/\r\n?/g, '\n').trim() };
}

/**
 * Carga los documentos de `dir`, rellena los datos del responsable y los guarda en `legal_texts`.
 * Se hace al arrancar: si cambias un documento o data/responsable.json, reinicia la app.
 */
export function loadLegal(db, { dir = DEFAULT_LEGAL_DIR, responsableFile, logger = console } = {}) {
  const responsable = readResponsable(responsableFile, logger);
  const docs = {};
  for (const key of DOC_KEYS) {
    const file = path.join(dir, `${key}.md`);
    let parsed;
    try {
      parsed = parseFrontMatter(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch (err) {
      throw new Error(`Documento legal no válido (${file}): ${err.message}`);
    }
    const text = parsed.body.replace(/\{\{(\w+)\}\}/g, (all, k) => responsable.values[k] ?? all);
    docs[key] = {
      key,
      title: parsed.meta.titulo,
      version: parsed.meta.version,
      effective: parsed.meta.vigente_desde || parsed.meta.version,
      text,
      sha256: sha256(text),
    };
  }
  const insert = db.prepare('INSERT OR IGNORE INTO legal_texts (sha256, doc, version, content) VALUES (?, ?, ?, ?)');
  transaction(db, () => {
    for (const d of Object.values(docs)) insert.run(d.sha256, d.key, d.version, d.text);
  });
  if (!responsable.complete) {
    logger.warn?.(
      `[legal] Faltan tus datos como responsable en ${responsableFile} (${responsable.missing.join(', ')}). ` +
        'Los documentos legales los muestran como «[pendiente: …]». Complétalos antes de publicar la app (docs/12-legal-y-seguridad.md).',
    );
  }
  return {
    docs,
    responsable,
    /** Lo que la interfaz necesita para las casillas y el pie de página (sin los textos completos). */
    publicInfo() {
      return {
        docs: DOC_KEYS.map((k) => ({ key: k, title: docs[k].title, version: docs[k].version, effective: docs[k].effective, sha256: docs[k].sha256 })),
        required: REQUIRED_DOCS,
        labels: CONSENT_LABELS,
        sicUrl: SIC_URL,
        contact: responsable.complete ? { email: responsable.values.correo } : null,
        complete: responsable.complete,
      };
    },
  };
}

/**
 * Comprueba que la persona aceptó la versión que se le mostró. Si un documento cambió mientras tenía
 * el formulario abierto, responde 409 para que recargue y lea la versión nueva.
 */
export function checkVersions(legal, versions, keys) {
  if (versions === undefined || versions === null) return;
  if (typeof versions !== 'object' || Array.isArray(versions)) throw new HttpError(400, 'VALIDATION', 'Versiones no válidas');
  for (const k of keys) {
    if (versions[k] !== undefined && versions[k] !== legal.docs[k].version) {
      throw new HttpError(409, 'LEGAL_CHANGED', `Actualizamos «${legal.docs[k].title}» mientras tenías el formulario abierto. Recarga la página y léelo antes de aceptar.`);
    }
  }
}

// ---------------------------------------------------------------- registro de consentimientos

const GENESIS = '0'.repeat(64);

function rowHash(prev, r) {
  return sha256(
    JSON.stringify([prev, r.user_id, r.email, r.purpose, r.action, r.version, r.text_sha256, r.context, r.label, r.detail, r.ip, r.user_agent, r.accepted_at]),
  );
}

/**
 * Añade filas al registro. Debe llamarse DENTRO de una transacción (para que dos peticiones a la vez
 * no rompan la cadena de huellas). `entries`: [{ purpose, doc, label, action?, detail? }].
 * `purpose` es lo que se acepta (terminos, privacidad, reembolsos, compartir_contador); `doc` el documento
 * legal que lo explica, cuya versión y huella se guardan.
 */
export function appendConsents(db, legal, entries, { userId, email, ip, userAgent, context, now = new Date() }) {
  if (!CONTEXT_LABELS[context]) throw new Error(`Contexto de consentimiento desconocido: ${context}`);
  const insert = db.prepare(
    `INSERT INTO consents (user_id, email, purpose, action, version, text_sha256, context, label, detail, ip, user_agent, accepted_at, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let prev = db.prepare('SELECT hash FROM consents ORDER BY id DESC LIMIT 1').get()?.hash ?? GENESIS;
  const acceptedAt = now.toISOString();
  for (const e of entries) {
    const doc = legal.docs[e.doc];
    const r = {
      user_id: userId,
      email: String(email).toLowerCase(),
      purpose: e.purpose,
      action: e.action ?? 'acepta',
      version: doc.version,
      text_sha256: doc.sha256,
      context,
      label: e.label,
      detail: e.detail ?? '',
      ip: String(ip || 'desconocida').slice(0, 64),
      user_agent: String(userAgent || '').slice(0, 300),
      accepted_at: acceptedAt,
    };
    const hash = rowHash(prev, r);
    insert.run(r.user_id, r.email, r.purpose, r.action, r.version, r.text_sha256, r.context, r.label, r.detail, r.ip, r.user_agent, r.accepted_at, prev, hash);
    prev = hash;
  }
}

/** Igual que appendConsents, abriendo su propia transacción. */
export function recordConsents(db, legal, entries, who) {
  transaction(db, () => appendConsents(db, legal, entries, who));
}

/** Entradas de la aceptación de los documentos obligatorios (registro o versión nueva). */
export const accountConsentEntries = () => [
  { purpose: 'terminos', doc: 'terminos', label: CONSENT_LABELS.terminos },
  { purpose: 'privacidad', doc: 'privacidad', label: CONSENT_LABELS.privacidad },
];

/**
 * Correos de la cuenta: el actual y los anteriores (fase 13, cambio de correo). Sus aceptaciones se guardaron
 * con el correo de ese momento y siguen valiendo. `email_changes` se borra con la cuenta, así que si SQLite
 * reutiliza el id de una cuenta eliminada, la nueva no hereda sus aceptaciones.
 */
const ACCOUNT_EMAILS_SQL = '(SELECT ? UNION SELECT old_email FROM email_changes WHERE user_id = ?)';

/**
 * Documentos obligatorios cuya versión vigente aún no ha aceptado esta cuenta.
 * Se compara también el correo: si SQLite reutiliza el id de una cuenta eliminada, la nueva no hereda sus aceptaciones.
 */
export function pendingConsents(db, legal, user) {
  const rows = db
    .prepare(
      `SELECT purpose, version FROM consents
       WHERE user_id = ? AND email IN ${ACCOUNT_EMAILS_SQL} AND action = 'acepta' AND purpose IN ('terminos', 'privacidad')
       ORDER BY id DESC`,
    )
    .all(user.id, String(user.email).toLowerCase(), user.id);
  const latest = {};
  for (const r of rows) latest[r.purpose] ??= r.version;
  return REQUIRED_DOCS.filter((k) => latest[k] !== legal.docs[k].version);
}

/** Historial de la propia cuenta (Configuración → Privacidad): la prueba de su autorización (art. 8, Ley 1581). */
export function consentHistory(db, legal, user) {
  return db
    .prepare(
      `SELECT c.id, c.purpose, c.action, c.version, c.text_sha256, c.context, c.label, c.detail, c.ip, c.user_agent, c.accepted_at, t.doc
       FROM consents c JOIN legal_texts t ON t.sha256 = c.text_sha256
       WHERE c.user_id = ? AND c.email IN ${ACCOUNT_EMAILS_SQL} ORDER BY c.id DESC LIMIT 200`,
    )
    .all(user.id, String(user.email).toLowerCase(), user.id)
    .map((r) => ({
      id: r.id,
      purpose: r.purpose,
      action: r.action,
      doc: r.doc,
      docTitle: legal.docs[r.doc]?.title ?? r.doc,
      version: r.version,
      sha256: r.text_sha256,
      current: legal.docs[r.doc]?.version === r.version,
      context: r.context,
      contextLabel: CONTEXT_LABELS[r.context] ?? r.context,
      label: r.label,
      detail: r.detail,
      ip: r.ip,
      userAgent: r.user_agent,
      at: r.accepted_at,
    }));
}

/**
 * Recalcula la cadena de huellas. Devuelve { ok, rows } o { ok: false, brokenAt, reason }.
 * Detecta filas cambiadas, borradas del medio o insertadas a mano.
 */
export function verifyConsentChain(db) {
  let prev = GENESIS;
  let n = 0;
  for (const r of db.prepare('SELECT * FROM consents ORDER BY id').iterate()) {
    if (r.prev_hash !== prev) return { ok: false, brokenAt: r.id, reason: 'la fila no enlaza con la anterior (se borró o se insertó una fila)' };
    if (rowHash(prev, r) !== r.hash) return { ok: false, brokenAt: r.id, reason: 'el contenido de la fila no coincide con su huella (se modificó)' };
    const text = db.prepare('SELECT content FROM legal_texts WHERE sha256 = ?').get(r.text_sha256);
    if (!text || sha256(text.content) !== r.text_sha256) return { ok: false, brokenAt: r.id, reason: 'el texto legal aceptado no coincide con su huella' };
    prev = r.hash;
    n++;
  }
  return { ok: true, rows: n };
}
