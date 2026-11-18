# 5. Informe de pruebas antes de publicar

> **Estado al 17/11/2026.** Este informe es de la primera versión de la app, que usaba los impuestos de **España** (IRPF, modelos 303/130, VeriFactu, RGPD). Desde la [fase 7](07-impuestos-colombia.md) la app usa los de **Colombia**. Qué sigue pendiente antes de publicar en internet:
>
> | Pendiente | Estado |
> |---|---|
> | **HTTPS** (C1) | Sigue pendiente: depende del servidor donde se publique. Con `COOKIE_SECURE=1` la app ya envía la cookie solo por HTTPS y la cabecera HSTS |
> | **Copias fuera del servidor** (C2) | Pendiente al desplegar (`BACKUP_DIR`) |
> | **Facturas** (C3) | En Colombia son «documento de control» (cuenta de cobro o factura para imprimir). **No** son facturación electrónica validada por la DIAN |
> | **Recuperar la contraseña** y **verificar el correo** al registrarse | Pendientes: necesitan un servicio de correo. Verificar el correo importa más desde el plan Contador, porque las invitaciones van por correo |
> | **Datos personales** | **Resuelto en la [fase 12](12-legal-y-seguridad.md):** política de tratamiento, autorización con casilla y prueba guardada. Falta poner tus datos en `data/responsable.json` |
> | **Límite de registros** y límite de inicios de sesión en memoria | **Resuelto en la [fase 12](12-legal-y-seguridad.md):** límites por IP de registros, contraseñas fallidas y peticiones. Detrás de un proxy, `TRUST_PROXY=1`. Siguen en memoria (se reinician con el servidor) |
> | **Ids reutilizables** (`AUTOINCREMENT`) | Pendiente, riesgo bajo: cada consulta comprueba siempre el dueño del dato |
> | **Zona horaria** | **Resuelto:** «hoy» se calcula en hora de Colombia (`APP_TIMEZONE`, por defecto `America/Bogota`), aunque el servidor esté en UTC |

> Fase 5 — fecha: 09/11/2026. Entorno: Windows 11, Node.js 26.13.0, SQLite 3.54 (`node:sqlite`), navegador Chromium del panel de Claude.

## Veredicto

**No publicar todavía en internet.** La aplicación funciona correctamente en todo lo que se ha podido probar (80/80 pruebas automáticas y las pruebas manuales en navegador), pero quedan **2 problemas críticos abiertos** (HTTPS y validez legal de las facturas) y **1 mitigado en el código que exige un paso al desplegar** (sacar las copias de seguridad fuera del servidor). Ninguno es un fallo de código; ver «Problemas críticos». Para uso **local o un piloto privado**, está lista.

> Actualizado tras añadir copias de seguridad automáticas y corregir los fallos menores de la interfaz (ver «Actualización posterior» al final).

## Cómo se ha probado

- **Automáticas** (`npm test`): 80 pruebas en 9 ficheros. Cada fichero arranca el servidor HTTP real con una base de datos SQLite **nueva y temporal** que se borra al terminar. Los resultados esperados están calculados a mano.
- **Manuales en navegador**: servidor real con una BD separada (`data/e2e-pruebas.db`) y dos usuarios de prueba (`tests/fixtures/usuarios-e2e.json`). **Esa BD se ha borrado al terminar**; la BD real (`data/app.db`) no se ha creado ni tocado.

## Resultados por área

Leyenda: ✅ superada · ⚠️ superada con observaciones · ⛔ no ejecutada (ver la sección siguiente). Ninguna prueba ha quedado en ❌.

### Registro

| Prueba | Auto | Navegador |
|---|---|---|
| Alta correcta inicia sesión; cookie `HttpOnly` + `SameSite=Lax` | ✅ | ✅ |
| Email normalizado a minúsculas; duplicado sin distinguir mayúsculas → 409 | ✅ | — |
| Contraseña: mínimo 8, con letras y números; nombre obligatorio; email válido | ✅ | ✅ (errores bajo cada campo) |
| Las contraseñas no coinciden (formulario) | — | ✅ |
| Contraseña guardada con scrypt + sal, nunca en claro | ✅ | — |
| Cuenta nueva sin datos de ejemplo (estado vacío) | ✅ | ✅ |

### Inicio de sesión y sesiones

| Prueba | Auto | Navegador |
|---|---|---|
| Login correcto (email con mayúsculas y espacios) | ✅ | ✅ |
| Contraseña incorrecta y email inexistente → mismo mensaje (no revela cuentas) | ✅ | ✅ |
| Bloqueo tras 5 fallos (429 + `Retry-After`), sin afectar a otras cuentas | ✅ | ⛔ |
| Cerrar sesión invalida la sesión en el servidor (la cookie copiada deja de valer) | ✅ | ✅ |
| Sesión caducada → la app vuelve al login con aviso y sin mostrar datos | ✅ (401) | ✅ |
| Cookie manipulada o inventada → 401 | ✅ | — |
| Cambio de contraseña: valida la actual, cierra las otras sesiones | ✅ | ⛔ (solo API) |
| Eliminar cuenta: pide contraseña y borra todo en cascada (también eventos) | ✅ | ⛔ (solo API) |

### Permisos

| Prueba | Auto | Navegador |
|---|---|---|
| Sin sesión: las 18 rutas protegidas responden 401 | ✅ | — |
| Usuario B no puede leer/editar/borrar movimientos, facturas ni eventos de A (404) | ✅ | ✅ (factura de A por URL → «Factura no encontrada») |
| Resumen, configuración y numeración de facturas independientes por usuario | ✅ | ✅ (B ve su cuenta vacía) |
| Ids manipulados (`abc`, `-1`, `1 OR 1=1`…) → 404, nunca 500 | ✅ | — |
| Ingreso generado por una factura no editable/borrable directamente (409) | ✅ | ✅ (solo «Ver factura») |
| CSRF: `Origin` ajeno o `Sec-Fetch-Site: cross-site` → 403 | ✅ | — |
| XSS: HTML en nombres/conceptos se muestra como texto | ✅ (se guarda tal cual) | ✅ (no se inyecta en factura ni en lista) |

### Persistencia de datos

| Prueba | Auto | Navegador |
|---|---|---|
| CRUD de movimientos con recálculo de balances | ✅ | ✅ |
| Reiniciar el servidor: datos, sesión y resumen idénticos | ✅ | ✅ |
| Proceso detenido sin cierre ordenado: los datos del WAL se recuperan | — | ✅ |
| Migración nueva (calendario) sobre una BD con datos | ✅ | ✅ |
| Facturas: crear/editar/cobrar/eliminar sincroniza el ingreso y el Dashboard | ✅ | ✅ |
| Eventos del calendario persisten tras reinicio | ✅ | ✅ |

### Errores

| Prueba | Auto | Navegador |
|---|---|---|
| JSON mal formado o que no es objeto → 400; tipo de contenido erróneo → 415 | ✅ | — |
| Cuerpo > 100 KB → 413; el servidor sigue respondiendo después | ✅ | — |
| Ruta inexistente → 404 JSON; método no permitido → 405 | ✅ | — |
| Fallo interno (tabla dañada) → 500 genérico, sin SQL ni traza | ✅ | — |
| Ficheros estáticos: sin acceso fuera de `/public` (`..`, `%2e%2e`, `\`) | ✅ | — |
| Cabeceras: CSP, `nosniff`, `X-Frame-Options`, `no-store` en la API | ✅ | ✅ (sin violaciones de CSP en consola) |
| Validación por campo en formularios (movimiento, factura, evento, registro) | ✅ | ✅ |
| Sin conexión al guardar: mensaje claro, el formulario conserva los datos y se puede reintentar sin duplicar | — | ✅ |

### Adaptación móvil (Chromium emulando 375 × 812)

| Prueba | Resultado |
|---|---|
| Sin desplazamiento horizontal en las 8 pantallas (login, registro, Dashboard, Movimientos, Facturas, detalle de factura, Calendario, Configuración) | ✅ ancho del documento = 375 px en todas |
| Navegación inferior fija y visible; enlaces de 54 px de alto; el contenido no queda tapado | ✅ |
| Campos con letra de 16 px (evita el zoom automático de iPhone) | ✅ |
| Tablas convertidas en tarjetas; KPI en 2 columnas | ✅ |
| Formularios a pantalla completa con botones siempre visibles | ✅ |
| Calendario: puntos de color por día y panel del día debajo | ✅ |
| Tema claro y oscuro | ✅ |
| Todos los campos tienen etiqueta asociada | ✅ |
| Tamaño de todos los botones y enlaces táctiles | ✅ ≥ 44 px en las 6 pantallas con sesión (antes, 34–42 px; corregido) |
| Foco al abrir un formulario en pantalla táctil | ✅ va al diálogo, no a un campo (no abre el teclado de golpe) |
| Tabla a ~800 px de ancho | ✅ tras corregir el corte de columnas (ver «Corregidos») |

## Pruebas NO ejecutadas (no se dan por superadas)

| Prueba | Motivo |
|---|---|
| Dispositivos reales iOS Safari y Android | Solo se ha podido emular el tamaño en Chromium |
| Firefox y Safari de escritorio | No disponibles en este entorno. La app usa `<dialog>` y `:has()`, que requieren versiones recientes |
| Lector de pantalla (VoiceOver/NVDA) | Solo se comprobó por código que todos los campos tienen etiqueta |
| HTTPS y cookie `Secure` en un despliegue real | No hay servidor desplegado; el modo `COOKIE_SECURE=1` no se ha ejercitado |
| Bloqueo por intentos fallidos, cambio de contraseña y eliminación de cuenta **desde la interfaz** | Probados solo por API (pruebas automáticas) |
| Exportar CSV y abrirlo en Excel | No se descargó ningún fichero |
| Imprimir / guardar factura en PDF | Hay estilos de impresión, pero no se ha verificado el resultado impreso |
| Carga, rendimiento y usuarios concurrentes | Fuera del alcance de estas pruebas |
| Zonas horarias distintas (Canarias, extranjero) y cambios de hora | No probado |
| Restaurar en Linux/macOS con el servidor en marcha | Solo probado en Windows, donde el sistema bloquea el fichero y la restauración se niega (EBUSY). En Linux/macOS renombrar un fichero abierto está permitido: allí la protección es la instrucción de detener el servidor |
| Copias guardadas fuera del servidor | Depende del despliegue (disco externo, almacenamiento en la nube); no hay servidor desplegado |

## Problemas críticos (bloquean la publicación)

| # | Problema | Riesgo | Qué hacer |
|---|---|---|---|
| **C1** | La app sirve **HTTP sin cifrar** | En internet, contraseñas y cookies de sesión viajarían en claro | Publicar solo detrás de un proxy con TLS (Caddy, Nginx o la plataforma de hosting), arrancar con `COOKIE_SECURE=1` y añadir HSTS. Repetir el login en ese entorno |
| **C2** — *mitigado* | ~~Sin copias de seguridad~~ → **Ya hay copias automáticas** verificadas, con rotación y restauración probada (ver «Actualización posterior»). **Pendiente al desplegar:** guardarlas fuera del servidor | Si las copias se quedan en el mismo disco, un fallo de ese disco se lleva la base de datos y las copias a la vez | Apuntar `BACKUP_DIR` a un disco externo o a una carpeta sincronizada con almacenamiento externo, y repetir una restauración en ese entorno |
| **C3** | El módulo de **Facturas no está preparado para uso legal real** en España: permite editar y borrar facturas emitidas (deberían anularse con una rectificativa), deja crear facturas sin el NIF del emisor (solo avisa) y no contempla VeriFactu | Facturas no válidas fiscalmente, con posibles sanciones para el usuario | Revisión con un asesor fiscal antes de publicarlo; mientras tanto, publicar sin el módulo o marcarlo claramente como «borrador / no válido como factura» |

## Otros problemas pendientes

| Gravedad | Problema |
|---|---|
| Alta | **Sin recuperación de contraseña**: quien la olvida pierde el acceso a sus datos (requiere un servicio de email) |
| Alta | **Cálculo de impuestos simplificado**: no contempla gastos de difícil justificación, reducciones del IRPF, recargo de equivalencia ni estimación objetiva. Está rotulado como «estimación orientativa», pero debería validarlo un asesor |
| Alta | **RGPD**: faltan política de privacidad, condiciones de uso y exportación completa de datos (hoy solo CSV de movimientos) |
| Media | El límite de intentos de login vive en memoria (se reinicia al reiniciar el servidor) y no hay límite para el registro de cuentas |
| Media | SQLite reutiliza el id más alto tras un borrado: una pestaña antigua podría referirse a un registro nuevo del mismo usuario. Conviene `AUTOINCREMENT` |

Los tres problemas de gravedad baja (botones pequeños, foco inicial y «Reintentar» en un 404) están corregidos: ver «Actualización posterior».

## Corregidos durante las pruebas

1. **Listeners duplicados** al volver a una pantalla (confirmaciones dobles): ahora cada navegación crea un contenedor nuevo.
2. **Tabla cortada** a anchos intermedios (~800 px) y desbordamiento de página: ahora la tabla se desplaza dentro de su contenedor.
3. **Prueba mal planteada** (facturas, «cambiar de año»): el dato de prueba tenía un vencimiento anterior a la nueva fecha y saltaba otro error antes; se corrigió la prueba, no la app.

## Observación del entorno (no es un defecto de la app)

Durante las pruebas del calendario la interfaz tardó unos segundos en actualizarse tras un borrado. Con la página instrumentada se comprobó que estaba en `visibilityState: "hidden"` dentro del panel de pruebas y que Chrome retrasaba el evento `close` del diálogo unos 2,5 s; después la secuencia fue correcta (DELETE 204 → recarga → repintado). En una pestaña visible es inmediato.

## Actualización posterior: copias de seguridad y arreglos de interfaz

### Copias de seguridad (C2)

| Qué | Cómo |
|---|---|
| Automáticas | Al arrancar, si no hay una copia de menos de 24 h, se hace una; después, cada 24 h (`BACKUP_INTERVAL_HOURS`, 0 = desactivar) |
| Dónde | `data/backups/` por defecto, o `BACKUP_DIR` |
| Coherencia | `VACUUM INTO`: copia consistente sin parar el servidor, incluidos los datos aún en el WAL |
| Verificación | Cada copia pasa `PRAGMA integrity_check` y se comprueba que tiene las tablas esperadas antes de darla por buena; si falla, se descarta y se registra el error |
| Rotación | Se conservan las 14 más recientes (`BACKUP_KEEP`) |
| Manual | `npm run backup` (también con el servidor en marcha) y `npm run backup -- --list` |
| Restaurar | `npm run restore -- <copia.db> --confirmar` con el servidor parado. Verifica la copia antes, no borra la base de datos actual (la renombra a `app.db.antes-de-restaurar-<fecha>`) y verifica el resultado |

**Pruebas (`tests/backup.test.js`, 5/5):** copia coherente con el servidor en marcha; rechazo de copias dañadas o incompletas; rotación; programación (copia al arrancar, sin duplicados, desactivable); y restauración completa: copia → borrado accidental → servidor parado → `restore` sin `--confirmar` no toca nada → una copia inválida se rechaza → restauración → el dato borrado vuelve y el usuario puede iniciar sesión.

**En el servidor real:** al arrancar se creó y verificó la primera copia. Con el servidor en marcha, `restore --confirmar` se negó (Windows bloquea el fichero) sin modificar nada.

### Fallos menores de la interfaz

| Problema | Corrección | Verificado |
|---|---|---|
| Botones de 34–42 px en móvil | En móvil todos los botones miden al menos 44 px | Auditoría en 6 pantallas: 0 por debajo de 44 px, sin desbordamiento horizontal |
| Foco inicial en el botón de cerrar | Con ratón/teclado, primer campo; en confirmaciones, «Cancelar» (opción segura); en táctil, el diálogo (no abre el teclado) | Escritorio: fecha / contraseña / «Cancelar». Móvil: diálogo |
| «Reintentar» en un 404 | Muestra «No encontrado» y un botón «Volver» | Factura inexistente → «No encontrado» → «Volver» regresa a la pantalla anterior |

Suite completa tras los cambios: **80/80**. Los datos y copias de las pruebas E2E se borraron al terminar.
