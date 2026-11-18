import { Validator } from '../validation.js';
import { NOW_SQL } from '../db.js';
import { CATEGORIES } from '../categories.js';
import { CURRENCIES } from '../currencies.js';
import { NEW_ACCOUNT_SETTINGS, VAT_PERIODS, VAT_RATES, WITHHOLDING_RATES, taxMeta } from '../tax-co.js';
import { currentMonth } from '../calc.js';

// `nif` guarda el NIT o la cédula y `default_irpf_rate` la retención en la fuente (nombres de columna heredados).
const COLUMNS = 'business_name, nif, address, default_vat_rate, default_irpf_rate, vat_responsible, vat_period, currency, title, updated_at';

/** Crea la configuración de una cuenta nueva con los valores de Colombia. */
export function createSettings(db, userId) {
  const s = NEW_ACCOUNT_SETTINGS;
  db.prepare(
    `INSERT OR IGNORE INTO settings (user_id, default_vat_rate, default_irpf_rate, vat_responsible, vat_period, currency)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, s.default_vat_rate, s.default_irpf_rate, s.vat_responsible, s.vat_period, s.currency);
}

export function getSettings(db, userId) {
  const select = () => db.prepare(`SELECT ${COLUMNS} FROM settings WHERE user_id = ?`).get(userId);
  let row = select();
  if (!row) {
    createSettings(db, userId);
    row = select();
  }
  return { ...row, vat_responsible: row.vat_responsible === 1 };
}

export function registerSettingsRoutes(router, { db }) {
  router.get(
    '/api/meta',
    () => ({
      categories: CATEGORIES,
      vatRates: VAT_RATES,
      irpfRates: WITHHOLDING_RATES,
      currencies: CURRENCIES,
      tax: taxMeta(Number(currentMonth().slice(0, 4))),
    }),
    { auth: false },
  );

  router.get('/api/settings', ({ user }) => ({ settings: getSettings(db, user.id) }));

  router.put('/api/settings', ({ body, user }) => {
    const current = getSettings(db, user.id);
    const v = new Validator(body);
    v.string('business_name', { max: 200 });
    v.string('nif', { max: 20 });
    v.string('address', { max: 300 });
    v.rate('default_vat_rate');
    v.rate('default_irpf_rate');
    // Los campos de IVA y la moneda son opcionales en la petición: si no llegan, se conservan.
    v.bool('vat_responsible', current.vat_responsible);
    v.oneOf('vat_period', VAT_PERIODS, { required: false, fallback: current.vat_period });
    v.oneOf('currency', CURRENCIES, { required: false, fallback: current.currency });
    // Cargo del saludo: opcional; si no llega en la petición (p. ej. al guardar otra tarjeta), se conserva.
    if (body.title === undefined) v.data.title = current.title;
    else v.string('title', { max: 40 });
    const d = v.check();
    db.prepare(
      `UPDATE settings SET business_name = ?, nif = ?, address = ?, default_vat_rate = ?, default_irpf_rate = ?,
         vat_responsible = ?, vat_period = ?, currency = ?, title = ?, updated_at = ${NOW_SQL}
       WHERE user_id = ?`,
    ).run(
      d.business_name,
      d.nif.toUpperCase(),
      d.address,
      d.default_vat_rate,
      d.default_irpf_rate,
      d.vat_responsible ? 1 : 0,
      d.vat_period,
      d.currency,
      d.title,
      user.id,
    );
    return { settings: getSettings(db, user.id) };
  });
}
