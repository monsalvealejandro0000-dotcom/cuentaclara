/* Textos fiscales de Colombia para la interfaz. Los valores (tarifas, UVT, topes) vienen del servidor. */
import { capitalize, MONTHS, pct } from './format';
import type { RentaMethod, VatPeriod, VatPeriodicity } from './types';

export const VAT_LABELS: Record<number, string> = {
  19: '19 % · general',
  5: '5 % · diferencial',
  0: '0 % · exento o excluido',
};

/** Retención en la fuente que te practica el cliente (art. 392 ET y DUR 1625 de 2016). */
export const WITHHOLDING_LABELS: Record<number, string> = {
  10: '10 % · honorarios y consultoría',
  11: '11 % · honorarios (contratos de más de 3.300 UVT)',
  6: '6 % · servicios (no declarante)',
  4: '4 % · servicios (declarante)',
  3.5: '3,5 % · software y diseño web',
  2.5: '2,5 % · compras (declarante)',
  0: 'Sin retención',
};

/** Versión corta para formularios estrechos. */
export const WITHHOLDING_SHORT: Record<number, string> = {
  10: '10 % · honorarios',
  11: '11 % · honorarios',
  6: '6 % · servicios',
  4: '4 % · servicios',
  3.5: '3,5 % · software',
  2.5: '2,5 % · compras',
  0: 'Sin retención',
};

export const VAT_PERIOD_LABELS: Record<VatPeriodicity, string> = {
  cuatrimestral: 'Cuatrimestral (ene–abr, may–ago, sep–dic)',
  bimestral: 'Bimestral (cada dos meses)',
};

export const RENTA_METHOD_LABELS: Record<RentaMethod, string> = {
  costos: 'restando costos y gastos',
  exenta25: 'con la renta exenta del 25 %',
};

/** "Enero–abril 2026" */
export const vatPeriodLabel = (p: Pick<VatPeriod, 'firstMonth' | 'lastMonth' | 'from'>) =>
  `${capitalize(MONTHS[p.firstMonth - 1])}–${MONTHS[p.lastMonth - 1]} ${p.from.slice(0, 4)}`;

/** "2026-05" → "mayo de 2026" */
export const monthOfYear = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

/** Pesos colombianos sin decimales, aunque la moneda elegida sea otra (los topes en UVT son en pesos). */
const copFormat = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
export const pesos = (value: number) => copFormat.format(value);
/** "3.500 UVT ($183.309.000)" */
export const uvtText = (units: number, uvtPesos: number) => `${units.toLocaleString('es-CO')} UVT (${pesos(units * uvtPesos)})`;

export const marginalText = (rate: number) => (rate === 0 ? 'tramo exento (0 %)' : `tarifa marginal ${pct(rate)}`);
