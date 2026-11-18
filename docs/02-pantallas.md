# 2. Pantallas, conexiones e interacciones

> Fase 2 — definido **antes** de escribir código.

## Mapa de navegación

```
                ┌────────────┐   registro ok / login ok   ┌─────────────────────────────────────────┐
  sin sesión ──►│ Login      │──────────────────────────► │ Dashboard  (pantalla de inicio)          │
                │ Registro   │◄── cerrar sesión / 401 ─── │                                          │
                └────────────┘                            └──┬──────────────┬──────────────┬─────────┘
                                                             │ clic en KPI  │ facturas     │ datos fiscales
                                                             ▼ (filtro mes) ▼ pendientes   ▼ incompletos
                                                    ┌──────────────┐ ┌──────────────┐ ┌───────────────┐
                                                    │ Movimientos  │◄┤ Facturas     │ │ Configuración │
                                                    │              │ │ (genera el   │ │ (tipos y      │
                                                    │              │ │  ingreso)    │ │  datos)       │
                                                    └──────────────┘ └──────────────┘ └───────────────┘
```

- Navegación siempre visible: **barra lateral** en escritorio y **barra inferior** en móvil (< 760 px).
- Cada pantalla tiene su URL (`#/dashboard`, `#/movimientos?mes=2026-11&tipo=gasto`, `#/facturas`, `#/configuracion`), así que recargar o usar «atrás» mantiene el sitio.
- Si el servidor responde 401 (sesión caducada) en cualquier pantalla → vuelve a Login con el aviso «Tu sesión ha caducado».

## Flujo de datos entre pantallas

```
Configuración ──(% reserva IRPF, IVA/IRPF por defecto, datos fiscales)──┐
                                                                         ▼
Facturas ──(crear/editar/eliminar factura)──► Movimientos (ingreso vinculado)
                                                    │
                                                    ▼ (el servidor recalcula en cada petición)
                                               Dashboard
```

No hay totales guardados: cuando cambias un movimiento, una factura o el % de reserva, el Dashboard muestra el nuevo cálculo en cuanto se abre o se refresca.

---

## Pantalla: Login / Registro (`#/login`, `#/registro`)

| Elemento | Información | Al interactuar |
|---|---|---|
| Formulario de login | Email, contraseña | «Entrar» → `POST /auth/login`. OK → Dashboard. Error → mensaje sobre el formulario («Email o contraseña incorrectos», «Demasiados intentos…») |
| Formulario de registro | Nombre, email, contraseña, repetir contraseña | «Crear cuenta» → validación (email válido, ≥ 8 caracteres con letras y números, coinciden) → `POST /auth/register` → Dashboard vacío. Email repetido → error en el campo |
| Enlace «¿No tienes cuenta?» / «Ya tengo cuenta» | — | Cambia entre las dos pantallas |

---

## Pantalla: Dashboard (`#/dashboard`)

**Para qué sirve:** responder de un vistazo «¿cuánto he ganado este mes y cuánto tengo que apartar?».

| Bloque | Información | Al interactuar |
|---|---|---|
| Selector de mes | `◀ noviembre 2026 ▶` | Cambia el mes y recarga todos los bloques. Se guarda en la URL (`?mes=`) |
| 4 tarjetas KPI | Ingresos · Gastos · **Beneficio** · **Total a reservar** del mes | Ingresos/Gastos → abre Movimientos filtrado por ese mes y tipo. Beneficio → Movimientos del mes |
| Desglose de la reserva | IVA repercutido, IVA soportado, **IVA a reservar**; beneficio fiscal, IRPF estimado (x %), retenciones ya practicadas, **IRPF a reservar**; total y **disponible tras impuestos** | Solo lectura. Enlace «Cambiar % de reserva» → Configuración |
| Trimestre en curso | Estimación del modelo 303 y del modelo 130 del trimestre del mes elegido y su plazo | Solo lectura |
| Gráfico 12 meses | Barras de ingresos y gastos por mes y beneficio de cada mes | Clic en un mes → selecciona ese mes |
| Facturas pendientes | Nº y total pendiente de cobro | Clic → Facturas filtradas por «pendientes» |
| Últimos movimientos | Los 5 más recientes | Clic → Movimientos de ese mes |
| Botones «+ Ingreso» / «+ Gasto» | — | Abren el formulario de movimiento; al guardar, el Dashboard se recalcula |
| Estado vacío | Si no hay ningún movimiento: «Aún no tienes movimientos» + botones para añadir el primero | — |
| Aviso de datos fiscales | Si faltan nombre o NIF: «Completa tus datos fiscales para emitir facturas» | Clic → Configuración |

---

## Pantalla: Movimientos (`#/movimientos`)

**Para qué sirve:** el libro de ingresos y gastos. Es la fuente de todos los cálculos.

| Bloque | Información | Al interactuar |
|---|---|---|
| Filtros | Mes (o «todo el año»), tipo (todos/ingresos/gastos), categoría, búsqueda por concepto/notas | Filtra la lista y los totales al momento. Se reflejan en la URL |
| Totales del filtro | Ingresos, gastos y beneficio de lo que se ve | Se recalculan con cada alta/edición/borrado |
| Lista | Fecha, concepto, categoría, tipo, base, IVA, retención, total. Ingresos en verde, gastos en rojo. Insignia «Factura 2026-001» si viene de una factura | Escritorio: tabla. Móvil: tarjetas |
| Botón «Editar» | — | Abre el formulario con los datos. Guardar → `PUT` → lista y totales actualizados |
| Botón «Eliminar» | — | Pide confirmación («Se eliminará "X" de 1.210,00 €») → `DELETE` → desaparece de la lista |
| Movimiento de factura | Botones sustituidos por «Ver factura» | Lleva a la factura; allí se edita/elimina |
| «+ Ingreso» / «+ Gasto» | — | Formulario vacío con el tipo marcado y los tipos por defecto de Configuración |
| «Exportar CSV» | — | Descarga los movimientos filtrados (compatible con Excel) |
| Estado vacío | «No hay movimientos en este periodo» | Botón para añadir |

**Formulario de movimiento** (ventana modal; pantalla completa en móvil):

- Tipo (ingreso/gasto), fecha (hoy por defecto), concepto, categoría (cambia según el tipo), base imponible en €, IVA % (21/10/4/0), retención IRPF % (solo ingresos), deducible (solo gastos, marcado por defecto), notas.
- Vista previa en vivo: IVA, retención y total.
- Errores bajo cada campo (cliente y servidor). «Guardar» se desactiva mientras se envía para evitar duplicados.

---

## Pantalla: Facturas (`#/facturas`)

**Para qué sirve:** emitir facturas y controlar lo que falta por cobrar.

| Bloque | Información | Al interactuar |
|---|---|---|
| Filtros | Año, estado (todas/pendientes/cobradas) | Filtra la lista |
| Resumen | Facturado en el año (base), pendiente de cobro (total) | — |
| Lista | Número, fecha, cliente, base, total, estado, vencimiento (marcada «vencida» si pasó la fecha y sigue pendiente) | — |
| «Nueva factura» | — | Formulario: cliente (nombre, NIF, dirección), fecha de emisión, vencimiento, concepto, base, IVA %, retención % (por defecto, los de Configuración). El número se asigna al guardar (`2026-003`). **Crea a la vez el ingreso en Movimientos** |
| «Marcar cobrada» / «Marcar pendiente» | — | Cambia el estado (y la fecha de cobro). Actualiza «pendiente de cobro» del Dashboard |
| «Editar» | — | Mismo formulario. Al guardar, el ingreso vinculado se actualiza igual. No se permite cambiar el año (rompería la numeración) |
| «Eliminar» | — | Confirmación: «También se eliminará su ingreso en Movimientos» → borra ambos |
| «Ver / Imprimir» | — | Vista de factura con tus datos fiscales y los del cliente, base, IVA, retención y total. Botón «Imprimir» (o guardar como PDF desde el navegador) |
| Estado vacío | «Aún no has emitido facturas» | Botón «Nueva factura» |

---

## Pantalla: Configuración (`#/configuracion`)

**Para qué sirve:** adaptar la app a cada autónomo y gestionar la cuenta.

| Bloque | Información | Al interactuar |
|---|---|---|
| Datos fiscales | Nombre o razón social, NIF, dirección | «Guardar» → aparecen en las facturas |
| Impuestos | IVA por defecto (21 %), retención IRPF por defecto en facturas (15 %, 7 % nuevos autónomos, 0 %), **% de reserva para IRPF** (20 %) | «Guardar» → los formularios usan los nuevos valores y el Dashboard recalcula la reserva con el nuevo % |
| Seguridad | Cambiar contraseña (actual, nueva, repetir) | Valida y cierra las demás sesiones abiertas |
| Sesión | Usuario conectado | «Cerrar sesión» → Login |
| Zona de peligro | «Eliminar cuenta» | Pide contraseña y confirmación → borra cuenta y todos los datos → Login |

---

## Estados comunes en todas las pantallas

- **Cargando:** texto «Cargando…» mientras llegan los datos.
- **Error de red o del servidor:** aviso en rojo con el mensaje y botón «Reintentar»; no se muestran cifras inventadas.
- **Éxito:** aviso breve («Movimiento guardado»).
- **Móvil:** una columna, barra de navegación inferior, formularios a pantalla completa, botones de al menos 44 px y campos de 16 px (evita el zoom automático en iPhone).
