# 10. Plan Contador

> Fase 10: pantallas definidas **antes** de programar y aprobadas el 16/11/2026. Programado y verificado ese mismo día. Al final del documento están lo que se programó, los archivos cambiados y las pruebas.

## Punto de partida

| | Hoy en la app |
|---|---|
| Plan Contador | En Planes aparece «Próximamente», a $59.900 al mes, sin botón ni cobro |
| Cuentas | Cada cuenta ve solo sus propios datos. El servidor filtra todo por el usuario que inició sesión |
| Dónde corre | En el computador de cada persona, con su propia base de datos (`data/app.db`) |

**El límite más importante:** un contador no puede ver los datos de un cliente que están en otro computador. El plan Contador se puede programar y probar con varias cuentas en el mismo servidor, pero **para usarlo de verdad hay que publicar la app en internet**. Publicarla no entra en esta fase.

## Decisiones (aprobadas)

| # | Pregunta | Propuesta | Por qué |
|---|---|---|---|
| 1 | ¿Cómo consigue el contador acceso a un cliente? | **Solo si el cliente lo invita** desde su Configuración, con su autorización explícita, y puede **quitarle el acceso** cuando quiera | Son datos tributarios y personales. La Ley 1581 de 2012 (protección de datos personales) exige la autorización del titular |
| 2 | ¿Qué puede hacer el contador con los datos del cliente? | **Solo ver y descargar** (solo lectura). No puede crear, editar ni borrar nada del cliente | Editar los libros de otra persona es más riesgoso: queda para una fase posterior |
| 3 | ¿Qué ve el contador de cada cliente? | Resumen (Dashboard), Movimientos, Facturas, sus declaraciones y el Informe para el contador. **No** ve su Calendario ni su Configuración | Lo que necesita para su trabajo, nada más (Ley 1581: principios de finalidad y de acceso y circulación restringida) |
| 4 | ¿Cuántos? | **Un contador por cliente**; un contador puede tener **clientes ilimitados** | Lo habitual; más de un contador por cliente complica permisos sin necesidad ahora |
| 5 | ¿Quién paga? | Invitar a tu contador es **gratis** para el cliente (en Gratis o en Pro). Paga el contador con el plan Contador ($59.900 al mes), que **incluye todo Pro** para sus propios libros y el informe de cualquiera de sus clientes | El cliente no tiene por qué pagar para que su contador lo atienda |
| 6 | ¿Cómo se activa el plan Contador si todavía no se cobra? | Solo **por el administrador**: `npm run plan -- --email=… --plan=contador`. **Sin prueba gratis automática** | Es un plan para profesionales: se activa a mano mientras no haya cobro en línea |
| 7 | ¿Dónde entra el contador a sus clientes? | **Escritorio:** «Clientes» en la barra lateral. **Celular:** una tarjeta «Tus clientes» arriba del Dashboard (la barra inferior ya tiene 5 accesos y no se añade un sexto) | Mismo criterio que en la fase 9 |
| 8 | ¿Se avisa por correo? | **No.** La invitación se ve dentro de la app: el cliente le dice a su contador que entre | La app no tiene servicio de correo (eso necesita publicarla) |

## Mapa de navegación

```
CLIENTE
Configuración ── tarjeta «Mi contador» ──► invitar (correo + autorización) ──► Pendiente ──► Activo
                                       └─► «Quitar acceso» (en cualquier momento)

CONTADOR
Barra lateral «Clientes» / tarjeta «Tus clientes» del Dashboard (celular)
   └─► Panel de clientes (#/clientes)
         ├─► Invitaciones pendientes ──► «Aceptar» / «Rechazar»
         └─► Cliente ──► «Ver» ──► Modo cliente, solo lectura (#/clientes/:id/…)
                                    ├─ Resumen ─ Movimientos ─ Facturas ─ Informe
                                    └─ «Salir» ──► Panel de clientes
```

---

## Cliente: Configuración → tarjeta «Mi contador» (nueva)

Disponible para todos los planes (Gratis y Pro).

| Estado | Información | Al interactuar |
|---|---|---|
| Sin contador | «Dale acceso de solo lectura a tu contador para que vea tus movimientos, facturas e informes.» Campo «Correo de tu contador» y casilla de autorización (texto abajo) | «Invitar» se activa solo con un correo válido y la casilla marcada. Crea la invitación y pasa a Pendiente |
| Pendiente | «Invitaste a ana@contadores.co el 16 de noviembre de 2026. Tu contador debe entrar a CuentaClara con ese correo y aceptar.» | «Cancelar invitación» |
| Activo | «ana@contadores.co (Ana Gómez) puede ver tus datos desde el 17 de noviembre de 2026.» y «Último acceso: hoy a las 10:42» | «Quitar acceso» pide confirmación y el contador deja de ver tus datos al instante |
| Tu contador no tiene el plan activo | «Ana Gómez no puede ver tus datos ahora: su plan Contador no está activo.» | «Quitar acceso» |
| Rechazada | «ana@contadores.co rechazó la invitación.» | Puedes invitar a otro correo |

**Texto de autorización (casilla obligatoria):**
«Autorizo a esta persona a ver, en solo lectura, mis movimientos, facturas, declaraciones e informes de CuentaClara, para la gestión de mis impuestos. Puedo quitarle el acceso cuando quiera.»

Reglas:
- **No se revela si un correo tiene cuenta.** La respuesta es la misma exista o no, para que nadie pueda averiguar quién usa CuentaClara.
- **No te puedes invitar a ti mismo.**
- **Máximo 10 invitaciones por día por cuenta**, para evitar abusos.

## Contador: Panel de clientes (`#/clientes`)

**Para qué sirve:** ver de un vistazo qué cliente necesita atención primero.

```
Clientes (3)                                         [Buscar por nombre o NIT]

Invitaciones pendientes
  Estudio Gómez S.A.S. · gomez@correo.co · 16/11/2026          [Rechazar] [Aceptar]

Cliente                  Próxima declaración          Reserva del mes   Avisos
Estudio Pérez · NIT …    IVA sep–oct · 19 nov (3 días)   $ 794.200        1      [Ver] [Informe]
María López · C.C. …     Renta 2026 · ago–oct 2027       $ 0              —      [Ver] [Informe]
```

| Bloque | Información | Al interactuar |
|---|---|---|
| Invitaciones pendientes | Nombre o razón social del cliente, su correo y la fecha | «Aceptar» lo pasa a tu lista. «Rechazar» lo quita, y el cliente lo ve como rechazada |
| Buscar | Por nombre, razón social o NIT | Filtra la lista al momento |
| Lista de clientes | Nombre o razón social y NIT; próxima declaración (tipo, periodo y mes, o el día que anotó el cliente, con los días que faltan); reserva de impuestos del mes actual; número de avisos activos | Ordenada por la declaración más cercana. «Ver» entra al modo cliente. «Informe» abre su informe del mes actual |
| «Dejar de atender» (en el menú de cada cliente) | — | Pide confirmación. El cliente desaparece de tu lista y en su Configuración ve que ya no tiene contador |
| Sin clientes | «Aún no tienes clientes. Pídeles que te inviten desde Configuración → Mi contador con tu correo: ana@contadores.co» | — |
| Sin plan Contador | «Esto es del plan Contador»: qué incluye y que lo activa el administrador. Tus vínculos con clientes no se borran | «Ver planes» |
| Celular | Cada cliente es una tarjeta; los botones «Ver» e «Informe» ocupan el ancho | — |

## Contador: Modo cliente, solo lectura (`#/clientes/:id/...`)

Son **las mismas pantallas** que el cliente ve en su app, con sus datos, en solo lectura.

| Elemento | Información | Al interactuar |
|---|---|---|
| Franja fija arriba (violeta) | «Estás viendo a **Estudio Pérez** (NIT 1020…) · Solo lectura» | «Salir» vuelve al Panel de clientes |
| Pestañas | Resumen · Movimientos · Facturas · Informe | Cambian de pantalla sin salir del cliente |
| Resumen | El Dashboard del cliente, con su selector de mes, su reserva, «Tus declaraciones» y su analítica, y la lista de sus próximas declaraciones con su estado (pendiente, día anotado, presentada) | Sin «+ Ingreso» ni «+ Gasto» y sin los botones de los avisos |
| Movimientos | Sus filtros, totales y lista | Sin «Editar» ni «Eliminar». «Exportar CSV» sí |
| Facturas | Su lista y el detalle de cada factura | Sin crear, editar, cobrar ni eliminar. «Imprimir / PDF» sí |
| Informe | El Informe para el contador del cliente, de un mes o un año | «Imprimir / Guardar PDF» y «Descargar CSV» |
| Acceso quitado mientras lo ves | «Este cliente ya no te da acceso.» | Vuelve al Panel de clientes |

La barra lateral sigue siendo la tuya: «Dashboard», «Movimientos», etc. son **tus** libros; el cliente solo se ve dentro de la franja violeta.

## Otros cambios de pantalla

| Pantalla | Cambio |
|---|---|
| Planes | La tarjeta Contador deja de decir «Próximamente»: muestra lo que incluye (todo Pro, clientes ilimitados en solo lectura, informe de cada cliente) y «Lo activa el administrador». Si es tu plan, «Tu plan» |
| Configuración → «Tu plan» | Para un contador: «Contador · activado por el administrador» y la lista de lo que incluye |
| Dashboard del contador (celular) | Tarjeta «Tus clientes (3) · 1 invitación pendiente» con el botón «Ver clientes» |

---

## Cómo funciona por dentro

| Pieza | Regla |
|---|---|
| Plan Contador | Nuevo nivel del plan, por encima de Pro (tiene todo lo de Pro). Lo activa el administrador con `--plan=contador`, con fecha de fin opcional |
| Vínculo cliente–contador | Guarda el cliente, el correo invitado, el contador (cuando acepta), el estado (pendiente, activo, rechazado), las fechas y el último acceso. Uno por cliente |
| Quién puede leer | El servidor solo entrega datos de un cliente si quien pide tiene el plan Contador activo **y** un vínculo activo con ese cliente. Si no, responde **404**, como si no existiera, para no revelar nada |
| Solo lectura | Las rutas del contador sobre un cliente son **solo GET**. Cualquier otro método responde 405 |
| Registro de accesos | Cada lectura actualiza «Último acceso», que el cliente ve en su tarjeta |
| Quitar acceso o dejar de atender | Efecto inmediato en la siguiente petición |
| Fin del plan del contador | Deja de ver a sus clientes (403 `PLAN_REQUIRED`); los vínculos no se borran y vuelven a funcionar si recupera el plan |
| Eliminar cuenta | Si la elimina el cliente o el contador, se borran sus vínculos |

API nueva (la que ya existe no cambia):

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| GET | `/api/accountant` | Cliente | Su contador e invitación: estado, fechas y último acceso |
| POST | `/api/accountant` | Cliente | Invitar: `{ email, authorize: true }` |
| DELETE | `/api/accountant` | Cliente | Cancelar la invitación o quitar el acceso |
| GET | `/api/clients` | Contador | Clientes con su resumen e invitaciones pendientes |
| POST | `/api/clients/invitations/:id/accept` y `/reject` | Contador | Aceptar o rechazar |
| DELETE | `/api/clients/:id` | Contador | Dejar de atender |
| GET | `/api/clients/:id/summary`, `/analytics`, `/movements`, `/invoices`, `/invoices/:inv`, `/report`, `/reminders` | Contador | Los mismos datos que el cliente ve en su app, en solo lectura |

## Fuera de esta fase

- **Publicar la app en internet**, que hace falta para usar el plan de verdad.
- **Editar los libros del cliente** desde la cuenta del contador.
- **Avisos por correo** (invitaciones, declaraciones).
- **Cobro en línea** del plan Contador.
- **Varios contadores** por cliente, o un equipo dentro de una firma contable.
- **Presentar declaraciones ante la DIAN** desde la app.

## Qué no cambia

Las cuentas sin contador funcionan exactamente igual. **Nada se comparte sin invitación del cliente.** Los planes Gratis y Pro, la prueba de 30 días, los avisos y el informe siguen como en la fase 9.

---

## Lo que se programó

### Detalles que no estaban en la definición

| Detalle | Por qué |
|---|---|
| Ruta `GET /api/clients/:id` (datos del cliente para la franja y la cabecera de sus facturas: nombre, NIT, dirección, IVA, moneda) | Para que la factura del cliente salga con sus datos de emisor y no con los del contador. No incluye su configuración (ni el cargo ni los porcentajes por defecto) |
| Las rutas de lectura del contador reutilizan **las mismas funciones** que usa el cliente en su app | Lo que ve el contador coincide siempre con lo que ve el cliente. Las pruebas lo comparan respuesta por respuesta |
| En el modo cliente, el Resumen tiene la tarjeta «Sus declaraciones», y los importes salen con la moneda del cliente | Así el contador ve el estado de cada declaración. Al salir del modo cliente se vuelve a tu moneda |
| En Planes, si eres Contador, la tarjeta Pro dice «Incluido en tu plan Contador» | Contador incluye todo Pro |
| Rechazar una invitación o «Dejar de atender» funcionan aunque el contador no tenga el plan activo | Para que siempre se pueda cortar un vínculo |
| En el celular, las 4 pestañas del modo cliente van en una sola fila | Así no hay desplazamiento horizontal |

### Archivos cambiados

Calculado comparando la huella SHA-256 de cada archivo antes y después (sin contar `node_modules`, `dist` ni `data`). **90 archivos quedan idénticos.**

**Nuevos (6)**

| Archivo | Contenido |
|---|---|
| `server/migrations/007_accountant.sql` | Columna `plans.tier` (`pro` o `contador`, por defecto `pro`), tabla `accountant_links` (vínculo cliente–contador, con borrado en cascada) y `accountant_invites` (límite diario). No toca datos existentes |
| `server/routes/accountant.js` | Rutas del cliente (`/api/accountant`) y del contador (`/api/clients…`): invitar, aceptar, rechazar, quitar, dejar de atender, panel y lectura **solo GET** |
| `web/src/lib/scope.tsx` | «Ámbito» de las pantallas: tu cuenta, o el cliente en solo lectura |
| `web/src/components/accountant.tsx` | Tarjeta «Mi contador» y acceso «Tus clientes» del Dashboard en el celular |
| `web/src/pages/clients.tsx` | Panel de clientes y modo cliente (franja, pestañas y pantallas) |
| `tests/accountant.test.js` | 7 pruebas (ver abajo) |

**Modificados (16)**

| Archivo | Cambio |
|---|---|
| `server/plans.js` | Nivel Contador: incluye Pro; `requireContador` |
| `scripts/plan.js` | `--plan=contador` |
| `server/app.js` | Registra las rutas nuevas |
| `server/routes/report.js` | El informe pasa a una función (`buildReport`) que también usa el contador. Mismo resultado |
| `server/routes/reminders.js` | Igual con los avisos (`reminderData`). Mismo resultado |
| `web/src/pages/dashboard.tsx`, `movements.tsx`, `invoices.tsx`, `report.tsx` | Leen del ámbito: en tu cuenta, todo igual que antes; en el modo cliente, piden los datos a `/api/clients/:id/…` y **ocultan crear, editar, cobrar y borrar** |
| `web/src/pages/settings.tsx` | Tarjeta «Mi contador» |
| `web/src/pages/plans.tsx` | La tarjeta Contador deja de ser «Próximamente» |
| `web/src/components/plan.tsx` | El plan Contador cuenta como Pro; nombre y lista de funciones |
| `web/src/components/reminders.tsx` | Igual, y la tarjeta «Sus declaraciones» del modo cliente |
| `web/src/components/app-shell.tsx` | «Clientes» en la barra lateral, solo para contadores |
| `web/src/App.tsx` | Rutas `#/clientes…`; vuelve a tu moneda fuera del modo cliente |
| `web/src/lib/types.ts` | Tipos nuevos |

No han cambiado los cálculos (`calc.js`, `tax-co.js`) ni la autenticación, las copias de seguridad, el calendario, los movimientos o las facturas del servidor.

### Verificación

**Pruebas automáticas.** `npm test` pasa **126/126**: las 119 anteriores sin cambios y 7 nuevas.

- El plan Contador lo activa el comando del administrador e incluye Pro: informe, avisos y sin prueba gratis. Pro no da acceso al panel (403).
- Invitar exige autorización y un correo válido. No permite invitarse a uno mismo. Responde **exactamente igual** exista o no la cuenta. Solo permite una invitación a la vez y **10 por día**.
- El contador acepta y ve **lo mismo** que el cliente: resumen, analítica, movimientos, facturas y detalle de factura, comparados respuesta por respuesta. También el informe y las declaraciones, aunque el cliente esté en Gratis. No ve su calendario ni su configuración. «Último acceso» se actualiza.
- **Solo lectura:** 10 intentos de escritura (crear, editar o borrar movimientos y facturas, y cambiar resumen, informe, avisos o el cliente) responden 405, y los datos del cliente no cambian.
- **Sin vínculo activo o sin plan no ve nada:**
  - otro contador recibe 404;
  - una invitación pendiente da 404;
  - un cliente no tiene panel (403);
  - si el plan vence, da 403 y el cliente lo ve como «sin plan activo»; al recuperar el plan vuelve a funcionar;
  - si el cliente quita el acceso, da 404 al instante.
- Rechazar, invitar de nuevo, dejar de atender. Una invitación dirigida a otro correo no se puede aceptar.
- Eliminar la cuenta del cliente o la del contador borra el vínculo.

`npm run typecheck`: sin errores.

**En el navegador**, con un servidor de prueba (base de datos ya borrada) y dos cuentas, el cliente «Estudio Pérez E2E» y la contadora «Ana Contadora»:

| Paso | Resultado |
|---|---|
| Contadora: barra lateral | Aparece «Clientes» debajo de Dashboard |
| Panel con invitación pendiente | Nombre, correo y fecha local. «Aceptar» lo pasa a la lista |
| Lista de clientes | Próxima declaración «IVA septiembre–octubre 2026 · se declara en noviembre de 2026», reserva del mes $ 779.000 y 1 aviso |
| «Ver» → modo cliente | Franja «Estás viendo a Estudio Pérez E2E (NIT …) · Solo lectura», pestañas y «Sus declaraciones» con su estado |
| Botones en el modo cliente | Resumen: solo el informe. Movimientos: «Exportar CSV», «Informe» y «Ver factura». Facturas: solo «Ver». Detalle: solo «Imprimir / PDF», con los datos de emisor **del cliente**. Informe: «Descargar CSV» e «Imprimir». Ningún botón de crear, editar, cobrar o borrar |
| Cliente: «Mi contador» | «ana.e2e@test.local (Ana Contadora) puede ver tus datos desde el 16 de noviembre de 2026 · Activo · Último acceso: hoy a las 23:25» |
| «Quitar acceso» (con confirmación) | Vuelve el formulario. Invitar desde el formulario (correo y casilla) lo deja en «Pendiente» |
| Contadora tras quitarle el acceso | «No puedes ver este cliente: Este cliente ya no te da acceso o no existe», y la invitación nueva aparece como pendiente |
| Celular (375 px), modo oscuro | Sin desplazamiento horizontal en el panel, las 5 pantallas del modo cliente, Dashboard, Planes y Configuración. Tarjeta «Tus clientes (1)» en el Dashboard |
| Planes y «Tu plan» de la contadora | «Contador · Tu plan · Activado por el administrador, sin fecha de fin»; Pro «Incluido en tu plan Contador» |
| Consola | Solo los 401 y 404 esperados |

**Tu cuenta:** con una copia de seguridad previa, pasó a **Contador** (incluye Pro). Integridad correcta, los mismos datos y el cargo «CEO».

**No probado:**

- con clientes reales, porque necesita la app publicada en internet;
- la impresión desde el modo cliente en el diálogo real del navegador (usa la misma vista de impresión que ya se probó en la fase 9).

---

## Ajustes tras la revisión final (17/11/2026)

Arreglos de lo que encontró la revisión, que se puede resolver sin publicar la app:

| Problema | Arreglo |
|---|---|
| «Hoy» dependía del huso horario del servidor: en la nube (UTC) el día cambiaría a las 7 p. m. de Colombia | «Hoy» se calcula siempre en hora de Colombia. Se puede cambiar con la variable `APP_TIMEZONE` (por defecto `America/Bogota`). Afecta a los avisos, la prueba gratis, el límite de invitaciones, la fecha de cobro por defecto y el mes inicial del Dashboard |
| Sin HSTS detrás de HTTPS | Con `COOKIE_SECURE=1` la app envía `Strict-Transport-Security` (un año). Sin esa variable, como en tu computador, no la envía |
| La prueba gratis duraba 31 días contando el de activación | Ahora son **30 días exactos**: si se activa el 17/11, el último día es el 16/12. «Quedan N días» cuenta hoy, y el último día dice «hoy es el último día» |
| En el panel, la reserva de cada cliente salía con la moneda del contador | Sale con la moneda del cliente |
| «Último acceso» se apuntaba aunque la lectura fallara | Solo se apunta si la lectura sale bien |
| El registro del límite de invitaciones crecía sin fin | Se borran los de días anteriores al invitar |
| En Planes, «Pro» y «Contador» salían dos veces (título y etiqueta) | Solo el título |
| `docs/05` hablaba de impuestos de España | Nota al principio con el estado actual de cada pendiente |

**Archivos** (por huella SHA-256; 100 idénticos):
- **Nuevo:** `tests/hardening.test.js`.
- **Modificados:**
  - servidor: `server/calc.js` (solo `todayLocal`), `server/app.js`, `server/plans.js`, `server/routes/accountant.js`;
  - interfaz: `web/src/components/plan.tsx`, `web/src/lib/types.ts`, `web/src/pages/clients.tsx`, `web/src/pages/plans.tsx`;
  - pruebas: `tests/accountant.test.js`, `tests/plans.test.js`;
  - documentos: `docs/05-informe-pruebas.md`, `docs/09-planes.md`, este documento y `README.md`.

**Verificación.**
- `npm test`: **130/130** (las 126 anteriores, con la prueba de 30 días ajustada, y 4 nuevas).
- Las nuevas comprueban:
  - el día de Colombia a las 10 p. m. en un servidor en UTC, incluidos los cambios de mes y de año;
  - HSTS solo con `COOKIE_SECURE=1`;
  - el «Último acceso» y la moneda del cliente;
  - la limpieza del registro de invitaciones.
- `npm run typecheck`: sin errores.
- En el navegador (servidor de prueba, ya borrado):
  - prueba gratis activada el 17/11 → hasta el 16/12, «quedan 30 días»;
  - cliente en dólares → «$285.00» en el panel;
  - Planes con títulos sin repetir.

**Sigue pendiente** (necesita publicar la app o decisiones externas):
- HTTPS en el servidor;
- verificar el correo y recuperar la contraseña (necesitan un servicio de correo);
- política de tratamiento de datos (Ley 1581);
- límite de registros detrás de un proxy;
- facturación electrónica DIAN.
