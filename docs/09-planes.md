# 9. Planes: Gratis, Pro y Contador

> Fase 9: pantallas definidas **antes** de programar y aprobadas el 16/11/2026. Programado y verificado el mismo día. Al final del documento están las diferencias con la definición, los archivos cambiados y las pruebas.

## Punto de partida

La presentación propone tres planes. Esto es lo que la app tiene hoy de cada uno:

| Plan (precio propuesto) | Lo que promete la presentación | Hoy en la app |
|---|---|---|
| **Gratis** | Ingresos, gastos y reserva del mes | Completo |
| **Pro** ($14.900 al mes) | Facturación electrónica con un proveedor aliado | No existe. Las facturas actuales son cuentas de cobro para imprimir, no facturas electrónicas válidas ante la DIAN |
| | Recordatorios | A medias. El Dashboard dice en qué mes declaras (tarjeta «Tus declaraciones») y el calendario guarda los plazos que anotas, pero la app no avisa |
| | Informes para el contador | A medias. Movimientos tiene «Exportar CSV», pero no hay un informe preparado |
| **Contador** ($59.900 al mes) | Gestionar varios clientes | No existe. Cada cuenta es de una sola persona |

## Decisiones (aprobadas)

| # | Pregunta | Propuesta | Por qué |
|---|---|---|---|
| 1 | ¿Algo de lo que existe hoy pasa a ser de pago? | **No.** Todo lo actual sigue en Gratis: movimientos, reserva, IVA y renta, cuentas de cobro, calendario, analítica, exportar CSV, moneda y copias de seguridad | Para no quitarle funciones a quien ya usa la app |
| 2 | ¿Qué incluye Pro en esta fase? | Dos funciones nuevas que sí se pueden construir completas: **Avisos de declaración** e **Informe para el contador**. La facturación electrónica aparece como «Próximamente»: no se incluye ni se cobra | Para no vender algo que no funciona |
| 3 | ¿Cómo se activa Pro si todavía no se puede pagar? | Con una **prueba gratis de 30 días** (una por cuenta) o con un **comando de administrador**. **No habrá botón de pago** | Un botón de pago que no cobra sería una demo disfrazada |
| 4 | ¿Se muestra el plan Contador? | Sí, en la pantalla de planes con la etiqueta «Próximamente» y sin botón | La presentación lo menciona, pero todavía no existe |
| 5 | ¿Se muestran los precios? | Sí, $14.900 y $59.900 al mes, con la nota «El pago en línea aún no está disponible» | Son precios propuestos: la app no cobra nada |

## Mapa de navegación

```
Configuración ── tarjeta «Tu plan» ──► Planes (#/planes) ──► «Probar Pro 30 días gratis» ──► Pro activo
      │
      └── tarjeta «Avisos de declaración» (Pro)

Dashboard ── aviso de declaración (Pro) ──► «Anotar el día exacto»  (crea un evento en el Calendario)
      │                                └──► «Ya la presenté»        (oculta ese aviso)
      └── «Informe para el contador» ─────┐
Movimientos ── «Informe para el contador» ┴──► Informe (#/informe)

Usuario Gratis + cualquier botón con la etiqueta «Pro» ──► diálogo «Esto es del plan Pro» ──► Planes
```

La barra inferior del celular ya tiene 5 accesos, así que **no se añade ninguno a la navegación**. Los planes se abren desde Configuración y el informe desde el Dashboard y Movimientos.

---

## Configuración → tarjeta «Tu plan» (nueva, la primera de la página)

| Bloque | Información | Al interactuar |
|---|---|---|
| Plan actual | «Gratis», «Pro» o «Pro de prueba: termina el 15 de diciembre (quedan 30 días)» si se activó el 16 de noviembre: 30 días contando el de activación | — |
| Qué incluye | Lista corta de lo que tienes con tu plan | — |
| «Ver planes» | — | Abre Planes |
| «Probar Pro 30 días gratis» | Solo aparece si estás en Gratis y nunca usaste la prueba | Pide confirmación, activa la prueba y muestra el mensaje «Tienes Pro hasta el …» |
| Nota | «El pago en línea aún no está disponible: llegará cuando CuentaClara esté publicada en internet.» | — |

## Pantalla: Planes (`#/planes`)

**Para qué sirve:** comparar los planes y saber qué incluye cada uno.

| Bloque | Información | Al interactuar |
|---|---|---|
| Cabecera | Título «Planes» y enlace «Volver a Configuración» | Vuelve a Configuración |
| Tarjeta Gratis | $0 · ingresos y gastos, reserva del mes, IVA y renta, cuentas de cobro, calendario, analítica y exportar CSV | Si es tu plan, muestra la etiqueta «Tu plan» |
| Tarjeta Pro | $14.900 al mes · todo lo de Gratis, más avisos de declaración, informe para el contador y facturación electrónica (**Próximamente**) | Botón «Probar 30 días gratis» si la prueba está disponible. «Tu plan» si ya lo tienes. Si ya usaste la prueba: «Prueba usada» y la nota del pago |
| Tarjeta Contador | $59.900 al mes · varios clientes en una cuenta | Etiqueta «Próximamente», sin botón |
| Nota final | Precios propuestos en pesos colombianos. El pago en línea aún no está disponible | — |
| Celular | Una tarjeta debajo de otra, en el mismo orden | — |

## Diálogo: «Esto es del plan Pro»

Aparece cuando un usuario Gratis toca una función Pro. Las funciones Pro **no se esconden**: se ven con la etiqueta «Pro».

| Elemento | Información | Al interactuar |
|---|---|---|
| Título | «Esto es del plan Pro» | — |
| Texto | Qué hace la función, en una frase. Por ejemplo: «Prepara en un clic el resumen del mes para tu contador, listo para imprimir o guardar en PDF.» | — |
| Botones | «Probar Pro 30 días gratis» (si la prueba está disponible), «Ver planes» y «Ahora no» | Activa la prueba y abre la función / abre Planes / cierra el diálogo |

---

## Función Pro: Avisos de declaración

**Para qué sirve:** que no se te pase ninguna declaración. Hoy el Dashboard solo dice el mes en que declaras. Con Pro, la app **te avisa** y te deja marcar cada declaración como presentada.

**Lo que la app no sabe:** el día exacto depende de los últimos dígitos de tu NIT y del decreto del calendario tributario de cada año. La app **no inventa ese día**: te avisa por mes y te deja anotar tú el día exacto.

### Dashboard → avisos (arriba del todo)

| Bloque | Información | Al interactuar |
|---|---|---|
| Aviso de IVA (solo si eres responsable de IVA) | «Declaras el IVA de enero–febrero 2027 en marzo de 2027 · estimado $X» (o «$X a favor»), con los mismos nombres de periodo que el Dashboard. Se ve desde el día 15 del mes anterior hasta el último día del mes en que declaras | — |
| Aviso de renta | «Entre agosto y octubre declaras la renta de 2026 (formulario 210), si estás obligado a declarar · estimado $X». Se ve desde el 15 de julio hasta el 31 de octubre | — |
| Si ya anotaste el día | «Declaras el 12 de marzo · faltan 5 días» | — |
| «Anotar el día exacto» | — | Pide la fecha y crea un evento de categoría «Fiscal / impuestos» en el Calendario. Desde entonces el aviso muestra ese día. Si borras el evento, el aviso vuelve a mostrar solo el mes |
| «Ya la presenté» | — | Oculta ese aviso, solo para ese periodo. Se puede deshacer en Configuración |
| Varios avisos a la vez | Como máximo 2, primero el más cercano | — |

### Configuración → tarjeta «Avisos de declaración»

| Bloque | Información | Al interactuar |
|---|---|---|
| Interruptores | «Avisar del IVA» y «Avisar de la renta». Los dos vienen activados | Al guardar, el Dashboard muestra o deja de mostrar esos avisos |
| Próximas declaraciones | Cada una con su estado: pendiente, día anotado o presentada | «Deshacer» en las que marcaste como presentadas |
| Usuario Gratis | La tarjeta se ve con la etiqueta «Pro» | Abre el diálogo Pro |

Los avisos se ven **al abrir la app**. No llegan por correo ni al celular, porque eso necesita la app publicada en internet y un servicio de correo (queda fuera de esta fase).

## Función Pro: Informe para el contador (`#/informe?mes=AAAA-MM` o `#/informe?anio=AAAA`)

**Para qué sirve:** entregarle a tu contador, en un solo documento, todo lo que necesita del periodo.

| Bloque | Información | Al interactuar |
|---|---|---|
| Acceso | Botón «Informe para el contador» en el Dashboard y otro junto a «Exportar CSV» en Movimientos | Abre el informe del mes que estabas viendo |
| Selector de periodo | Un mes o el año completo | Cambia el periodo (se guarda en la URL) |
| Encabezado | Tu nombre y NIT, el periodo y la fecha en que se generó | — |
| Resumen | Ingresos, gastos, beneficio y retenciones que te practicaron | — |
| IVA (si eres responsable) | Generado, descontable y saldo, con el mes en que se declara. Para un mes: el IVA del mes y el del periodo de IVA al que pertenece. Para el año: todos los periodos | — |
| Renta | El mismo desglose del Dashboard: ingresos; costos, o aportes y renta exenta; base; impuesto; retenciones; saldo | — |
| Gastos por categoría | Total de cada categoría | — |
| Facturas y cuentas de cobro | Número, fecha, cliente, total y estado | — |
| Movimientos | Fecha, concepto, categoría, base, IVA, retención y total | — |
| Pie | «Estimación hecha con tus movimientos. No es una declaración: revísala con tu contador.» | — |
| «Imprimir / Guardar PDF» | — | Abre el diálogo de impresión del navegador. En el papel no salen el menú ni los botones |
| «Descargar CSV» | — | Descarga los movimientos del periodo, con el mismo formato que Movimientos |
| Sin movimientos | «No hay movimientos en este periodo» | — |
| Moneda distinta del peso | El mismo aviso que el Dashboard: la estimación de renta en UVT no es válida | — |

Las cifras salen del **mismo cálculo que el Dashboard**, así que siempre coinciden.

---

## Cómo funciona por dentro

| Pieza | Regla |
|---|---|
| Plan de cada usuario | Gratis por defecto. Pasa a Pro con la prueba (30 días, una vez por cuenta) o porque lo activa el administrador, con fecha de fin opcional |
| Fin de la prueba | Al llegar la fecha vuelves a Gratis automáticamente. 3 días antes aparece un aviso en el Dashboard |
| Volver a Gratis | **No se borra nada.** Los avisos dejan de verse y el informe se bloquea. Tus datos, los días que anotaste y tus eventos se quedan, y vuelven a funcionar si regresas a Pro |
| Quién bloquea | El servidor bloquea las funciones Pro (error 403 `PLAN_REQUIRED`), no solo la pantalla |
| Comando de administrador | `npm run plan -- --email=… --plan=pro [--hasta=AAAA-MM-DD]` y `--plan=gratis` |
| Eliminar cuenta | Borra también el plan y los avisos |

API nueva (la que ya existe no cambia):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/plan` | Plan actual, cómo se activó, fecha de fin y si la prueba está disponible |
| POST | `/api/plan/trial` | Activa la prueba. Responde 409 si ya se usó |
| GET | `/api/report?month=AAAA-MM` o `?year=AAAA` | Datos del informe (Pro) |
| GET / PUT | `/api/reminders` | Avisos pendientes y preferencias (Pro) |
| PUT | `/api/reminders/:periodo` | Marcar como presentada, deshacer o enlazar el evento del día exacto (Pro) |

## Fuera de esta fase

- **Cobro en línea con una pasarela de pagos.** Necesita la app publicada y una cuenta de comercio a tu nombre.
- **Facturación electrónica ante la DIAN.** Necesita un proveedor tecnológico autorizado.
- **Plan Contador**, es decir, varios clientes en una misma cuenta.
- **Avisos por correo o al celular.**
- **Fechas exactas de la DIAN según el NIT.** Por ahora se anotan a mano.

## Qué no cambia

Movimientos, facturas, calendario, cálculos de impuestos, moneda, copias de seguridad y exportar CSV siguen igual y siguen siendo gratis. La tarjeta «Tus declaraciones» del Dashboard sigue mostrando el mes a todos los usuarios.

---

## Lo que se programó

### Diferencias con la definición

| Cambio | Por qué |
|---|---|
| El aviso de IVA solo sale si en el periodo hay ingresos o IVA descontable. En Configuración, los periodos sin nada registrado se marcan «Sin movimientos» | Sin operaciones en el periodo no se presenta el formulario 300 (art. 601 del Estatuto Tributario). Así no se avisa de una declaración que no corresponde. Revísalo con tu contador |
| El contenedor de la app usa una columna al imprimir (`print:block` en `app-shell.tsx`) | Al probar la impresión se vio que, con un ancho de escritorio (hoja horizontal), la columna vacía del menú se quedaba en el papel y el documento salía en una franja estrecha. Le pasaba también a las facturas impresas en horizontal. En pantalla no cambia nada |
| `toCsv` de Movimientos ahora se exporta | El informe descarga el CSV con exactamente el mismo formato. La función no cambia |

### Archivos cambiados

Calculado comparando la huella SHA-256 de cada archivo antes y después (sin contar `node_modules`, `dist` ni `data`). **82 archivos quedan idénticos.**

**Nuevos (11)**

| Archivo | Contenido |
|---|---|
| `server/migrations/005_plans.sql` | Tablas `plans`, `reminder_settings` y `reminder_states`, con borrado en cascada al eliminar la cuenta. Solo añade tablas, no toca datos |
| `server/plans.js` | Reglas del plan: Gratis por defecto, prueba de 30 días (una vez), Pro del administrador, bloqueo 403 `PLAN_REQUIRED` |
| `server/routes/plan.js` | `GET /api/plan` y `POST /api/plan/trial` |
| `server/routes/report.js` | `GET /api/report`: informe del mes o del año con las mismas funciones de cálculo que el Dashboard |
| `server/routes/reminders.js` | `GET/PUT /api/reminders` y `PUT /api/reminders/:clave`: ventanas de aviso, «Ya la presenté» y día exacto como evento del calendario |
| `scripts/plan.js` | Comando `npm run plan` del administrador |
| `web/src/components/plan.tsx` | Tarjeta «Tu plan», diálogo «Esto es del plan Pro», botón del informe, etiqueta Pro y aviso de fin de la prueba |
| `web/src/components/reminders.tsx` | Avisos del Dashboard, diálogo del día exacto y tarjeta «Avisos de declaración» |
| `web/src/pages/plans.tsx` | Pantalla Planes (`#/planes`) |
| `web/src/pages/report.tsx` | Pantalla Informe para el contador (`#/informe`) |
| `tests/plans.test.js` | 9 pruebas nuevas (ver abajo) |

**Modificados, solo para enganchar lo nuevo (10, más este documento y el README)**

| Archivo | Cambio |
|---|---|
| `server/app.js` | Registra las 3 rutas nuevas. `createApp` acepta un reloj (`now`) para las pruebas; por defecto, la hora real |
| `web/src/App.tsx` | Rutas `/planes` e `/informe` y el proveedor del diálogo Pro |
| `web/src/lib/session.tsx` | Carga el plan junto con la configuración (`plan`, `setPlan`, `refreshPlan`) |
| `web/src/lib/types.ts` | Tipos `Plan`, `Declaration`, `Reminders` y `Report` |
| `web/src/pages/dashboard.tsx` | Botón «Informe para el contador», avisos y aviso de fin de la prueba |
| `web/src/pages/movements.tsx` | Botón «Informe para el contador» junto a «Exportar CSV» y `export` de `toCsv` |
| `web/src/pages/settings.tsx` | Tarjetas «Tu plan» (la primera) y «Avisos de declaración» |
| `web/src/components/app-shell.tsx` | `print:block` (ver diferencias) |
| `tests/helpers.js` | `startServer({ now })` para controlar la fecha en las pruebas |
| `package.json` | Script `plan` |

Ningún archivo de cálculos (`server/calc.js`, `server/tax-co.js`), movimientos, facturas, calendario, autenticación ni copias de seguridad ha cambiado.

### Verificación

**Pruebas automáticas.** `npm test` pasa **117/117**: las 108 anteriores sin cambios y 9 nuevas. Las nuevas comprueban:

- un usuario Gratis recibe 403 en el informe y los avisos, y todo lo anterior le sigue funcionando;
- la prueba dura 30 días, se activa una sola vez, el último día sigue en Pro y al día siguiente vuelve sola a Gratis;
- el comando `npm run plan` activa y quita Pro, y da error con un email inexistente, un plan desconocido o una fecha pasada;
- al volver a Gratis no se borra nada, y lo marcado reaparece al volver a Pro;
- el informe tiene las mismas cifras que el Dashboard: IVA, renta y totales del mes, y periodos de IVA y renta del año;
- los avisos aparecen y desaparecen en sus fechas exactas. IVA: del 15 del mes anterior al último día del mes en que declaras. Renta: del 15 de julio al 31 de octubre;
- «Ya la presenté» y «Deshacer»; las preferencias de avisos;
- el día exacto crea un evento «Fiscal / impuestos». Si se cambia, se mueve el mismo evento; si se mueve en el Calendario, el aviso lo sigue; si se borra, el aviso vuelve a mostrar el mes;
- sin avisos de IVA para quien no es responsable; periodos bimestrales;
- eliminar la cuenta borra el plan, los avisos y los eventos.

`npm run typecheck`: sin errores.

**En el navegador** (servidor aparte en el puerto 3300, con una base de datos de prueba ya borrada):

| Paso | Resultado |
|---|---|
| Gratis: botón del informe con etiqueta Pro | Abre «Esto es del plan Pro» |
| Configuración en Gratis | «Tu plan: Gratis» y la tarjeta de avisos bloqueada |
| Planes | Las 3 columnas: Gratis como tu plan, Pro con «Probar 30 días gratis», Contador «Próximamente» |
| «Probar Pro 30 días gratis» desde el diálogo | Activa la prueba («Tienes Pro hasta el 16 de diciembre de 2026»; tras el ajuste del 17/11, el 15 de diciembre: 30 días contando el de activación) y abre el informe |
| Informe de noviembre | Coincide con el Dashboard (comprobado también con la API: renta, IVA e ingresos idénticos) |
| Aviso de IVA (bimestral, sep–oct, se declara en noviembre) | Visible, con el estimado correcto ($ 794.200 = 817.000 de IVA generado − 22.800 descontable) |
| «Anotar el día exacto» | Sin fecha da error; con el 19/11 el aviso dice «faltan 3 días» y el evento aparece en el Calendario |
| «Ya la presenté» → Configuración → «Deshacer» | El aviso desaparece; sale «Presentada»; al deshacer vuelve a «Avisando» |
| Prueba con 2 días restantes | Aviso violeta de fin de la prueba en el Dashboard |
| Prueba terminada | Sin avisos; botón del informe con etiqueta Pro; «Tu prueba de Pro terminó el 15 de noviembre de 2026»; el informe muestra «Esto es del plan Pro» sin botón de prueba |
| Celular (375 px), modo oscuro | Dashboard, Planes, Informe (mes y año), Configuración y Movimientos sin desplazamiento horizontal |
| Impresión (PDF con Chrome, A4 vertical y horizontal, modo claro y oscuro) | Fondo blanco, sin menú ni botones, el documento ocupa el ancho de la hoja (probado con 26 movimientos) |
| Consola | Solo los 401 y 403 esperados (antes de iniciar sesión y en Gratis) |

**Tu base de datos real** (`data/app.db`): la migración se probó sobre una copia. Resultado: integridad correcta, sin claves rotas, los mismos usuarios, movimientos y configuración, y tu cuenta queda en Gratis. El archivo original no se modificó. La migración se aplicará sola la próxima vez que abras la app.

**No probado:**

- el diálogo de impresión real del navegador (se probó el PDF generado por Chrome sin interfaz);
- la descarga del CSV desde el informe (usa la misma función que Movimientos, que no cambió);
- el comando `npm run plan` en macOS y Linux.

---

## Ajuste posterior: cuenta de creador y saludo con cargo (16/11/2026)

**Pedido:** «Hola CEO Alejandro Monsalve», con el nombre un poco más grande, en negrita y en blanco fuerte.

| Qué | Cómo |
|---|---|
| Cuenta del creador | `npm run plan -- --email=… --plan=pro`: Pro activado por el administrador, sin fecha de fin. Antes se hizo una copia de seguridad |
| Saludo del Dashboard | Según el boceto del usuario: «**Hola CEO Alejandro**», con «Hola» incluido, todo en negrita, como un segundo título bajo «Dashboard». Mide 22 px en celular y 26 px desde 640 px, y debajo va «Así va tu actividad.» en pequeño. En modo oscuro es blanco puro (`#fff`); en modo claro, casi negro, porque el blanco no se vería sobre el fondo claro |
| Nombre | Solo el primer nombre, con mayúscula inicial («alejandro monsalve» → «Alejandro»). El nombre guardado no cambia |
| Cargo | Campo opcional nuevo «Cargo en el saludo» en Configuración → Sesión, de máximo 40 caracteres. Tu cuenta tiene «CEO». No aparece en facturas ni en el informe |

**Archivos.**
- Nuevos:
  - `server/migrations/006_title.sql`: columna `settings.title`, vacía por defecto;
  - `tests/greeting.test.js`: 2 pruebas.
- Modificados:
  - `server/routes/settings.js`: guarda el cargo y lo conserva si la petición no lo trae, como hacen las tarjetas de moneda y de datos tributarios;
  - `web/src/lib/types.ts`;
  - `web/src/pages/dashboard.tsx`: el saludo;
  - `web/src/pages/settings.tsx`: el campo «Cargo».

**Verificación.**
- `npm test`: **119/119** (las 117 anteriores y 2 nuevas: el cargo se guarda, se recorta, se conserva al guardar otras tarjetas, se puede quitar, se valida y es de cada usuario).
- `npm run typecheck`: sin errores.
- En el navegador, con un servidor de prueba:
  - modo oscuro: «Hola CEO Alejandro» en blanco `rgb(255, 255, 255)`, 26 px, peso 700;
  - celular (375 px): 22 px, en una sola línea y sin desplazamiento horizontal;
  - el campo de Configuración guarda el cargo («Fundador») y el saludo cambia.
- En tu base de datos real, con copia de seguridad previa: integridad correcta y el cargo «CEO» guardado.
