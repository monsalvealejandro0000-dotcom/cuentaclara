/**
 * Parámetros fiscales de Colombia para personas naturales que trabajan como independientes.
 * Es la única fuente de estos valores: cálculo, API y pruebas los leen de aquí.
 *
 * Fuentes (comprobadas el 09/11/2026):
 * - UVT: 2026 = $52.374 (Resolución DIAN 000238 del 15/12/2025); 2025 = $49.799; 2024 = $47.065; 2023 = $42.412.
 * - Tabla del impuesto sobre la renta: art. 241 del Estatuto Tributario (ET).
 * - Depuración de las rentas de trabajo no laborales: art. 336 ET (Ley 2277 de 2022). Se restan los costos
 *   y gastos o, si no se restan, se aplica la renta exenta del 25 % (art. 206 num. 10 ET), con un tope de 790 UVT al año.
 * - IVA: tarifa general 19 %, diferencial 5 %, exentos y excluidos 0 %.
 * - Periodicidad del IVA (formulario 300): art. 600 ET. Bimestral con ingresos brutos del año anterior
 *   de 92.000 UVT o más (o grandes contribuyentes); si no, cuatrimestral.
 * - No responsables de IVA: art. 437 par. 3 ET (ingresos de la actividad por debajo de 3.500 UVT y demás requisitos).
 * - Retención en la fuente 2026: honorarios y consultoría 10 % u 11 %, servicios 4 % (declarantes) o 6 %
 *   (no declarantes), software y diseño web 3,5 %, compras 2,5 % (art. 392 ET, DUR 1625 de 2016, Decreto 572 de 2025).
 */

/** Valor de la UVT por año, en pesos. Añadir aquí la de cada año nuevo cuando la publique la DIAN. */
export const UVT_BY_YEAR = { 2023: 42412, 2024: 47065, 2025: 49799, 2026: 52374 };

/**
 * UVT que se usa para un año. Si el año aún no tiene UVT publicada (o es anterior a la tabla),
 * se usa la más cercana y se indica con `official: false`.
 */
export function uvt(year) {
  const years = Object.keys(UVT_BY_YEAR).map(Number);
  const used = UVT_BY_YEAR[year] ? year : year > Math.max(...years) ? Math.max(...years) : Math.min(...years);
  return { year: used, pesos: UVT_BY_YEAR[used], cents: UVT_BY_YEAR[used] * 100, official: used === year };
}

/** Art. 241 ET: tabla marginal en UVT. impuesto = (base − desde) × tarifa + fijo. */
export const RENTA_TABLE = [
  { from: 0, to: 1090, rate: 0, fixed: 0 },
  { from: 1090, to: 1700, rate: 19, fixed: 0 },
  { from: 1700, to: 4100, rate: 28, fixed: 116 },
  { from: 4100, to: 8670, rate: 33, fixed: 788 },
  { from: 8670, to: 18970, rate: 35, fixed: 2296 },
  { from: 18970, to: 31000, rate: 37, fixed: 5901 },
  { from: 31000, to: Infinity, rate: 39, fixed: 10352 },
];

export const EXEMPT_RATE = 25; // renta exenta de las rentas de trabajo (art. 206 num. 10 ET)
export const EXEMPT_CAP_UVT = 790; // tope anual de esa renta exenta
export const VAT_NOT_RESPONSIBLE_UVT = 3500; // art. 437 par. 3 ET
export const VAT_BIMONTHLY_UVT = 92000; // art. 600 ET

export const VAT_RATES = [19, 5, 0];
/** Tarifas de retención en la fuente que suelen practicar a un independiente (la primera es la habitual). */
export const WITHHOLDING_RATES = [10, 11, 6, 4, 3.5, 2.5, 0];
export const VAT_PERIODS = ['cuatrimestral', 'bimestral'];

/** Aportes obligatorios a salud y pensión: ingreso no constitutivo de renta. */
export const SOCIAL_SECURITY_CATEGORY = 'Seguridad social (salud y pensión)';

/** Configuración con la que empieza una cuenta nueva. */
export const NEW_ACCOUNT_SETTINGS = {
  default_vat_rate: 19,
  default_irpf_rate: 10, // retención en la fuente por honorarios (nombre de columna heredado)
  vat_responsible: 1,
  vat_period: 'cuatrimestral',
  currency: 'COP',
};

/** Datos públicos para la interfaz (Configuración y textos de ayuda). */
export function taxMeta(year) {
  return {
    country: 'CO',
    uvt: uvt(year),
    vatNotResponsibleUvt: VAT_NOT_RESPONSIBLE_UVT,
    vatBimonthlyUvt: VAT_BIMONTHLY_UVT,
    exemptRate: EXEMPT_RATE,
    exemptCapUvt: EXEMPT_CAP_UVT,
    rentaTable: RENTA_TABLE.map((r) => ({ ...r, to: Number.isFinite(r.to) ? r.to : null })),
  };
}
