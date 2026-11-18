# 3. Verificación: CRUD de movimientos, persistencia y balances

> Fase 3 — comprobado **antes** de añadir funcionalidades nuevas. Fecha: 09/11/2026.

## Cómo se ha comprobado (sin datos simulados)

- **Servidor real + base de datos real**: SQLite en un fichero en disco, no memoria ni `localStorage`.
- **Pruebas automáticas** (`npm test`): cada fichero de pruebas arranca el servidor HTTP real con una base de datos **nueva y temporal** que se borra al terminar. Los valores esperados están **calculados a mano** en el propio test, no con el código que se prueba.
- **Prueba manual en navegador** con un usuario de prueba (`tests/fixtures/usuarios-e2e.json`) sobre `data/e2e-pruebas.db`, una base de datos separada que se elimina al final. La base de datos real (`data/app.db`) no se ha tocado.
- Una cuenta nueva **empieza vacía**: no hay datos de ejemplo mezclados con los reales.

## Resultados

| Comprobación | Automática | Navegador | Resultado |
|---|---|---|---|
| Crear ingreso (1.000 € + 21 % IVA − 15 % IRPF) | ✔ | ✔ | Total 1.060 €; Dashboard: IVA 210 €, IRPF 50 €, reserva 260 € |
| Crear gasto (200 € + 21 %) y recalcular | ✔ | ✔ | Beneficio 800 €, IVA 168 €, IRPF 10 €, reserva 178 €, disponible 640 € |
| Editar gasto (200 → 300 €) y recalcular | ✔ | ✔ | Beneficio 700 €; IRPF a reservar 0 € (las retenciones lo cubren) |
| Editar la fecha mueve el ingreso de mes | ✔ | — | Noviembre baja a 0 €, octubre sube a 1.000 € |
| Gasto no deducible: su IVA pasa a ser coste | ✔ | — | Gastos 363 €, IVA soportado 0 € |
| Cambiar el % de reserva IRPF recalcula | ✔ | — | 30 % → IRPF estimado 300 €, a reservar 150 € |
| Eliminar con confirmación («Cancelar» no borra) | ✔ | ✔ | Desaparece de la lista; GET → 404; totales recalculados |
| Eliminar el último movimiento | ✔ | — | El Dashboard vuelve al estado vacío |
| Datos inválidos rechazados (13 casos) y edición inválida sin efecto | ✔ | ✔ (registro) | 400 con error por campo; el dato guardado no cambia |
| **Reiniciar el servidor**: datos y sesión siguen | ✔ | ✔ | Mismos movimientos, mismo resumen, misma sesión; el gasto borrado no reaparece |
| Las migraciones no se reaplican al reiniciar | ✔ | — | Ninguna fila perdida tras 3 arranques |

Pruebas automáticas: **23/23 superadas** (`calc`, `movements`, `persistence`).

## Problemas encontrados y corregidos durante la verificación

1. **Listeners duplicados**: el contenedor `<main>` se reutilizaba entre pantallas, así que cada visita a Movimientos añadía otro listener de clic (al volver, «Eliminar» habría pedido confirmación dos veces). Corregido: cada navegación crea un contenedor nuevo (`public/js/main.js`).
2. **Tabla cortada a ~800 px de ancho**: con `overflow: hidden` las columnas IVA/Retención quedaban ocultas y un texto accesible desbordaba la página. Corregido: desplazamiento horizontal y contenedor posicionado (`public/css/app.css`).
