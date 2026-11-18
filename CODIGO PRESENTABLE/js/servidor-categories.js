import { SOCIAL_SECURITY_CATEGORY } from './tax-co.js';

export const CATEGORIES = {
  ingreso: ['Facturación', 'Ventas', 'Subvenciones', 'Otros ingresos'],
  gasto: [
    SOCIAL_SECURITY_CATEGORY,
    'Software y suscripciones',
    'Material y equipos',
    'Servicios públicos',
    'Arriendo',
    'Transporte y viáticos',
    'Formación',
    'Contador y asesoría',
    'Marketing',
    'Otros gastos',
  ],
};

/** Categoría que reciben los ingresos generados automáticamente por una factura. */
export const INVOICE_CATEGORY = 'Facturación';
