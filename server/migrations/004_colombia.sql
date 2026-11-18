-- Impuestos de Colombia en lugar de los de España.
-- No cambia ningún importe ni tarifa de los movimientos y facturas ya guardados.

-- ¿Cobra IVA? (art. 437 ET) y cada cuánto lo declara (art. 600 ET).
ALTER TABLE settings ADD COLUMN vat_responsible INTEGER NOT NULL DEFAULT 1 CHECK (vat_responsible IN (0, 1));
ALTER TABLE settings ADD COLUMN vat_period TEXT NOT NULL DEFAULT 'cuatrimestral' CHECK (vat_period IN ('bimestral', 'cuatrimestral'));

-- Los valores por defecto de España (IVA 21/10/4 %, IRPF 15/7/19 %) pasan a los de Colombia.
UPDATE settings SET default_vat_rate = 19 WHERE default_vat_rate NOT IN (19, 5, 0);
UPDATE settings SET default_irpf_rate = 10 WHERE default_irpf_rate NOT IN (11, 10, 6, 4, 3.5, 2.5, 0);

-- Categorías de gasto con nombre colombiano.
UPDATE movements SET category = 'Seguridad social (salud y pensión)' WHERE type = 'gasto' AND category = 'Cuota de autónomos';
UPDATE movements SET category = 'Servicios públicos' WHERE type = 'gasto' AND category = 'Suministros';
UPDATE movements SET category = 'Arriendo' WHERE type = 'gasto' AND category = 'Alquiler';
UPDATE movements SET category = 'Transporte y viáticos' WHERE type = 'gasto' AND category = 'Transporte y dietas';
UPDATE movements SET category = 'Contador y asesoría' WHERE type = 'gasto' AND category = 'Gestoría y asesoría';
