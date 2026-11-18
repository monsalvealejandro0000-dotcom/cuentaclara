import { weakPasswordReason } from './security.js';

/** Longitud mínima de las contraseñas nuevas (las que ya existen siguen valiendo para entrar). */
export const MIN_PASSWORD = 10;

export class HttpError extends Error {
  constructor(status, code, message, fields, headers) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.headers = headers;
  }
}

export const notFound = (message = 'No encontrado') => new HttpError(404, 'NOT_FOUND', message);
export const validationError = (fields, message = 'Revisa los campos marcados') =>
  new HttpError(400, 'VALIDATION', message, fields);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const isValidMonth = (s) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) && isValidDate(`${s}-01`);

export const MAX_CENTS = 99_999_999_999; // 999.999.999,99 €

/** Valida un objeto de entrada campo a campo y acumula los errores por campo. */
export class Validator {
  constructor(body) {
    this.body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    this.errors = {};
    this.data = {};
  }

  fail(key, msg) {
    if (!this.errors[key]) this.errors[key] = msg;
    return undefined;
  }

  get ok() {
    return Object.keys(this.errors).length === 0;
  }

  string(key, { required = false, max = 200 } = {}) {
    let v = this.body[key];
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') return this.fail(key, 'Debe ser texto');
    v = v.trim();
    if (required && !v) return this.fail(key, 'Este campo es obligatorio');
    if (v.length > max) return this.fail(key, `Máximo ${max} caracteres`);
    return (this.data[key] = v);
  }

  email(key) {
    const v = this.string(key, { required: true, max: 254 });
    if (v === undefined) return undefined;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return this.fail(key, 'Email no válido');
    return (this.data[key] = v.toLowerCase());
  }

  /** Contraseña nueva. `context`: correo y nombre de la persona, que no pueden ir dentro de ella. */
  password(key, context = {}) {
    const v = this.body[key];
    if (typeof v !== 'string' || !v) return this.fail(key, 'Este campo es obligatorio');
    if (v.length < MIN_PASSWORD) return this.fail(key, `Mínimo ${MIN_PASSWORD} caracteres`);
    if (v.length > 200) return this.fail(key, 'Máximo 200 caracteres');
    if (!/\p{L}/u.test(v) || !/\d/.test(v)) return this.fail(key, 'Debe incluir letras y números');
    const weak = weakPasswordReason(v, context);
    if (weak) return this.fail(key, weak);
    return (this.data[key] = v);
  }

  date(key, { required = true } = {}) {
    const v = this.body[key];
    if (v === undefined || v === null || v === '') {
      if (required) return this.fail(key, 'Este campo es obligatorio');
      return (this.data[key] = null);
    }
    if (!isValidDate(v)) return this.fail(key, 'Fecha no válida');
    return (this.data[key] = v);
  }

  cents(key) {
    const v = this.body[key];
    if (v === undefined || v === null || v === '') return this.fail(key, 'Este campo es obligatorio');
    if (typeof v !== 'number' || !Number.isInteger(v)) return this.fail(key, 'Importe no válido');
    if (v <= 0) return this.fail(key, 'El importe debe ser mayor que 0');
    if (v > MAX_CENTS) return this.fail(key, 'Importe demasiado alto');
    return (this.data[key] = v);
  }

  rate(key, { required = true, fallback } = {}) {
    const v = this.body[key];
    if (v === undefined || v === null || v === '') {
      if (!required) return (this.data[key] = fallback);
      return this.fail(key, 'Este campo es obligatorio');
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return this.fail(key, 'Porcentaje no válido');
    if (v < 0 || v > 100) return this.fail(key, 'Debe estar entre 0 y 100');
    if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-9) return this.fail(key, 'Máximo 2 decimales');
    return (this.data[key] = v);
  }

  oneOf(key, list, { required = true, fallback } = {}) {
    const v = this.body[key];
    if (v === undefined || v === null || v === '') {
      if (!required) return (this.data[key] = fallback);
      return this.fail(key, 'Este campo es obligatorio');
    }
    if (!list.includes(v)) return this.fail(key, 'Valor no válido');
    return (this.data[key] = v);
  }

  bool(key, fallback) {
    const v = this.body[key];
    if (v === undefined || v === null) return (this.data[key] = fallback);
    if (typeof v !== 'boolean') return this.fail(key, 'Valor no válido');
    return (this.data[key] = v);
  }

  check() {
    if (!this.ok) throw validationError(this.errors);
    return this.data;
  }
}

/** Convierte el parámetro :id en entero; si no es válido responde 404 (no existe). */
export function parseId(raw) {
  if (!/^\d{1,15}$/.test(String(raw))) throw notFound();
  return Number(raw);
}
