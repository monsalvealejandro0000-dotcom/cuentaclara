# CuentaClara

App web para independientes en Colombia: registra ingresos y gastos, calcula el beneficio mensual y muestra cuánto reservar para impuestos (IVA por periodos del formulario 300 y estimación del impuesto de renta con la tabla del art. 241 del Estatuto Tributario, descontando la retención en la fuente). Incluye facturas o cuentas de cobro, calendario y un panel de analítica (AnalyticsBento). Detalle: [docs/07-impuestos-colombia.md](docs/07-impuestos-colombia.md).

**Moneda local:** por defecto, pesos colombianos. En Configuración → Moneda se elige entre las 153 monedas oficiales vigentes (ISO 4217), cada una con el formato de su país. Cambiar la moneda no convierte los importes ya registrados. La renta se calcula en UVT (pesos), así que con otra moneda su estimación no es válida.

## Estructura

```
GASTOS INGRESOS/
├── server/          API Node.js + SQLite (sin dependencias externas)
├── legal/           términos, privacidad, cookies y reembolsos (Markdown; se ven en la app)
├── web/             Interfaz React + TypeScript + Tailwind (estructura shadcn)
│   └── src/components/ui/   componentes base (incluido analytics-bento.tsx)
├── dist/            interfaz compilada (la genera npm run build; la sirve el servidor)
├── tests/           pruebas automáticas (node:test)
├── scripts/         copia y restauración de la base de datos
├── docs/            documentación por fases
└── data/            base de datos y copias (se crean al arrancar; no se versionan)
```

## Requisitos

- Node.js 22.13 o superior (probado con 26.13).

## Arrancar

**Con doble clic (Windows):** abre **`Abrir CuentaClara`** en esta carpeta. Si la app ya está en marcha, abre el navegador; si no, arranca el servidor en esa ventana (déjala abierta mientras la uses) y abre el navegador cuando responde. Equivale a `npm run abrir`.

> `web/index.html` y `dist/index.html` **no se abren con doble clic**: la app necesita su servidor. Si los abres así, muestran un aviso con estos pasos.

Desde la terminal:

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Abre http://localhost:3000. Los datos se guardan en `data/app.db` (SQLite).

Opciones: `--port=3000`, `--host=127.0.0.1`, `--db=ruta/datos.db` (o las variables `PORT`, `HOST`, `DB_PATH`). En producción, detrás de HTTPS, usa `COOKIE_SECURE=1`: la cookie de sesión solo viaja por HTTPS y la app envía la cabecera HSTS. Pon tu dominio en `ALLOWED_HOSTS` (p. ej. `ALLOWED_HOSTS=cuentaclara.co`) y, si hay un proxy delante, `TRUST_PROXY=1` para que los límites por IP vean la IP real. Detalle: [docs/12-legal-y-seguridad.md](docs/12-legal-y-seguridad.md). Las fechas («hoy») se calculan en hora de Colombia aunque el servidor esté en otro huso; para cambiarlo, `APP_TIMEZONE` (por defecto `America/Bogota`).

### Desarrollo de la interfaz

Con `npm start` en marcha (API en el puerto 3000), en otra terminal:

```bash
npm run dev
```

Abre http://localhost:5173: los cambios en `web/src` se ven al instante y las llamadas a `/api` se reenvían al puerto 3000.

## Planes

Todas las cuentas empiezan en **Gratis**, que incluye todo lo anterior. **Pro** añade los avisos de declaración y el informe para el contador. Se activa con la prueba gratis de 30 días (Configuración → Tu plan, una vez por cuenta) o con este comando del administrador. La app no cobra en línea. Detalle: [docs/09-planes.md](docs/09-planes.md).

```bash
npm run plan -- --email=correo@ejemplo.com --plan=pro
```

Otras opciones: sin `--plan` muestra el plan actual, `--plan=pro --hasta=AAAA-MM-DD` da Pro hasta esa fecha, `--plan=contador` da el plan **Contador** (todo Pro más el panel de clientes en solo lectura; detalle en [docs/10-plan-contador.md](docs/10-plan-contador.md)) y `--plan=gratis` vuelve a Gratis. Volver a Gratis no borra ningún dato.

El plan Contador solo sirve para atender clientes reales cuando la app está publicada en internet. En local se puede probar con varias cuentas en el mismo servidor.

### Cobro manual

Para que los clientes puedan **comprar** Pro o Contador, copia [`docs/cobro.ejemplo.json`](docs/cobro.ejemplo.json) a `data/cobro.json` y pon tus datos de pago (Nequi, cuenta…). El cliente paga por fuera de la app y avisa que pagó. Tú compruebas en tu banco que llegó el dinero y lo apruebas:

```bash
npm run pagos
```

```bash
npm run pagos -- --aprobar=12
```

Para rechazarlo: `npm run pagos -- --rechazar=12 --motivo="…"`; para ver todos: `--todos`. La app nunca recibe dinero ni activa un plan sola. Detalle: [docs/11-cobro-manual.md](docs/11-cobro-manual.md).

## Documentos legales, consentimientos y PQR

La app publica términos y condiciones, política de privacidad, de cookies y de reembolsos (`#/legal/…`). Al registrarse, al pagar y al cambiar de versión, la persona marca dos casillas separadas (términos y autorización de datos) y queda constancia inalterable de cuándo y cómo aceptó. Las peticiones, quejas y reclamos se radican en la app con número, fecha y hora. Detalle: [docs/12-legal-y-seguridad.md](docs/12-legal-y-seguridad.md).

**Antes de publicar**, copia [`docs/responsable.ejemplo.json`](docs/responsable.ejemplo.json) a `data/responsable.json` con tus datos como responsable y reinicia la app: hasta entonces los documentos los muestran como «[pendiente: …]».

```bash
npm run pqr
```

```bash
npm run pqr -- --responder=12 --respuesta="…"
```

```bash
npm run consentimientos -- --email=correo@ejemplo.com
```

```bash
npm run consentimientos -- --verificar
```

## Copias de seguridad

El servidor hace una copia verificada al arrancar (si no hay una de menos de 24 h) y después cada 24 h, en `data/backups/`, conservando las 14 últimas.

| Variable | Por defecto | Para qué |
|---|---|---|
| `BACKUP_DIR` | `data/backups` | Carpeta de las copias. **En producción, ponla fuera del disco del servidor** |
| `BACKUP_INTERVAL_HOURS` | `24` | Cada cuánto (0 = desactivar) |
| `BACKUP_KEEP` | `14` | Cuántas copias conservar |

Copia manual (con el servidor en marcha) y listado:

```bash
npm run backup
```

```bash
npm run backup -- --list
```

Restaurar (**detén antes el servidor**; la base de datos actual se guarda aparte, no se borra):

```bash
npm run restore -- data/backups/cuentaclara-AAAAMMDD-HHMMSS-mmm.db --confirmar
```

## Pruebas

```bash
npm test
```

Compila la interfaz y ejecuta 160 pruebas automáticas. Cada una usa una base de datos temporal que se borra al terminar; nunca tocan `data/app.db`. Para comprobar los tipos de TypeScript:

```bash
npm run typecheck
```

## Documentación

| Fase | Documento |
|---|---|
| 1. Funcionalidades y estructura | [docs/01-funcionalidades-y-estructura.md](docs/01-funcionalidades-y-estructura.md) |
| 2. Pantallas e interacciones | [docs/02-pantallas.md](docs/02-pantallas.md) |
| 3. Verificación de CRUD, persistencia y balances | [docs/03-verificacion-crud.md](docs/03-verificacion-crud.md) |
| 4. Calendario y archivos cambiados | [docs/04-calendario.md](docs/04-calendario.md) |
| 5. Informe de pruebas antes de publicar | [docs/05-informe-pruebas.md](docs/05-informe-pruebas.md) |
| 6. Interfaz React + shadcn y AnalyticsBento | [docs/06-interfaz-react-bento.md](docs/06-interfaz-react-bento.md) |
| 7. Impuestos de Colombia | [docs/07-impuestos-colombia.md](docs/07-impuestos-colombia.md) |
| 8. Abrir la app con doble clic | [docs/08-abrir-la-app.md](docs/08-abrir-la-app.md) |
| 9. Planes Gratis y Pro: avisos de declaración e informe para el contador | [docs/09-planes.md](docs/09-planes.md) |
| 10. Plan Contador: panel de clientes en solo lectura | [docs/10-plan-contador.md](docs/10-plan-contador.md) |
| 11. Cobro manual de los planes | [docs/11-cobro-manual.md](docs/11-cobro-manual.md) |
| 12. Seguridad, documentos legales y cumplimiento en Colombia | [docs/12-legal-y-seguridad.md](docs/12-legal-y-seguridad.md) |

> Las fases 1 a 5 describen la primera versión de la interfaz (`public/`, HTML/JS). Las funciones y pantallas son las mismas; desde la fase 6 la interfaz está en `web/src`.

> **Antes de publicar en internet**, lee los problemas críticos del informe de pruebas (HTTPS, validez legal de las facturas y guardar las copias de seguridad fuera del servidor) y la lista «Lo que tienes que hacer antes de publicar» de la [fase 12](docs/12-legal-y-seguridad.md).

Diseño del panel de analítica basado en *AnalyticsBento* de [vasnev.art](https://vasnev.art) (licencia MIT). Las licencias de todo lo de terceros que va en la interfaz se generan en `dist/licencias.txt` al compilar.
