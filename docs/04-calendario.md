# 4. Calendario

> Fase 4 — implementar **únicamente** el calendario: crear, editar y eliminar eventos, sin modificar las demás funcionalidades.

## Definición (antes de programar)

### Alcance

- Eventos propios del usuario: reuniones, plazos fiscales, cobros/pagos u otros.
- Crear, editar y eliminar. Cada usuario solo ve sus eventos.
- **Fuera de alcance** (para no tocar otras funcionalidades): no se generan eventos automáticos a partir de facturas o plazos de impuestos, no hay recordatorios por email, ni eventos recurrentes.

### Datos de un evento

| Campo | Regla |
|---|---|
| Título | Obligatorio, máx. 120 caracteres |
| Fecha | Obligatoria, `AAAA-MM-DD` válida |
| Todo el día | Sí/No. Si es «sí», no se guardan horas |
| Hora de inicio | Obligatoria si no es «todo el día», `HH:MM` |
| Hora de fin | Opcional, posterior a la de inicio |
| Categoría | Reunión · Fiscal / impuestos · Cobro / pago · Otro |
| Notas | Opcional, máx. 1000 caracteres |

### API (nueva, no cambia las existentes)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/events?from=&to=` | Eventos del rango, ordenados por fecha y hora |
| GET | `/api/events/:id` | Un evento |
| POST | `/api/events` | Crear (201) |
| PUT | `/api/events/:id` | Editar |
| DELETE | `/api/events/:id` | Eliminar (204) |

Mismas reglas que el resto: sesión obligatoria (401), recurso de otro usuario → 404, errores por campo (400).

### Pantalla: Calendario (`#/calendario?mes=AAAA-MM&dia=AAAA-MM-DD`)

| Bloque | Información | Al interactuar |
|---|---|---|
| Cabecera | Título y botón «+ Nuevo evento» | Abre el formulario con el día seleccionado |
| Selector de mes | `◀ noviembre 2026 ▶` y «Hoy» | Cambia el mes (se guarda en la URL) |
| Cuadrícula mensual | Semanas de lunes a domingo; en cada día, el número y hasta 3 eventos (hora + título, color por categoría) y «+N más». Hoy y el día seleccionado resaltados | Clic en un día → lo selecciona y muestra sus eventos en el panel. Clic en un evento → formulario de edición |
| Panel del día | Fecha seleccionada y su lista de eventos con hora, categoría y notas | «Editar» → formulario; «Eliminar» → confirmación → se borra; «+ Añadir evento» → formulario con ese día |
| Formulario (modal) | Título, fecha, todo el día, inicio, fin, categoría, notas | Validación en cliente y servidor; al guardar se refrescan cuadrícula y panel. En edición, botón «Eliminar» |
| Estado vacío | «No hay eventos este día» | Botón para añadir |
| Móvil | La cuadrícula muestra puntos de color en lugar de títulos; el panel del día va debajo | Igual que en escritorio |

Navegación: nuevo enlace «Calendario» en la barra lateral / barra inferior. Es el único punto de contacto con la interfaz existente.

## Archivos cambiados

Calculado comparando el hash SHA-256 de cada archivo antes y después (no de memoria). 36 archivos quedan idénticos.

**Nuevos (6)**

| Archivo | Contenido |
|---|---|
| `server/migrations/002_events.sql` | Tabla `events` (con `ON DELETE CASCADE` al eliminar la cuenta). Se aplica sola al arrancar; no modifica las tablas existentes |
| `server/routes/events.js` | API `/api/events` (listar, ver, crear, editar, eliminar) con validación y filtro por usuario |
| `public/js/views/calendar.js` | Pantalla: cuadrícula mensual, panel del día y formulario de evento |
| `public/css/calendar.css` | Estilos exclusivos del calendario |
| `tests/events.test.js` | 10 pruebas: CRUD, orden, validación, permisos, persistencia y borrado de cuenta |
| `docs/04-calendario.md` | Este documento |

**Modificados (5), solo para enganchar el calendario**

| Archivo | Cambio |
|---|---|
| `server/app.js` | +2 líneas: importar y registrar `registerEventRoutes` |
| `public/js/main.js` | +2 líneas: importar la vista y añadir la ruta `/calendario` |
| `public/js/layout.js` | +1 línea: enlace «Calendario» en la navegación |
| `public/js/icons.js` | +1 línea: icono de calendario |
| `public/index.html` | +1 línea: cargar `calendar.css` |

Ningún archivo de movimientos, facturas, Dashboard, configuración, cálculos o autenticación ha cambiado.

## Verificación

**Automática** — `npm test`: **33/33 superadas**: las 10 nuevas del calendario más las 23 anteriores, que siguen pasando sin cambios (prueba de no regresión).

**En el navegador** (usuario de prueba, BD E2E separada):

| Paso | Resultado |
|---|---|
| Migración sobre una BD que ya tenía datos | Aplicada al arrancar; el Dashboard muestra los mismos importes que antes (ingresos 1.000 €, reserva 260 €) |
| Crear evento con hora (9:00–11:00) | Aparece en la cuadrícula y en el panel del día |
| Hora de fin anterior al inicio | Error en el campo; no se guarda |
| Seleccionar otro día y crear evento «todo el día» | Las horas se ocultan; el evento se guarda sin hora |
| Editar desde la cuadrícula (título y fecha 9 → 10) | El evento se mueve de día |
| Eliminar desde el panel del día (con confirmación) | Desaparece de la interfaz y de la API |
| Eliminar desde el formulario de edición | Igual; cuadrícula y servidor vacíos |
| Navegación | Aparece «Calendario» entre Facturas y Configuración |

**Incidencia investigada durante la prueba (no es un defecto del calendario):** tras confirmar un borrado la interfaz tardó unos segundos en actualizarse. El registro instrumentado mostró que la página estaba en `visibilityState: "hidden"` dentro del panel del navegador de pruebas y que Chrome retrasó ~2,5 s el evento `close` del diálogo. Después la secuencia fue correcta (DELETE 204 → recarga de eventos → repintado). En una pestaña visible ese evento es inmediato.
