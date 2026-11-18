-- Moneda local del usuario (código ISO 4217). Solo cambia cómo se muestran los importes:
-- los importes guardados no se convierten.
ALTER TABLE settings ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
