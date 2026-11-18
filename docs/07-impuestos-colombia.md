# 7. Impuestos de Colombia (en lugar de los de España)

> Fecha: 09/11/2026. Petición: «Necesito que la tasa de impuestos no sea de España sino de Colombia».

La app calcula ahora los impuestos de una **persona natural que trabaja como independiente en Colombia**. Desaparecen el IVA español (21 %), el IRPF, la retención española y los modelos 303 y 130.

## Qué se calcula

| Impuesto | Cómo lo calcula la app | Norma |
|---|---|---|
| **IVA** | Tarifas 19 % (general), 5 % (diferencial) y 0 % (exento o excluido). IVA a pagar = IVA generado − IVA descontable. Se agrupa por periodos **cuatrimestrales** (ene–abr, may–ago, sep–dic) o **bimestrales**, y se declara el mes siguiente (formulario 300) | Art. 600 ET |
| **No responsable de IVA** | Opción en Configuración. No cobra IVA y el IVA de sus compras se suma al costo (cuenta para la renta) | Art. 437 par. 3 ET (menos de 3.500 UVT) |
| **Retención en la fuente** | La aplica el cliente al pagar. Tarifas 2026: 10 % u 11 % (honorarios y consultoría), 6 % o 4 % (servicios), 3,5 % (software y diseño web), 2,5 % (compras) o sin retención. Se resta del impuesto de renta | Art. 392 ET, DUR 1625/2016, Decreto 572/2025 |
| **Impuesto de renta** | Tabla del **art. 241 ET** (0 % hasta 1.090 UVT y después 19 %, 28 %, 33 %, 35 %, 37 % y 39 %) sobre lo que llevas del año. Se elige el camino más favorable: **restar costos y gastos**, o restar los aportes a salud y pensión y aplicar la **renta exenta del 25 %** (máximo 790 UVT al año). Se declara de agosto a octubre del año siguiente (formulario 210) | Arts. 206, 241 y 336 ET (Ley 2277/2022) |
| **UVT** | 2026: $52.374 (Resolución DIAN 000238 de 2025). También 2023, 2024 y 2025. Para un año sin UVT publicada se usa la última y se avisa | — |

**Reserva del mes** = IVA del mes + lo que sube la renta acumulada del año respecto al mes anterior (nunca negativa). Como los primeros 1.090 UVT (unos $57 millones) tributan al 0 %, a principio de año la reserva de renta suele ser 0 y después crece.

## Pantallas

- **Configuración → Impuestos en Colombia:** ¿responsable de IVA? (Sí/No), periodicidad del IVA, IVA por defecto y retención en la fuente que te aplican. Las ayudas muestran los topes en pesos (3.500 UVT = $183.309.000; 92.000 UVT = $4.818.408.000). «NIF» pasa a «NIT o cédula». Ya no existe el «% de reserva de IRPF»: la renta se calcula con la tabla.
- **Dashboard:** «A reservar este mes» (IVA + renta); tarjeta «Tus declaraciones» (IVA del periodo y renta del año); el desglose muestra la depuración de la renta paso a paso y la tabla de periodos de IVA. Si la moneda no es el peso colombiano, avisa de que la renta no es válida (las UVT están en pesos).
- **Formularios:** «Base gravable», «IVA» con las tarifas de Colombia y «Retención en la fuente».
- **Factura:** «NIT o C.C.», «Retención en la fuente» y si eres o no responsable de IVA. Si no lo eres, el documento se titula **Cuenta de cobro**. Lleva una nota: es un documento de control y no sustituye la factura electrónica validada por la DIAN.
- **Categorías de gasto:** «Cuota de autónomos» → «Seguridad social (salud y pensión)»; «Alquiler» → «Arriendo»; «Suministros» → «Servicios públicos»; «Transporte y dietas» → «Transporte y viáticos»; «Gestoría y asesoría» → «Contador y asesoría».
- Las cuentas nuevas empiezan con IVA 19 %, retención 10 %, cuatrimestral y **pesos colombianos**.

## Datos existentes

Migración `004_colombia.sql`, aplicada a `data/app.db` después de una copia de seguridad (`data/backups/cuentaclara-20261109-235209-580.db`):

- Añade `vat_responsible` y `vat_period` a la configuración.
- Cambia los valores **por defecto** españoles (IVA 21 %, retención 15 %) por los colombianos (19 % y 10 %).
- Renombra las categorías de gasto en los movimientos.
- **No cambia ningún importe ni ninguna tarifa** de los movimientos y facturas ya guardados. Tu gasto del 09/11/2026 («Material y equipos», $19.000) se guardó con el IVA español del 21 % y sigue así: edítalo si debe ser 19 %.

Por sencillez, los nombres internos de algunas columnas se mantienen: `nif` guarda el NIT o la cédula y `irpf_rate` la tarifa de retención en la fuente.

## Archivos

| Archivo | Cambio |
|---|---|
| `server/tax-co.js` | **Nuevo.** UVT, tabla del art. 241, tarifas, topes y configuración inicial, con sus fuentes |
| `server/calc.js` | Nuevo motor: IVA por periodos, no responsables, depuración de la renta, renta acumulada y reserva del mes |
| `server/migrations/004_colombia.sql` | **Nueva** migración |
| `server/routes/settings.js`, `summary.js`, `analytics.js`, `movements.js`, `auth.js` | Configuración de IVA, datos del Dashboard y cuentas nuevas en Colombia |
| `server/categories.js`, `server/currencies.js` | Categorías colombianas; moneda inicial COP |
| `web/src/lib/tax.ts` | **Nuevo.** Textos de tarifas, periodos y métodos |
| `web/src/pages/settings.tsx`, `dashboard.tsx`, `invoices.tsx` | Pantallas descritas arriba |
| `web/src/components/movement-dialog.tsx`, `invoice-dialog.tsx`, `currency-card.tsx` | Etiquetas y tarifas |
| `web/src/lib/types.ts`, `format.ts`, `session.tsx`, `web/index.html` | Tipos nuevos y pesos por defecto |
| `tests/calc.test.js`, `tests/colombia.test.js` (**nuevo**) y los demás tests | Valores de Colombia calculados a mano |

## Verificación

| Prueba | Resultado |
|---|---|
| `npm test` (compila y ejecuta todo) | **106/106**. Incluye la tabla de renta en todos los tramos, los dos caminos de depuración y el tope de 790 UVT, la renta acumulada con retenciones, la reserva del mes, los periodos de IVA cuatrimestrales y bimestrales, el no responsable, la validación de la configuración y la migración de una base de datos «española» sin tocar importes |
| `tsc --noEmit` | Sin errores |
| Navegador (servidor y base de datos de prueba aparte, ya borrados) | Dashboard de febrero 2026: reserva $14.683.345 (IVA $11.400.000 + renta $3.283.345), IVA ene–abr $22.420.000, base gravable $87.000.000: coinciden con el cálculo a mano. Configuración: pasar a «No responsable» oculta el IVA, pone el IVA por defecto a 0 % y el gasto de marzo pasa a costar $2.380.000. Formulario: 1.000.000 con retención 10 % → total $900.000. La factura sale como «Cuenta de cobro». Móvil 375 px sin desbordamiento |
| Base de datos real | Migración aplicada; configuración en 19 %, 10 %, cuatrimestral y COP; tu movimiento sin cambios |

## Límites (no calculado)

ICA y ReteICA (municipales), ReteIVA, anticipo de renta del año siguiente, Régimen Simple de Tributación, aportes a seguridad social de independientes (solo se usan si los registras como gasto), deducciones por dependientes, intereses de vivienda y otras rentas exentas, ganancias ocasionales y el impuesto al patrimonio. El día exacto de cada declaración depende del último dígito del NIT. La estimación de renta es **orientativa**: revísala con tu contador.
