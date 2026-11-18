# 1. Funcionalidades esenciales y estructura

> Fase 1 — definido **antes** de escribir código.
>
> **Actualización (fase 6):** la interfaz se rehízo con React + TypeScript + Tailwind (estructura shadcn) en `web/src` y el proyecto está ahora en la raíz de la carpeta. Las funcionalidades, el modelo de datos, la API y la seguridad descritos aquí no cambian. Ver [06-interfaz-react-bento.md](06-interfaz-react-bento.md).

## Objetivo

App web para autónomos que permita:

1. Registrar **ingresos y gastos**.
2. Calcular el **beneficio mensual**.
3. Ver **cuánto dinero reservar para impuestos** (IVA e IRPF).

Por defecto usa la fiscalidad española (IVA 21 %, pagos fraccionados del modelo 130 al 20 %), pero todos los tipos se pueden cambiar en Configuración.

## Funcionalidades esenciales (MVP)

| # | Funcionalidad | Qué incluye | Por qué es esencial |
|---|---|---|---|
| F1 | Cuenta de usuario | Registro, inicio y cierre de sesión, cambio de contraseña, eliminar cuenta | Los datos económicos son privados: cada usuario solo ve los suyos |
| F2 | Movimientos | Crear, editar y eliminar ingresos y gastos. Campos: tipo, fecha, concepto, categoría, base imponible, IVA %, retención IRPF % (ingresos), deducible (gastos), notas. Filtros por mes, tipo, categoría y texto. Exportar CSV | Es el libro de registro: todo lo demás se calcula a partir de aquí |
| F3 | Beneficio mensual | Ingresos, gastos y beneficio de cada mes y evolución de los últimos 12 meses | Es la pregunta principal del autónomo: «¿cuánto gano?» |
| F4 | Reserva de impuestos | IVA a reservar, IRPF a reservar, total a apartar y dinero disponible después de impuestos. Estimación trimestral de los modelos 303 y 130 con su plazo | Evita llegar al trimestre sin dinero para pagar |
| F5 | Facturas | Emitir facturas con numeración correlativa por año, estado pendiente/cobrada, vista imprimible. Cada factura genera automáticamente su ingreso en Movimientos | Evita apuntar dos veces el mismo ingreso y controla lo pendiente de cobro |
| F6 | Configuración | Datos fiscales (para las facturas), IVA y retención por defecto, % de reserva de IRPF | Adapta los cálculos a cada autónomo |

### Fuera del alcance del MVP

Presentación telemática de modelos, conexión con bancos, varias monedas, facturas rectificativas, VeriFactu/TicketBAI, recargo de equivalencia, adjuntar tickets y cuentas de empresa con varios usuarios. La app **estima**; no sustituye a un gestor.

## Reglas de cálculo

Todo el dinero se guarda en **céntimos enteros** para evitar errores de redondeo. Por cada movimiento:

- `IVA = redondeo(base × IVA% / 100)`
- `Retención = redondeo(base × IRPF% / 100)` (solo ingresos)
- Total de un ingreso = `base + IVA − retención`; total de un gasto = `base + IVA`

Para un periodo (mes, trimestre o año):

| Concepto | Fórmula |
|---|---|
| Ingresos | Σ base de ingresos |
| Gastos | Σ base de gastos (+ IVA si el gasto **no** es deducible, porque ese IVA es un coste) |
| **Beneficio** | Ingresos − Gastos |
| Beneficio fiscal | Ingresos − Σ base de gastos deducibles |
| IVA repercutido | Σ IVA de ingresos |
| IVA soportado deducible | Σ IVA de gastos deducibles |
| **IVA a reservar** | máx(0, repercutido − soportado) |
| IRPF estimado | máx(0, beneficio fiscal × % reserva IRPF) |
| **IRPF a reservar** | máx(0, IRPF estimado − retenciones ya practicadas por clientes) |
| **Total a reservar** | IVA a reservar + IRPF a reservar |
| Saldo de caja | Σ totales de ingresos − Σ totales de gastos |
| **Disponible tras impuestos** | Saldo de caja − Total a reservar |

**Estimación trimestral:**

- Modelo 303 (IVA) = IVA repercutido − IVA soportado del trimestre (si es negativo, «a compensar»).
- Modelo 130 (IRPF), acumulado como el modelo real: `pago T = máx(0, % × beneficio fiscal acumulado desde enero − retenciones acumuladas − pagos de trimestres anteriores)`.
- Plazos: T1 → 20 abr, T2 → 20 jul, T3 → 20 oct, T4 → 30 ene del año siguiente.

**Criterio de devengo:** el ingreso de una factura cuenta en su **fecha de emisión**, que es el criterio general de IVA e IRPF. El estado «cobrada» solo sirve para controlar lo pendiente de cobro.

## Arquitectura

```
Navegador (SPA HTML/CSS/JS, sin librerías externas)
        │  fetch JSON + cookie de sesión HttpOnly
        ▼
Servidor Node.js (node:http) ── API REST /api/*
        │
        ▼
SQLite en disco (node:sqlite) ── data/app.db
```

- **Sin dependencias externas**: `node:http`, `node:sqlite`, `node:crypto` (scrypt) y `node:test`. No hace falta `npm install`.
- **Frontend**: módulos ES nativos, router por hash (`#/dashboard`), sin CDN (lo permite una CSP estricta).
- **Persistencia**: un fichero SQLite con claves foráneas activadas, modo WAL y migraciones versionadas.

### Estructura de carpetas

```
autonomos-app/
├── package.json            scripts: start, test
├── server/
│   ├── index.js            arranque (puerto, ruta de la BD)
│   ├── app.js              servidor HTTP: cabeceras, estáticos, API, errores
│   ├── router.js           enrutador mínimo con parámetros
│   ├── db.js               conexión SQLite + migraciones
│   ├── migrations/         001_init.sql, …
│   ├── auth.js             hash de contraseñas, sesiones, límite de intentos
│   ├── validation.js       validadores reutilizables
│   ├── calc.js             cálculos puros (beneficio, IVA, IRPF, trimestres)
│   ├── categories.js       categorías permitidas
│   └── routes/             auth, movements, invoices, settings, summary
├── public/
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── main.js         router y control de sesión
│       ├── api.js          cliente HTTP
│       ├── format.js       euros, fechas, escapado HTML
│       ├── ui.js           modales, confirmaciones, avisos
│       ├── layout.js       navegación lateral / barra inferior móvil
│       └── views/          login, dashboard, movements, movement-form, invoices, settings
├── tests/                  pruebas automáticas (node:test)
└── docs/                   esta documentación
```

## Modelo de datos

| Tabla | Campos principales | Notas |
|---|---|---|
| `users` | id, email (único), name, password_hash, created_at | Contraseña con scrypt + sal |
| `sessions` | id (hash SHA-256 del token), user_id, expires_at | El token en claro solo vive en la cookie |
| `settings` | user_id, business_name, nif, address, default_vat_rate, default_irpf_rate, irpf_reserve_rate | 1 fila por usuario |
| `movements` | id, user_id, type, date, concept, category, base_cents, vat_rate, irpf_rate, deductible, notes, invoice_id | `invoice_id` enlaza con la factura que lo generó |
| `invoices` | id, user_id, number, year, seq, client_*, issue_date, due_date, concept, base_cents, vat_rate, irpf_rate, status, paid_date, notes | Número único por usuario: `2026-001` |

Todas las tablas de datos llevan `user_id` con `ON DELETE CASCADE`: al eliminar la cuenta se borra todo.

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Crear cuenta e iniciar sesión |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Usuario actual (401 si no hay sesión) |
| PUT | `/api/account/password` | Cambiar contraseña (cierra las demás sesiones) |
| DELETE | `/api/account` | Eliminar cuenta y todos sus datos (pide contraseña) |
| GET | `/api/meta` | Categorías y tipos de IVA |
| GET/POST | `/api/movements` | Listar (filtros `from`, `to`, `type`, `category`, `q`) / crear |
| GET/PUT/DELETE | `/api/movements/:id` | Ver / editar / eliminar |
| GET/POST | `/api/invoices` | Listar (`year`, `status`) / crear (genera el ingreso) |
| GET/PUT/DELETE | `/api/invoices/:id` | Ver / editar (sincroniza el ingreso) / eliminar (borra el ingreso) |
| GET/PUT | `/api/settings` | Leer / guardar configuración |
| GET | `/api/summary?month=AAAA-MM` | Datos del Dashboard: mes, año, trimestres, serie de 12 meses, facturas pendientes |

Errores con formato único: `{ "error": { "code", "message", "fields" } }` y el código HTTP correspondiente (400, 401, 403, 404, 409, 413, 429, 500).

## Seguridad y permisos

- Cookie de sesión `HttpOnly`, `SameSite=Lax`, caducidad de 30 días; en la BD solo se guarda el hash del token.
- Cada consulta filtra por `user_id`: un recurso de otro usuario responde **404** (no revela que existe).
- Las peticiones que modifican datos rechazan un `Origin` distinto del propio (protección CSRF) y exigen JSON.
- Límite de 5 intentos fallidos de inicio de sesión por email/IP cada 15 minutos.
- Validación de todos los campos en el servidor (el navegador también valida, pero no se confía en él).
- Cabeceras: CSP `default-src 'self'`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. Cuerpo máximo 100 KB.
- Todo el contenido del usuario se escapa al pintarlo (sin XSS).

## Decisiones clave

- **Sin datos de ejemplo**: una cuenta nueva empieza vacía y cada pantalla muestra un estado vacío que explica qué hacer. Los datos de las pruebas viven en bases de datos temporales que se borran al terminar.
- **Movimientos como fuente única**: Dashboard e impuestos se calculan siempre desde la tabla de movimientos, en el servidor, en cada petición. No hay totales guardados que puedan desincronizarse.
- **Ingresos de factura bloqueados**: un ingreso generado por una factura solo se edita o elimina desde la factura, para que nunca dejen de coincidir.
