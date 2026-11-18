# 13. Verificar el correo, recuperar la contraseña y segundo factor

> Fase 13, 18/11/2026. Las decisiones principales se tomaron contigo **antes** de programar (tabla «Decisiones aprobadas»). El resto son valores por defecto razonables que puedes cambiar. Al final: cómo activar el correo, los archivos cambiados y las pruebas.

## Punto de partida

| | Antes de esta fase |
|---|---|
| Correo de la cuenta | Nadie comprobaba que fuera de la persona. Un error al escribirlo dejaba la cuenta sin forma de recuperarse |
| Olvidé mi contraseña | No existía. Solo se podía cambiar estando dentro de la cuenta |
| Segundo factor | No existía. Quien supiera la contraseña entraba |
| Invitación al contador | Se asociaba solo por el correo: alguien podía registrarse antes con el correo del contador y aceptar la invitación |

## Decisiones aprobadas (18/11/2026)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿Con qué servicio se envían los correos? | **Brevo**, por su API en HTTPS: gratis hasta 300 correos al día, panel en español y funciona aunque el servidor bloquee los puertos de correo. **Mientras no lo configures**, la app no envía nada: muestra el correo (con su enlace) en la ventana negra, para que puedas probar en tu computador |
| 2 | ¿Qué pasa con una cuenta que no ha confirmado su correo (también las que ya existían)? | **Usa la app con un aviso** arriba («Confirma tu correo») con «Reenviar» y «Cambiar correo». Sin confirmarlo **no** puede: activar la verificación en dos pasos, invitar a un contador, ver o aceptar invitaciones como contador, ni avisar un pago |
| 3 | Con la verificación en dos pasos, ¿cuándo se pide el código? | **En cada inicio de sesión**. Las sesiones ya duran 30 días. **No hay cookie nueva** ni cambia la Política de cookies |
| 4 | ¿Y si alguien pierde el celular y también sus códigos de respaldo? | **Tú se la quitas** desde la terminal (`npm run seguridad -- --email=… --quitar-2fa`) después de comprobar que es la persona. Queda en su actividad de seguridad y le llega un aviso por correo |

## Valores por defecto (los puedes cambiar)

| # | Tema | Cómo queda | Por qué |
|---|---|---|---|
| 5 | Enlaces de los correos | Un código aleatorio de 256 bits, **de un solo uso**. La app solo guarda su **huella SHA-256**: quien robe la base de datos no puede usar los enlaces. Pedir uno nuevo anula los anteriores. Va después del `#` de la dirección (`…/#/restablecer?t=…`), así que nunca llega a los registros del servidor ni a otras webs | Es lo que recomienda OWASP para recuperar cuentas |
| 6 | Caducidad | Confirmar correo: **24 horas**. Recuperar contraseña: **30 minutos**. Cambiar de correo: **24 horas**. El paso del código al iniciar sesión: **5 minutos** | Corto para lo peligroso (cambiar la contraseña); razonable para lo demás |
| 7 | «Olvidé mi contraseña» | **Siempre la misma respuesta**, exista o no la cuenta: «Si hay una cuenta con ese correo, te enviamos un enlace». Al cambiarla se **cierran todas las sesiones** y no entra sola: hay que iniciar sesión (con el código, si tiene verificación en dos pasos). **No** quita la verificación en dos pasos. Si el correo no estaba confirmado, queda confirmado (abrir el enlace lo demuestra) | No revelar qué correos tienen cuenta; que recuperar la contraseña no sirva para saltarse el segundo factor |
| 8 | Avisos de seguridad por correo | Cuando cambia la contraseña, se activa o desactiva la verificación en dos pasos, se usa un código de respaldo, alguien falla 5 códigos después de escribir bien la contraseña y cuando cambia el correo (el aviso va al anterior). **Solo a correos confirmados** | La persona se entera si alguien más está tocando su cuenta |
| 9 | Cambiar de correo | Con la contraseña. El correo **cambia cuando se abre el enlace** que llega al nuevo; mientras tanto sigue el anterior | Demostrar que el correo nuevo es suyo y no dejar la cuenta con un correo mal escrito |
| 10 | Códigos de respaldo | **10 códigos** de 10 letras y números (`k7m2p-x9qrt`), cada uno sirve **una vez**. Se ven **solo al crearlos**; se guardan como huella. Se pueden generar otros (los anteriores dejan de servir) | Entrar sin el celular |
| 11 | Desactivar la verificación en dos pasos o generar códigos nuevos | Pide **contraseña y un código** (de la app o de respaldo) | Quien roba una sesión abierta no puede quitarla |
| 12 | Límites | Reenviar o cambiar correo: 5 por hora por cuenta. «Olvidé mi contraseña»: 10 por hora por IP y 3 correos por hora a una misma dirección (los de más no se envían, sin decirlo). Códigos incorrectos: 5 cada 15 minutos y 20 al día por cuenta; un mismo paso de código acepta máximo 5 intentos | Frenar a quien prueba códigos o usa la app para llenar de correos a otra persona |
| 13 | Actividad de seguridad | Configuración muestra los últimos cambios de seguridad (qué, cuándo, IP y navegador). Se borran a los **12 meses** y al eliminar la cuenta | «¿Fuiste tú?» |
| 14 | Contador ya aceptado antes de esta fase | Sigue funcionando. Lo nuevo (ver y aceptar invitaciones) exige correo confirmado | No cortar un acceso que el cliente ya autorizó |

## Mapa de navegación

```
SIN SESIÓN
Iniciar sesión (#/login) ──► contraseña correcta
      │                        ├─ sin verificación en dos pasos ──► Dashboard
      │                        └─ con verificación en dos pasos ──► «Verificación en dos pasos» (mismo cuadro)
      │                                                               código de la app o de respaldo ──► Dashboard
      └─ «¿Olvidaste tu contraseña?» ──► Recuperar contraseña (#/recuperar) ──► correo con enlace (30 min)
                                                                                    │
                    Nueva contraseña (#/restablecer?t=…) ◄──────────────────────────┘
                          └─ «Contraseña cambiada» ──► Iniciar sesión

CORREO DE CONFIRMACIÓN (al registrarse, al reenviarlo o al cambiar de correo)
Enlace ──► Confirmar correo (#/confirmar-correo?t=…) ──► «Correo confirmado» ──► CuentaClara o Iniciar sesión

CON SESIÓN
Todas las pantallas ── aviso «Confirma tu correo» (si falta) ── Reenviar · Cambiar correo
Configuración ── Correo (confirmar · cambiar)
              ── Cambiar contraseña (como antes)
              ── Verificación en dos pasos (activar · códigos nuevos · desactivar)
              ── Actividad de seguridad

TÚ (administrador, en la terminal)
npm run seguridad -- --email=ana@correo.com                 → estado de la cuenta
npm run seguridad -- --email=ana@correo.com --quitar-2fa    → quita la verificación en dos pasos
npm run seguridad -- --email=ana@correo.com --cerrar-sesiones
npm run seguridad -- --probar-correo=tu@correo.com          → comprueba que Brevo envía
```

---

## Pantalla: Iniciar sesión (`#/login`), cambios

| Bloque | Información | Al interactuar |
|---|---|---|
| Bajo «Contraseña» | Enlace **«¿Olvidaste tu contraseña?»** | Abre Recuperar contraseña |
| Paso 2 (solo con verificación en dos pasos) | Título «Verificación en dos pasos». «Abre tu app de autenticación (Google Authenticator, Microsoft Authenticator…) y escribe el código de 6 dígitos de CuentaClara». Campo **Código** (teclado numérico en el celular; el celular puede ofrecer el código solo) | «Verificar». Código incorrecto: «Código incorrecto. Si estás seguro de que es el que ves, revisa que la hora de tu celular sea automática». Tras 5 errores o 5 minutos: vuelve al paso 1 con «Vuelve a escribir tu contraseña» |
| | Enlace **«Usar un código de respaldo»** | El campo pasa a «Código de respaldo» (`k7m2p-x9qrt`). Al entrar: «Usaste un código de respaldo. Te quedan N» (con 3 o menos, sugiere generar otros) |
| | Enlace «¿Perdiste el celular y los códigos?» | Explica: escríbenos desde tu correo a [correo de contacto]; comprobamos que eres tú y quitamos la verificación en dos pasos |
| | «Volver» | Vuelve al paso 1 |

## Pantalla nueva: Recuperar contraseña (`#/recuperar`, sin sesión)

| Bloque | Información | Al interactuar |
|---|---|---|
| Cuadro | «¿Olvidaste tu contraseña?» · «Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva». Campo **Correo** | «Enviar enlace» |
| Después de enviar | «Revisa tu correo. Si hay una cuenta con **ana@correo.com**, te enviamos un enlace. Vence en 30 minutos. Si no lo ves, mira en spam». Igual exista o no la cuenta | «Volver a iniciar sesión» · «Enviar otra vez» |
| Modo local (sin Brevo) | Además: «Modo local: el enlace aparece en la ventana negra del servidor» | — |

## Pantalla nueva: Nueva contraseña (`#/restablecer?t=…`, con o sin sesión)

| Situación | Información | Al interactuar |
|---|---|---|
| Enlace válido | «Crea una contraseña nueva para **ana@correo.com**». Campos **Nueva contraseña** (con la ayuda de siempre) y **Repite la contraseña** | «Cambiar contraseña». Errores bajo cada campo (las mismas reglas que al registrarse) |
| Listo | «Tu contraseña cambió. Cerramos tu sesión en todos los dispositivos». Aviso por correo | «Iniciar sesión» |
| Enlace vencido, usado o incompleto | «Este enlace ya no sirve. Los enlaces vencen a los 30 minutos y solo se pueden usar una vez» | «Pedir otro enlace» |

La dirección se limpia al abrir la pantalla: el enlace no queda en el historial del navegador.

## Pantalla nueva: Confirmar correo (`#/confirmar-correo?t=…`, con o sin sesión)

Se confirma sola al abrirla (no hay nada que escribir).

| Situación | Información | Al interactuar |
|---|---|---|
| Confirmando | «Confirmando tu correo…» | — |
| Listo | «Tu correo **ana@correo.com** quedó confirmado». Si era un cambio de correo: «Tu correo ahora es **nuevo@correo.com**» | «Ir a CuentaClara» (con sesión) o «Iniciar sesión» |
| Ya estaba confirmado | «Tu correo ya estaba confirmado» | Igual |
| Enlace vencido o usado | «Este enlace ya no sirve. Pide uno nuevo desde el aviso de CuentaClara o desde Configuración» | «Ir a CuentaClara» |

## Aviso «Confirma tu correo» (todas las pantallas con sesión)

| Bloque | Información | Al interactuar |
|---|---|---|
| Franja arriba del contenido | «Confirma tu correo **ana@correo.com**. Te enviamos un enlace; vence en 24 horas» | **«Reenviar»**: «Te enviamos otro enlace. Revisa también spam». **«Cambiar correo»**: abre el cuadro de cambiar correo. Al volver a la pestaña después de confirmar en el celular, el aviso desaparece solo |

## Configuración, cambios

| Tarjeta | Información | Al interactuar |
|---|---|---|
| **Correo** (nueva) | El correo y su estado: «Confirmado» o «Sin confirmar». Si hay un cambio en curso: «Cambio pendiente a nuevo@correo.com: abre el enlace que te enviamos» | «Reenviar enlace» (sin confirmar). **«Cambiar correo»** → cuadro con **Correo nuevo** y **Contraseña actual** → «Te enviamos un enlace a nuevo@…; tu correo cambiará cuando lo abras» |
| Cambiar contraseña | Como antes | Además llega un aviso por correo |
| **Verificación en dos pasos** (nueva) | Desactivada: «Además de tu contraseña, te pediremos un código de tu celular al entrar. Si alguien descubre tu contraseña, no podrá entrar». Sin correo confirmado: el botón está desactivado y dice por qué | **«Activar»** → cuadro de 3 pasos (abajo) |
| | Activada: «Activada desde el 18 de noviembre de 2026 · Te quedan 10 códigos de respaldo» | **«Generar códigos nuevos»** y **«Desactivar»**: piden contraseña y un código |
| **Actividad de seguridad** (nueva) | Últimos cambios: «Contraseña cambiada · hoy a las 10:42 · Chrome en Windows · IP 190.25.…». Hasta 20; «Ver todo» | — |

### Cuadro «Activar la verificación en dos pasos»

| Paso | Información | Al interactuar |
|---|---|---|
| 1. Confirma que eres tú | Campo **Contraseña** | «Continuar» |
| 2. Conecta tu app | «Instala una app de autenticación (Google Authenticator, Microsoft Authenticator, 2FAS…) y escanea este código». **Código QR** (dibujado en tu navegador: la clave no sale a ningún servicio). «¿No puedes escanearlo? Escribe esta clave: `ABCD EFGH …`» con **«Copiar»**. En el celular, botón **«Abrir en mi app de autenticación»**. Campo **Código de 6 dígitos** | «Activar». Código incorrecto: se puede reintentar |
| 3. Guarda tus códigos de respaldo | Los 10 códigos. «Cada uno sirve una vez para entrar sin el celular. Guárdalos en un lugar seguro: no los volverás a ver». **«Copiar»** y **«Descargar .txt»**. Casilla «Guardé mis códigos» | «Listo» se activa con la casilla. Al activarla se cierran tus otras sesiones y llega un aviso por correo |

## Mi contador, Clientes y Pagar plan, sin correo confirmado

| Pantalla | Qué se ve |
|---|---|
| Configuración → Mi contador | En lugar del formulario: «Confirma tu correo para invitar a tu contador» con «Reenviar enlace». Si ya tenía un contador, lo sigue viendo y puede quitarle el acceso |
| Clientes (plan Contador) | Las invitaciones pendientes no aparecen: «Confirma tu correo para ver las invitaciones de tus clientes». Los clientes ya aceptados siguen ahí |
| Pagar plan | En lugar del formulario «Ya pagué»: «Confirma tu correo para avisar un pago: lo necesitamos para escribirte sobre tu compra» |

## Correos que envía la app

| Correo | Cuándo | Lleva enlace |
|---|---|---|
| Confirma tu correo | Al registrarse y al pedir «Reenviar» | Sí, 24 h |
| Restablece tu contraseña | «Olvidé mi contraseña» con un correo que tiene cuenta | Sí, 30 min |
| Confirma tu nuevo correo | Al cambiar de correo (va al nuevo) | Sí, 24 h |
| Tu contraseña cambió | Al cambiarla o restablecerla | No |
| Tu correo cambió | Al confirmar el correo nuevo (va al anterior) | No |
| Activaste / desactivaste la verificación en dos pasos · La quitamos por tu solicitud | Al activarla, desactivarla o quitarla tú desde la terminal | No |
| Usaste un código de respaldo | Al entrar con uno; dice cuántos quedan | No |
| Alguien intentó entrar a tu cuenta | 5 códigos incorrectos después de escribir bien la contraseña: «Cambia tu contraseña» | No |

Todos dicen qué hacer «si no fuiste tú», llevan tu correo de contacto como «Responder a» y no tienen publicidad, imágenes de terceros ni seguimiento.
