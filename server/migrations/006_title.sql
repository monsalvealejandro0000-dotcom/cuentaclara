-- Cargo opcional que aparece en el saludo del Dashboard ("Hola CEO Alejandro Monsalve").
-- Solo añade una columna vacía: no cambia ningún dato existente.
ALTER TABLE settings ADD COLUMN title TEXT NOT NULL DEFAULT '';
