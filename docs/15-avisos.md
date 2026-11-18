# 15. Avisos de cuentas nuevas y entradas

> 18/11/2026. Cuando alguien crea una cuenta o entra a CuentaClara, te llega un aviso al celular (app **ntfy**, gratis) y otro a este computador.

## Qué avisa

| Aviso | Cuándo | Qué dice |
|---|---|---|
| **Cuenta nueva en CuentaClara** 🎉 | Cada vez que alguien se registra | «Se registró la cuenta #3. Ya van 3 cuentas.» |
| **Alguien entró a CuentaClara** 👋 | Cuando alguien inicia sesión o abre la app con la sesión abierta. Como mucho **un aviso por cuenta cada 3 horas**, para no llenarte de avisos | «La cuenta #3 entró a la app.» |

- Tus propias cuentas (las de `"ignorar"`) nunca avisan.
- **Privacidad:** el aviso solo lleva el **número** de la cuenta, nunca el nombre, el correo ni la IP: ntfy es un servicio de terceros. En el computador, el nombre y el correo salen de tus copias del servidor (fase 14), que nunca salen de tu equipo. Nada de esto se guarda en la base de datos.
- Tocar el aviso abre la app.

## Cómo funciona

1. El servidor ([`server/avisos.js`](../server/avisos.js)) publica cada aviso en un **tema secreto** de [ntfy.sh](https://ntfy.sh). Si ntfy falla, el registro y la entrada funcionan igual.
2. **Celular:** la app ntfy está suscrita a ese tema y muestra el aviso al instante.
3. **Computador:** la tarea programada **«CuentaClara - avisos»** ejecuta `npm run avisos` ([`scripts/avisos.js`](../scripts/avisos.js)) cada 15 minutos sin abrir ventanas. Pide a ntfy los avisos nuevos (ntfy los guarda 12 horas), les pone el nombre y el correo, y los muestra como notificación de Windows. Si una cuenta es nueva y aún no está en las copias, baja una copia nueva. Cada aviso queda anotado en `data/avisos-registro.txt`.

Quien conozca el tema puede leer los avisos (solo números de cuenta) y enviarte avisos falsos. No lo publiques.

## Configuración

`data/avisos.json` (no se sube a GitHub):

```json
{ "ntfy": "https://ntfy.sh/cuentaclara-<letras al azar>", "ignorar": ["alejomonsalve075@gmail.com"] }
```

- **Servidor (Railway):** variable `AVISOS_JSON` con ese mismo contenido en una línea ([`server/config-env.js`](../server/config-env.js)). Al arrancar, el registro dice «Avisos de cuentas nuevas y entradas (ntfy): activados».
- **Celular:** instala **ntfy** (Play Store o App Store) → botón **+** (*Subscribe to topic* = suscribirse a un tema) → escribe el tema, es decir lo que va después de `https://ntfy.sh/` → **Subscribe** (Suscribirse).
- **Computador:** `npm run avisos -- --probar` envía un aviso de prueba al celular y muestra uno aquí.

Para cambiar el tema (si se filtró): pon otro en `data/avisos.json` y en `AVISOS_JSON`, y suscríbete al nuevo en el celular.

La tarea de Windows se ve, se pausa o se borra en el **Programador de tareas**. Si las notificaciones de Windows no salen, revisa en Configuración → Sistema → Notificaciones que estén activadas para **Windows PowerShell**.
