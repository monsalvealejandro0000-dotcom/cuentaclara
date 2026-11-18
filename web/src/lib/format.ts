/* ------------------------------------------------------------------ */
/*  Moneda local (Configuración → Moneda)                               */
/*  Los importes se guardan en centésimas; la moneda solo cambia cómo   */
/*  se muestran. Cada moneda usa el formato de su país cuando la app    */
/*  lo conoce (MXN → es-MX "$1,234.56"); si no, el español genérico.    */
/* ------------------------------------------------------------------ */

const CURRENCY_LOCALE: Record<string, string> = {
  EUR: 'es-ES', USD: 'es-US', MXN: 'es-MX', COP: 'es-CO', ARS: 'es-AR', CLP: 'es-CL', PEN: 'es-PE', UYU: 'es-UY',
  BOB: 'es-BO', PYG: 'es-PY', VES: 'es-VE', DOP: 'es-DO', CRC: 'es-CR', GTQ: 'es-GT', HNL: 'es-HN', NIO: 'es-NI',
  PAB: 'es-PA', CUP: 'es-CU',
};

/** Monedas que se muestran primero en el selector. */
export const COMMON_CURRENCIES = ['COP', 'USD', 'EUR', 'MXN', 'ARS', 'CLP', 'PEN', 'UYU', 'GTQ', 'DOP', 'CRC', 'BOB', 'PYG', 'HNL', 'NIO', 'PAB', 'VES', 'CUP'];

type MoneyFormat = {
  code: string;
  locale: string;
  digits: number;
  full: Intl.NumberFormat;
  whole: Intl.NumberFormat;
  symbol: string;
  position: 'prefix' | 'suffix';
  decimal: string;
};

function buildFormat(code: string): MoneyFormat {
  const locale = CURRENCY_LOCALE[code] ?? 'es';
  // Decimales oficiales (ISO 4217), con un máximo de 2 porque los importes se guardan en centésimas.
  const minor = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  const digits = Math.min(minor, 2);
  const opts = { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' } as const;
  const full = new Intl.NumberFormat(locale, { ...opts, minimumFractionDigits: digits, maximumFractionDigits: digits });
  const whole = new Intl.NumberFormat(locale, { ...opts, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const parts = full.formatToParts(1234.5);
  const symbolIdx = parts.findIndex((p) => p.type === 'currency');
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? ',';
  return {
    code,
    locale,
    digits,
    full,
    whole,
    symbol: parts[symbolIdx]?.value ?? code,
    position: symbolIdx < parts.findIndex((p) => p.type === 'integer') ? 'prefix' : 'suffix',
    decimal,
  };
}

let current = buildFormat('COP');

/** Cambia la moneda de toda la interfaz (se llama al cargar o guardar la configuración). */
export function setCurrency(code: string | null | undefined) {
  const next = code || 'COP';
  if (next === current.code) return;
  try {
    current = buildFormat(next);
  } catch {
    current = buildFormat('COP');
  }
}

export const currencyCode = () => current.code;
export const currencySymbol = () => current.symbol;
/** Datos para el AnalyticsBento (símbolo, posición y formato de su país). */
export const currencyDisplay = () => ({ currency: current.symbol, locale: current.locale, currencyPosition: current.position });

const currencyNames = new Intl.DisplayNames('es', { type: 'currency' });
export const currencyName = (code: string) => capitalize(currencyNames.of(code) ?? code);
/** Ejemplo de 1234,56 en una moneda concreta (vista previa del selector). */
export const sampleAmount = (code: string, value = 1234.56) => buildFormat(code).full.format(value);
export const currencyDigits = (code: string) => buildFormat(code).digits;

/** Centésimas → "1.234,56 €", "$1,234.56", "¥1,235"… */
export const money = (cents: number | null | undefined) => current.full.format((cents ?? 0) / 100);
/** Unidades → importe sin decimales ("1.235 €"). */
export const moneyWhole = (value: number) => current.whole.format(value);
/** "+1.060,00 €" para ingresos, "−242,00 €" para gastos. */
export const signedMoney = (cents: number, type: 'ingreso' | 'gasto') => `${type === 'gasto' ? '−' : '+'}${money(Math.abs(cents))}`;

/**
 * Texto del usuario → centésimas enteras, o null si no es válido.
 * Acepta los dos estilos: "1.234,56" y "1,234.56" (si aparecen ambos signos, el último es el decimal),
 * "1234.5", "1234" y el símbolo de la moneda.
 */
export function parseMoney(input: string): number | null {
  let s = String(input ?? '').replace(/[^\d.,-]/g, '');
  if (!s || s.includes('-')) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ''] = s.split('.');
  const cents = Number(int) * 100 + Number(`${dec}00`.slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centésimas → texto editable con el separador decimal de la moneda ("250,00" o "250.00"). */
export const centsToInput = (c: number | null | undefined) => {
  if (c == null) return '';
  const decimals = current.digits === 0 && c % 100 === 0 ? 0 : 2;
  return (c / 100).toFixed(decimals).replace('.', current.decimal);
};
export const amountPlaceholder = () => (current.digits === 0 ? '0' : `0${current.decimal}00`);
/** Ejemplo de importe para mensajes de error ("1.234,56" o "1,234.56"). */
export const amountExample = () =>
  current.full
    .formatToParts(1234.56)
    .filter((p) => ['integer', 'group', 'decimal', 'fraction'].includes(p.type))
    .map((p) => p.value)
    .join('');
export const decimalSeparator = () => current.decimal;
export const pct = (r: number) => `${String(r).replace('.', ',')} %`;
/** Mismo redondeo que el servidor (solo para vistas previas). */
export const pctOf = (cents: number, rate: number) => Math.round((cents * Math.round(rate * 100)) / 10000);

/** Variación porcentual como texto ("12,4%", "-3%") o "—" si no hay base de comparación. */
export function changePct(current: number, previous: number): string {
  if (!previous) return current ? '—' : '—';
  const v = ((current - previous) / Math.abs(previous)) * 100;
  const r = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r > 0 ? '' : r < 0 ? '-' : ''}${String(Math.abs(r)).replace('.', ',')}%`;
}

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const monthShort = (ym: string) => MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];
export const formatDate = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const pad = (n: number) => String(n).padStart(2, '0');
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const currentMonth = () => todayISO().slice(0, 7);
export const isMonth = (s: string | null | undefined) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');
export const isDate = (s: string | null | undefined) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s || '');

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + n));
}

export function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` };
}

export function downloadFile(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
