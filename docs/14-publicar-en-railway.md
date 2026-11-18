# 14. Publicada en internet (Railway)

> 18/11/2026. CuentaClara está en línea en **https://cuentaclara-production-9f9faceb.up.railway.app**, con HTTPS.

## Cómo está montada

| Pieza | Dónde | Notas |
|---|---|---|
| Código | GitHub, repositorio **privado** `monsalvealejandro0000-dotcom/cuentaclara` (rama `main`) | Cada `git push` a `main` vuelve a publicar la app sola |
| Servidor | Railway, proyecto `authentic-harmony`, servicio `cuentaclara`, región **US West** | Railway compila (`npm run build`) y arranca (`npm start`) con Node 26 (`.node-version`) |
| Base de datos | Volumen `cuentaclara-volume` montado en **`/data`** (`DB_PATH=/data/app.db`) | Las copias automáticas quedan en `/data/backups` (mismo disco). Las copias fuera del servidor se bajan a tu computador: ver «Copias en tu computador». Las copias automáticas de Railway (pestaña Backups) solo vienen con su plan Pro, de pago |
| Plan | Prueba gratis de Railway (30 días o 5 USD de crédito, sin tarjeta) y después el plan gratis | Si se acaba el crédito del mes, la app se apaga hasta el mes siguiente; no cobra nada sin tarjeta |

## Variables del servicio (Railway → cuentaclara → Variables)

| Variable | Valor | Para qué |
|---|---|---|
| `HOST` | `0.0.0.0` | Escuchar fuera del contenedor |
| `DB_PATH` | `/data/app.db` | Base de datos en el volumen |
| `COOKIE_SECURE` | `1` | Cookie solo por HTTPS (`__Host-sid`) y cabecera HSTS |
| `TRUST_PROXY` | `1` | Railway pone un proxy delante: los límites por IP ven la IP real |
| `ALLOWED_HOSTS` | `${{RAILWAY_PUBLIC_DOMAIN}}` | Solo se acepta el dominio de la app |
| `APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Enlaces de los correos |
| `APP_TIMEZONE` | `America/Bogota` | «Hoy» en hora de Colombia |
| `RESPONSABLE_JSON` | El contenido de `data/responsable.json` en una línea | **Lo pegas tú** (lleva tu cédula). Al arrancar se escribe `/data/responsable.json` |
| `COBRO_JSON` | Contenido de `data/cobro.json` (ver fase 11) | Cuando quieras cobrar Pro o Contador. Lo pegas tú |
| `CORREO_JSON` o `BREVO_API_KEY` | Configuración de Brevo (ver fase 13) | Sin esto la app no envía correos: nadie puede confirmar su correo, recuperar la contraseña ni avisar un pago |
| `BACKUP_DOWNLOAD_TOKEN` | Una clave aleatoria de 43 caracteres (la misma de `data/copia-remota.json`) | Activa la descarga de copias. **La pegas tú**: quien la tenga puede bajar los datos de todas las cuentas |

`RESPONSABLE_JSON`, `COBRO_JSON` y `CORREO_JSON` los lee [`server/config-env.js`](../server/config-env.js): si la variable existe, manda sobre el archivo. Su contenido nunca se muestra en los registros.

## Comandos del administrador en el servidor

En Railway → servicio `cuentaclara` → pestaña **Console** se abre una terminal dentro del servidor. Ahí `npm` y `node` no están en el PATH: primero escribe esta línea (una vez por sesión de la consola):

```bash
export PATH=/mise/installs/node/26.13.0/bin:$PATH
```

Después funcionan los scripts, siempre con `--db=/data/app.db`, por ejemplo:

```bash
node scripts/pagos.js --db=/data/app.db
```

```bash
node scripts/plan.js --db=/data/app.db --email=correo@ejemplo.com --plan=pro
```

```bash
node scripts/seguridad.js --db=/data/app.db --email=correo@ejemplo.com --confirmar-correo
```

Si Railway actualiza Node, cambia `26.13.0` por la versión que muestre `ls /mise/installs/node`.

## Copias en tu computador (gratis)

Railway solo hace copias del volumen con su plan Pro. En su lugar, tu computador baja una copia cada día:

- El servidor tiene `GET /api/admin/copia` ([`server/routes/backup.js`](../server/routes/backup.js)): hace una copia nueva, la verifica y la entrega solo con la clave `BACKUP_DOWNLOAD_TOKEN` en la cabecera `Authorization: Bearer …`. Sin esa variable, la dirección no existe (404). 10 intentos por hora y por IP.
- [`scripts/descargar-copia.js`](../scripts/descargar-copia.js) (`npm run copia-servidor`) la baja a **`data/copias-servidor/`**, la verifica, conserva las 30 más recientes y anota cada intento en `data/copias-servidor/registro.txt`. Lee la dirección y la clave de **`data/copia-remota.json`** (no se sube a GitHub).
- Una tarea programada de Windows, **«CuentaClara - copia del servidor»**, lo ejecuta cada día a las 12:00 (o en cuanto prendas el computador si estaba apagado). Se ve y se borra en el Programador de tareas.

Para restaurar en el servidor una copia bajada: súbela con la pestaña Console o pide ayuda; en tu computador, `npm run restore -- data/copias-servidor/<archivo>.db --confirmar`.

**Cuidado:** esas copias tienen los datos de todos tus usuarios. No las compartas y protege tu computador con contraseña.

## Pendiente

1. **Dominio propio y correo (Brevo)**: hacen falta para confirmar correos, recuperar contraseñas y que la gente avise sus pagos.
2. Lo demás de la lista «Lo que tienes que hacer antes de publicar» de la [fase 12](12-legal-y-seguridad.md) (factura electrónica de lo que cobres, PQR a tiempo, revisar la marca en la SIC).
