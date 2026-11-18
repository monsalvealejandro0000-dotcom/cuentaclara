# 11. Cobro manual de los planes

> Fase 11: pantallas definidas **antes** de programar y aprobadas el 17/11/2026. Programado y verificado ese mismo día. Al final del documento están cómo activarlo, los archivos cambiados y las pruebas.

## Punto de partida

| | Hoy en la app |
|---|---|
| Comprar un plan | No se puede. Planes muestra los precios y la nota «El pago en línea aún no está disponible» |
| Conseguir Pro | Con la prueba gratis de 30 días (una vez por cuenta) o porque lo activa el administrador (`npm run plan`) |
| Conseguir Contador | Solo lo activa el administrador |

**La idea:** el cliente paga **por fuera de la app**, a una cuenta tuya (transferencia, Nequi, Daviplata…), y le cuenta a la app que pagó. Tú revisas en tu banco que el dinero llegó y activas el plan con un comando.

- **La app nunca recibe ni mueve dinero.**
- **No hay botón de «pagar» que finja cobrar.**
- **El plan nunca se activa solo.**

**El límite de siempre:** los clientes solo pueden entrar a pagar cuando la app esté **publicada en internet**. En tu computador se puede programar y probar con cuentas de prueba.

## Decisiones (aprobadas)

| # | Pregunta | Propuesta | Por qué |
|---|---|---|---|
| 1 | ¿Dónde se ponen tus datos para recibir pagos? | En un archivo que configuras tú: **`data/cobro.json`**. La carpeta `data/` no se versiona. Cada método lleva su nombre y lo que el cliente necesita saber (p. ej. «Nequi · 3XX XXX XXXX a nombre de …»). **Si el archivo no existe, «Comprar» no aparece** y Planes sigue como hoy | Tus datos no van en el código. Sin datos reales no se muestran instrucciones inventadas |
| 2 | ¿Cómo demuestra el cliente que pagó? | Con un formulario **«Ya pagué»**: método, fecha, valor y número de comprobante o de transacción. **Sin subir fotos** en esta fase | Subir archivos exige guardar imágenes con datos personales y revisar que no sean peligrosos. Para verificar basta con buscar el pago en tu banco |
| 3 | ¿Quién activa el plan? | **Solo tú**, con un comando: `npm run pagos` muestra los pagos por revisar; `--aprobar=…` activa el plan y `--rechazar=… --motivo="…"` lo rechaza | La app no puede saber si el dinero llegó de verdad. Hoy no hay pantalla de administrador; se usa el mismo estilo que `npm run plan` |
| 4 | ¿Cuánto tiempo compra? | **1, 3, 6 o 12 meses**, al precio mensual: Pro $14.900 y Contador $59.900. **Sin descuentos** por ahora. Cada mes son 30 días | Simple de entender y de verificar. Los descuentos los decides tú más adelante |
| 5 | ¿Qué pasa al renovar antes de que venza? | Los meses nuevos **se suman desde la fecha de fin actual**, no desde hoy | El cliente no pierde los días que ya pagó |
| 6 | ¿Cuántas solicitudes a la vez? | **Una pendiente por cuenta**. Se puede cancelar mientras está pendiente | Evita duplicados y confusiones al revisar |
| 7 | ¿Se avisa antes de vencer? | Sí: **7 días antes**, un aviso en el Dashboard con «Renovar». Al vencer vuelve a Gratis **sin borrar nada** (como hoy) | Lo mismo que la prueba gratis, con más margen para pagar |
| 8 | ¿Y la factura del cobro? | La emites **tú, por fuera de la app**. Si estás obligado a facturar, con factura electrónica | La facturación electrónica ante la DIAN queda fuera de esta fase |

## Mapa de navegación

```
CLIENTE
Planes (#/planes) ── «Comprar» (Pro o Contador) ──► Pagar plan (#/planes/pagar?plan=pro)
                                                      1. elige meses → total
                                                      2. paga por fuera con su referencia
                                                      3. «Ya pagué» → formulario → «Enviar»
                                                            │
Configuración → «Tu plan» ◄── estado: En revisión → Aprobado (Pro hasta …) / Rechazado (motivo)
Dashboard ◄── 7 días antes de vencer: «Tu plan Pro vence el … · Renovar» ──► Pagar plan

TÚ (administrador, en la terminal)
npm run pagos                      → pagos por revisar
npm run pagos -- --aprobar=12      → activa el plan por los meses pagados
npm run pagos -- --rechazar=12 --motivo="No llegó el dinero"
```

---

## Pantalla: Planes (`#/planes`), cambios

| Situación | Tarjeta Pro / Contador |
|---|---|
| Hay `data/cobro.json` y no tienes ese plan | Botón **«Comprar»**. Pro sigue mostrando también «Probar 30 días gratis» si no la usaste |
| Ya tienes ese plan, pagado o activado por el administrador | «Tu plan · hasta el …» y botón **«Renovar»** |
| Tienes un pago en revisión | «Pago en revisión» y enlace «Ver estado» (Configuración), sin botón |
| No hay `data/cobro.json` | Como hoy: «El pago en línea aún no está disponible…» y sin «Comprar» |

La nota final cambia a: «Precios en pesos colombianos. Pagas por fuera de la app y el plan se activa cuando se confirma tu pago».

## Pantalla nueva: Pagar plan (`#/planes/pagar?plan=pro` o `?plan=contador`)

**Para qué sirve:** que el cliente sepa cuánto pagar, a dónde y cómo avisar que pagó.

| Bloque | Información | Al interactuar |
|---|---|---|
| Cabecera | «Comprar Pro» o «Comprar Contador», con «Volver a Planes» | — |
| 1. Cuánto | Selector de 1, 3, 6 o 12 meses. **Total** en pesos (p. ej. 3 meses de Pro = $44.700). Si renuevas: «Tu plan quedará hasta el …» | Cambiar los meses recalcula el total y la fecha |
| 2. Cómo pagar | Los métodos de `data/cobro.json`, cada uno con sus datos y un botón **«Copiar»**. **Tu referencia de pago**: un código fijo de tu cuenta (p. ej. `CC-7F3K2Q`), con su botón «Copiar». «Escribe la referencia en la descripción del pago» | «Copiar» copia el dato y muestra «Copiado» |
| 3. Avisar que pagaste | Formulario **«Ya pagué»**: método (de la lista), fecha del pago (no futura), valor pagado (lleno con el total), número de comprobante o transacción (obligatorio, máx. 60) y nota (opcional, máx. 300). Casilla: «Confirmo que hice este pago». Aviso: «**Nunca** escribas contraseñas, claves ni números de tarjeta» | «Enviar» se activa con la casilla marcada. Errores bajo cada campo. Al enviar: «Recibimos tu aviso de pago. Activaremos tu plan cuando confirmemos el dinero» y vuelve a Configuración |
| Ya hay un pago en revisión | En lugar del formulario: «Ya tienes un pago en revisión (referencia …, enviado el …)» | «Ver estado» |
| Celular | Una sola columna; los botones «Copiar» de al menos 44 px | — |

## Configuración → «Tu plan», cambios

| Bloque | Información | Al interactuar |
|---|---|---|
| Estado del último pago | **En revisión**: «Avisaste un pago de $44.700 (3 meses de Pro) el 17 de noviembre. Te avisaremos aquí cuando se confirme». **Aprobado**: «Pago confirmado: Pro hasta el 14 de febrero de 2027». **Rechazado**: «No pudimos confirmar tu pago: *motivo*» | En revisión: «Cancelar aviso» (con confirmación). Rechazado: «Volver a intentar» → Pagar plan |
| «Tus pagos» | Lista de los avisos: fecha, plan, meses, valor y estado | Solo lectura |
| Plan pagado | Origen: «Pagado · hasta el …» (además de «Pro de prueba» y «Activado por el administrador») | «Renovar» → Pagar plan |

## Dashboard, cambio

| Bloque | Información | Al interactuar |
|---|---|---|
| Aviso de vencimiento (plan pagado, 7 días o menos) | «Tu plan Pro vence el 14 de febrero (quedan 5 días). Al vencer vuelves a Gratis sin perder datos» | «Renovar» → Pagar plan |

## Tú: comando `npm run pagos`

```
npm run pagos
  #12  CC-7F3K2Q  ana@correo.com   Pro · 3 meses · $44.700   Nequi · 17/11/2026 · comprobante M123456   (enviado hoy 10:42)

npm run pagos -- --aprobar=12
  Pago #12 aprobado. ana@correo.com: Pro, pagado, hasta el 14/02/2027

npm run pagos -- --rechazar=12 --motivo="No encontramos el pago con esa referencia"
  Pago #12 rechazado. El cliente verá el motivo en su Configuración.

npm run pagos -- --todos     → también los aprobados y rechazados
```

Reglas:
- **Aprobar** activa el plan comprado por `meses × 30 días`, contando el día de la aprobación (como la prueba gratis). Por ejemplo, 3 meses aprobados el 17/11/2026 duran hasta el 14/02/2027. Si ya tenía ese plan activo, los días se suman después de su fecha de fin. Si compra Contador teniendo Pro, pasa a Contador desde hoy.
- **Solo se aprueba o rechaza un pago pendiente**: aprobar dos veces no suma dos veces.
- El comando **no** comprueba el banco: compruébalo tú antes de aprobar. Muestra el valor que esperaba la app junto al que dijo el cliente.

---

## Cómo funciona por dentro

| Pieza | Regla |
|---|---|
| `data/cobro.json` | `{ "metodos": [{ "nombre": "Nequi", "detalle": "…" }], "contacto": "…" }`. Lo lee el servidor al arrancar. Si tiene un error, la app arranca igual sin «Comprar» y lo avisa en la ventana negra |
| Referencia de pago | Un código fijo por cuenta (`CC-` + 6 letras y números sin O, 0, I ni 1, para no confundirlos), que se crea la primera vez que alguien abre Pagar plan |
| Avisos de pago | Tabla nueva: cuenta, plan, meses, valor esperado (lo calcula el servidor, no el navegador), valor dicho, método, fecha, comprobante, nota, estado, motivo y fechas |
| Plan | Nuevo origen **«pago»** junto a «prueba» y «administrador». Al aprobar se guarda el nivel (Pro o Contador) y la fecha de fin |
| Privacidad | Se guarda lo mínimo. No hay campos para tarjeta, contraseña ni número de cuenta del cliente |
| Eliminar cuenta | Borra también sus avisos de pago |

API nueva (la que ya existe no cambia):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/payments/config` | Métodos de pago, precios, meses y tu referencia. 404 si no hay `data/cobro.json` |
| GET | `/api/payments` | Tus avisos de pago y su estado |
| POST | `/api/payments` | Avisar un pago: `{ tier, months, method, paid_on, amount_cents, receipt, note, confirm: true }`. 409 si ya hay uno pendiente |
| DELETE | `/api/payments/:id` | Cancelar un aviso **pendiente** propio |

## Fuera de esta fase

- **Pasarela de pagos** (Wompi, ePayco, PayU, Mercado Pago…) y cobros automáticos cada mes.
- **Subir foto o PDF del comprobante.**
- **Pantalla de administrador** en la app; por ahora, el comando.
- **Factura electrónica** del cobro.
- **Descuentos, cupones y reembolsos.** Si devuelves un pago, quita el plan con `npm run plan -- --plan=gratis`.
- **Avisos por correo** al aprobar o rechazar.

## Qué no cambia

La prueba gratis de 30 días, el comando `npm run plan`, los planes Gratis, Pro y Contador y todo lo demás siguen igual. Sin `data/cobro.json`, la app se ve exactamente como hoy.

---

## Lo que se programó

### Cómo activarlo

1. Copia [`docs/cobro.ejemplo.json`](cobro.ejemplo.json) a **`data/cobro.json`**.
2. Cambia los textos en MAYÚSCULAS por tus datos reales: tu Nequi o tu cuenta, a nombre de quién y cómo contactarte. Puedes poner hasta 10 métodos.
3. Listo: «Comprar» aparece al recargar la página, **sin reiniciar**. Si el archivo tiene un error, «Comprar» no aparece y la ventana negra dice cuál es.

Para quitarlo, borra `data/cobro.json`.

### Detalles que no estaban en la definición

| Detalle | Por qué |
|---|---|
| `cobro.json` se lee cada vez que se usa, no solo al arrancar | Así no hace falta reiniciar al cambiarlo. Es un archivo pequeño |
| Se acepta el archivo guardado con el Bloc de notas (BOM) | Windows lo guarda así y si no, daría error |
| Quien ya tiene Contador no puede comprar Pro: la pantalla lo explica (el servidor responde 409) | Contador incluye Pro |
| Si tienes el plan **sin fecha de fin** (lo activó el administrador), no aparece «Renovar». Si aun así se aprueba un pago, el plan sigue sin fecha de fin | No tiene sentido pagar por algo que no vence |
| La compra se suma también al final de la **prueba gratis** | Así no se pierden días de prueba |
| «Copiar» usa un segundo método si el navegador bloquea el portapapeles | En el navegador de pruebas el método moderno estaba bloqueado |
| Los avisos tienen ids que **nunca se reutilizan** (`AUTOINCREMENT`) | Un número de pago no puede apuntar después a otro pago |
| El aviso de fin de la prueba y el del plan pagado son un mismo componente (`PlanEndingBanner`) | La prueba avisa con 3 días y el plan pagado con 7 |

### Archivos cambiados

Calculado por huella SHA-256 (sin `node_modules`, `dist`, `data` ni `CODIGO`). **177 archivos quedan idénticos.**

**Nuevos (8)**

| Archivo | Contenido |
|---|---|
| `server/migrations/008_payments.sql` | Añade el origen «pago» al plan: rehace la tabla `plans` copiando sus filas tal cual. Crea las tablas `payment_refs` y `payments`, con un solo aviso pendiente por cuenta |
| `server/payments.js` | Precios, lectura de `cobro.json`, referencia `CC-XXXXXX`, aprobar y rechazar |
| `server/routes/payments.js` | `GET /api/payments/config`, `GET /api/payments`, `POST /api/payments` y `DELETE /api/payments/:id` |
| `scripts/pagos.js` | Comando `npm run pagos` |
| `web/src/lib/payments.ts` | Lectura de la configuración y de los avisos, y el cálculo de la fecha de fin para mostrarla |
| `web/src/pages/pay.tsx` | Pantalla Pagar plan |
| `docs/cobro.ejemplo.json` | Plantilla de `data/cobro.json` con datos de ejemplo |
| `tests/payments.test.js` | 8 pruebas (ver abajo) |

**Modificados (7)**

| Archivo | Cambio |
|---|---|
| `server/app.js` | Registra las rutas y lee `cobro.json` junto a la base de datos |
| `web/src/App.tsx` | Ruta `#/planes/pagar` |
| `web/src/pages/plans.tsx` | «Comprar», «Renovar» y «Pago en revisión»; la nota cambia si hay cobro |
| `web/src/components/plan.tsx` | Estado del último pago, «Tus pagos», «Renovar» en «Tu plan» y el aviso de vencimiento |
| `web/src/pages/dashboard.tsx` | Usa el aviso nuevo (`PlanEndingBanner`) |
| `web/src/lib/types.ts` | Tipos del cobro y origen «pago» |
| `package.json` | Script `pagos` |

### Verificación

**Pruebas automáticas.** `npm test` pasa **138/138**: las 130 anteriores y 8 nuevas. Las nuevas comprueban:

- **Sin `cobro.json`, la app queda como antes:** la configuración responde 404 y no se puede avisar un pago.
- **El archivo se valida:**
  - JSON roto, sin métodos o con un método sin detalle se tratan como si no hubiera cobro;
  - se acepta el BOM y se relee sin reiniciar;
  - la referencia `CC-XXXXXX` no usa O, 0, I ni 1, es fija por cuenta y distinta entre cuentas.
- **Validación de los 12 campos.** El valor esperado lo calcula el servidor: 6 meses de Contador son $359.400 aunque el cliente diga otra cifra. Un aviso pendiente a la vez. Contador no puede comprar Pro.
- **Cancelar:** solo un aviso propio y pendiente; otro usuario no lo ve ni lo cancela.
- **El comando:**
  - lista y avisa si el valor no coincide;
  - aprobar da 90 días contando hoy y no suma dos veces;
  - renovar suma desde la fecha de fin;
  - pasar a Contador empieza hoy;
  - da error con un id inexistente, un id no válido, sin motivo o con `--aprobar` y `--rechazar` juntos.
- **Prueba gratis + compra:** se suma desde el fin de la prueba. Un plan sin fecha de fin se queda así.
- **Rechazar** guarda el motivo y no cambia el plan; un pago rechazado no se puede aprobar. Al vencer, la cuenta vuelve a Gratis y conserva el historial.
- **Eliminar la cuenta** borra sus avisos y su referencia.

`npm run typecheck`: sin errores.

**Migración en tu base de datos real.** Primero se probó sobre una copia y después se aplicó al reiniciar tu app, con una copia de seguridad previa. Integridad correcta, las 2 cuentas y sus planes sin cambios: Contador sin fecha de fin y Pro de prueba hasta el 16/12/2026.

**En el navegador** (servidor de prueba con un `cobro.json` de datos ficticios, ya borrado):

| Paso | Resultado |
|---|---|
| Planes con cobro | Pro: «Comprar» y «Probar 30 días gratis». Contador: «Comprar». La nota nueva |
| Pagar plan, 3 meses | Total $ 44.700 ($ 14.900 × 3 meses), «quedará hasta el 14 de febrero de 2027», los 2 métodos, la referencia y el contacto |
| «Enviar aviso de pago» (sin la casilla está desactivado) | Mensaje de recibido y paso a Configuración: «Avisaste un pago de $ 44.700…», «Cancelar aviso», «Tus pagos: En revisión» |
| Planes con el aviso pendiente | Pro: «Pago en revisión · Ver estado». Contador: «Tienes un pago en revisión» |
| `npm run pagos` y `--aprobar=1` | Lo lista y queda «Pro, pagado, hasta el 14/02/2027». En Configuración: «Pagado · hasta el 14 de febrero de 2027 (quedan 90 días)», «Pago confirmado» y «Renovar» |
| Plan pagado a 5 días de vencer | Dashboard: «Tu plan Pro vence el 22 de noviembre de 2026 (quedan 6 días)…» con «Renovar» |
| Renovar 1 mes | «Renovando, tu plan Pro quedará hasta el 22 de diciembre de 2026» |
| `--rechazar=2 --motivo="…"` | Configuración: «No pudimos confirmar tu pago: …» con «Volver a intentar»; el historial muestra Rechazado y Aprobado |
| «Copiar la referencia» | «Copiado» |
| Celular (375 px), modo oscuro | Sin desplazamiento horizontal en Configuración, Planes, las 2 pantallas de pago y el Dashboard |
| Consola | Solo el 401 inicial esperado |

**No probado:**

- con clientes reales, porque necesita la app publicada en internet;
- con tus datos de pago reales: `data/cobro.json` no existe; lo creas tú con la plantilla.
