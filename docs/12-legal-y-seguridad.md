# 12. Seguridad, documentos legales y cumplimiento en Colombia

> Fase 12, 18/11/2026. Qué se hizo para que la app sea más difícil de atacar y cumpla las leyes colombianas, qué queda pendiente **para ti** antes de publicarla y cómo usar las herramientas nuevas.
>
> **Aviso:** los documentos legales son un borrador cuidadoso, no asesoría jurídica. Antes de cobrar a clientes reales, haz que los revise un abogado en Colombia.

## Lo que tienes que hacer antes de publicar

| # | Qué | Cómo |
|---|---|---|
| 1 | **Poner tus datos como responsable** (nombre o razón social, cédula o NIT, dirección, ciudad, correo, teléfono y dónde está el servidor). Hoy los documentos muestran «[pendiente: …]» | Copia [`docs/responsable.ejemplo.json`](responsable.ejemplo.json) a **`data/responsable.json`**, cambia los textos en MAYÚSCULAS y **reinicia** la app. La ley exige que estos datos estén visibles (art. 50 lit. a, Ley 1480 de 2011; art. 2.2.2.25.3.1, Decreto 1074 de 2015) |
| 2 | **HTTPS** y `COOKIE_SECURE=1` | Como ya decía el informe de pruebas. Con HTTPS la cookie pasa a llamarse `__Host-sid` |
| 3 | **`ALLOWED_HOSTS`** con tu dominio | P. ej. `ALLOWED_HOSTS=cuentaclara.co,www.cuentaclara.co`. Sin él, al escuchar en una dirección pública la app avisa en la ventana negra |
| 4 | **`TRUST_PROXY=1`** si hay un proxy delante (Nginx, Caddy, Cloudflare…) | Para que los límites por IP y el registro de consentimientos usen la IP real del visitante. **No** lo actives sin proxy: cualquiera podría inventarse la IP |
| 5 | **Factura electrónica** de lo que cobras por los planes | Si estás obligado a facturar, hazlo con un proveedor autorizado por la DIAN. Es una obligación tuya, fuera de la app |
| 6 | **Responder las PQR a tiempo** | `npm run pqr` cada pocos días. Plazo máximo: 15 días hábiles (10 para consultas de datos personales) |
| 7 | **Revisar la marca** «CuentaClara» | Busca en el sistema de propiedad industrial de la SIC que nadie la tenga registrada en tu clase antes de invertir en ella |

## 1. Más difícil de hackear

La app ya tenía una buena base (contraseñas con scrypt, sesiones guardadas solo como huella, protección CSRF, CSP estricta, consultas SQL parametrizadas, bloqueo tras 5 contraseñas fallidas). Se añadió:

| Defensa | Contra qué | Dónde |
|---|---|---|
| **Límite general de peticiones** por IP (600 cada 5 min) | Saturar el servidor o adivinar datos a fuerza de peticiones | `server/security.js`, `server/app.js` |
| **Límite de registros** por IP (10 por hora) | Crear cuentas en masa y usar el registro para averiguar qué correos existen | `server/routes/auth.js` |
| **Límite de contraseñas fallidas por IP** (30 cada 15 min, sumando todos los correos) | Probar contraseñas comunes contra muchas cuentas (*password spraying*) | `server/routes/auth.js` |
| **Límite al reescribir la contraseña actual** (5 cada 15 min) al cambiarla o eliminar la cuenta | Quien roba una sesión y quiere adivinar la contraseña | `server/routes/auth.js` |
| **Contraseñas nuevas más fuertes**: mínimo 10 caracteres, letras y números, al menos 5 distintos, ni de las más usadas ni con tu correo o tu nombre | Contraseñas que se adivinan en segundos | `server/security.js`, `server/validation.js` |
| **Cifrado de contraseñas más costoso** (scrypt N=2^15, r=8, p=3: el mínimo que recomienda OWASP). Las antiguas se vuelven a cifrar solas al iniciar sesión | Romper contraseñas si alguien roba la base de datos | `server/auth.js` |
| **Cookie `SameSite=Strict`** y, con HTTPS, prefijo **`__Host-`** | CSRF y cookies falsas plantadas desde un subdominio | `server/auth.js` |
| **Lista de dominios permitidos** (`ALLOWED_HOSTS`; en local, solo `localhost`) | *DNS rebinding*: una web ajena que apunta su dominio a tu servidor | `server/app.js`, `server/index.js` |
| **Más cabeceras**: COOP, CORP, `Permissions-Policy` ampliada, CSP con `worker-src`, `frame-src`, `media-src` en `'none'` y `upgrade-insecure-requests` con HTTPS | Ventanas e incrustaciones de otras webs, funciones del navegador que la app no usa | `server/app.js` |
| **Tiempos máximos de conexión** (cabeceras 20 s, petición 30 s) | Conexiones lentas que ocupan el servidor (*slowloris*) | `server/app.js` |
| **Rutas con codificación rota → 404** (antes, error 500) | Fallos del servidor provocados a propósito | `server/router.js` |
| **Registro de consentimientos inalterable** (ver 3) | Que alguien cambie o borre la prueba | `server/migrations/009_legal_y_pqr.sql` |

Avisos en la ventana negra: `[seguridad] … bloqueado para la IP …` cuando se activa un límite.

Siguiente nivel, fuera de esta fase: verificación del correo, recuperación de contraseña, segundo factor (2FA) y cifrar las copias de seguridad fuera del servidor.

## 2. Documentos legales

Están en **`legal/`** (Markdown) y se ven en la app en `#/legal/terminos`, `#/legal/privacidad`, `#/legal/cookies` y `#/legal/reembolsos`, **con o sin sesión**. Cada uno se puede imprimir, guardar en PDF o descargar (art. 50 lit. d, Ley 1480).

| Documento | Lo esencial |
|---|---|
| Términos y condiciones | Quién presta el servicio; qué es y qué **no** es la app (no es asesoría tributaria ni factura electrónica); planes, precios finales y pago manual; retracto; uso prohibido (Ley 1273 de 2009); responsabilidad dentro de la garantía legal, sin cláusulas abusivas; PQR; aceptación electrónica (Ley 527 de 1999) |
| Política de privacidad | Todo lo que exige el art. 2.2.2.25.3.1 del Decreto 1074 de 2015: responsable, datos y finalidades, derechos, canal y plazos de consultas (10 días hábiles) y reclamos (15), con quién se comparten, conservación, seguridad y vigencia |
| Política de cookies | Una sola cookie necesaria (sesión) y una preferencia local (tema) |
| Política de reembolsos | Retracto de 5 días hábiles con devolución total **aunque el plan ya esté activo**, devolución en máximo 15 días calendario (Ley 2439 de 2024), otros casos y reversión del pago |

**Cambiar un documento:** edítalo y **sube la `version`** de su cabecera (p. ej. `2027-03-01`) si el cambio es importante. Reinicia la app. Todas las cuentas verán la pantalla «Antes de seguir» y tendrán que aceptar la versión nueva. Para corregir una errata sin pedir aceptación de nuevo, cambia el texto sin tocar la versión: la versión anterior y la nueva quedan guardadas con sus huellas.

### ¿Necesitas pedir consentimiento para las cookies?

**No.** La app solo usa la cookie de sesión (sin ella no se puede entrar a la cuenta) y guarda el tema claro/oscuro en el navegador, sin enviarlo a ningún lado. No hay analítica, publicidad, píxeles ni recursos de terceros: las fuentes e iconos se sirven desde tu propio servidor. Colombia no tiene una ley específica de cookies; la SIC aplica la Ley 1581 a las cookies que sirven para analizar o perfilar personas, que aquí no existen, y el tratamiento de los datos de la cuenta ya se autoriza al registrarse. La Política de cookies lo explica.

**Si algún día añades** Google Analytics, el píxel de Meta o similares, sí necesitarás un aviso que pida permiso **antes** de activarlos, con «Rechazar» tan visible como «Aceptar», y guardar la elección.

## 3. Casillas y registro de consentimientos

### Dónde están las casillas

| Formulario | Casillas (sin marcar por defecto) | Enlace al lado |
|---|---|---|
| **Crear cuenta** | 1) Acepto los Términos y condiciones · 2) Autorizo el tratamiento de mis datos (Ley 1581) | «Leer términos» · «Leer política de privacidad» |
| **Antes de seguir** (cuentas creadas antes de esta fase o tras un cambio de versión) | Las mismas dos | Las mismas, más un «Leer» por cada documento nuevo |
| **Avisar un pago** | 1) Acepto los Términos y la Política de reembolsos para esta compra · 2) Autorizo el tratamiento de los datos del pago | «Leer términos» · «Leer reembolsos» · «Leer política de privacidad» |
| **Invitar a mi contador** | La autorización específica para compartir tus datos con esa persona (ya existía) | «Cómo se comparten tus datos» |

Los enlaces abren el documento en otra pestaña, para no perder lo escrito. Sin las casillas, ni la interfaz ni el servidor dejan continuar.

**Por qué no en todos los formularios:** las casillas van donde la persona contrata o entrega datos para un fin nuevo. Pedirlas al añadir un gasto o un evento no da más validez legal (ya aceptó al registrarse y se le vuelve a pedir cuando cambia la versión) y entrenaría a la gente a marcar sin leer, lo que debilita la prueba.

### Qué se guarda de cada aceptación

Tabla `consents`, una fila por documento aceptado (o autorización revocada):

| Campo | Ejemplo |
|---|---|
| Quién | id de la cuenta y correo |
| Qué | `terminos`, `privacidad`, `reembolsos` o `compartir_contador`; acepta o revoca |
| Versión exacta | `2026-11-18` y la **huella SHA-256 del texto**, cuyo contenido completo queda en `legal_texts` |
| Cuándo | Fecha y hora del servidor (UTC, con milisegundos) |
| Cómo | Formulario (registro, versión nueva, pago, contador), **texto exacto de la casilla**, IP y navegador |
| Detalle | P. ej. «Aviso de pago #12 (CC-7F3K2Q)» o «Contador: ana@correo.com» |

**Por qué es difícil de falsear:** la base de datos no deja cambiar ni borrar filas (triggers) y cada fila lleva la huella de la anterior. Si alguien con acceso al archivo quita la protección y cambia o borra algo, `npm run consentimientos -- --verificar` lo detecta. Al eliminar una cuenta se borra todo lo demás, pero esta prueba se conserva, como explica la Política de privacidad.

**Dónde verlo:**

- Cada persona, en **Configuración → Privacidad y consentimientos** (es su derecho a pedir la prueba de su autorización, art. 8 lit. b de la Ley 1581).
- Tú, en la terminal:

```bash
npm run consentimientos -- --email=ana@correo.com
```

```bash
npm run consentimientos -- --verificar
```

```bash
npm run consentimientos -- --texto=<huella>
```

## 4. Datos que se piden

Se revisó cada formulario. No sobra ningún campo:

| Formulario | Campos | ¿Necesario? |
|---|---|---|
| Crear cuenta | Nombre, correo, contraseña (×2) | Sí. El nombre identifica a la persona ante su contador; ahora lo dice bajo el campo |
| Configuración → Datos tributarios | Razón social, NIT o cédula, dirección | **Opcionales**: solo para salir como emisor en las facturas. Antes no decía que eran opcionales; ahora sí |
| Factura | Cliente, NIT y dirección del cliente | Nombre obligatorio; NIT y dirección ya eran opcionales |
| Avisar un pago | Medio, fecha, valor, comprobante, nota opcional | Sí: lo mínimo para encontrar el pago. Nunca tarjeta ni claves |
| Mi contador | Correo del contador | Sí |
| PQR | Tipo, asunto, mensaje | Sí |

Lo que **no** se pide ni se guarda: teléfono, fecha de nacimiento, ubicación, datos sensibles, datos bancarios del cliente, analítica. La IP solo se guarda en la prueba de las aceptaciones; para los límites de intentos vive unos minutos en memoria.

## 5. Derechos de las imágenes

| Elemento | Qué es | Derechos |
|---|---|---|
| Logotipo y favicon | Dibujo SVG propio (cuadrado redondeado, línea y punto) creado para este proyecto | Tuyos. Al ser formas geométricas simples, su protección como obra es débil: si quieres exclusividad, registra la marca |
| Iconos | Lucide (`lucide-react`) | Licencia ISC: uso comercial permitido conservando el aviso |
| Fuentes | Geist y Geist Mono, servidas desde tu servidor | SIL Open Font License 1.1: uso comercial permitido, incluido incrustarlas en la web |
| Panel de analítica | Componente AnalyticsBento de vasnev.art, adaptado. Sus gráficos los dibuja el código | Licencia MIT según su ficha en 21st.dev: uso comercial permitido conservando el aviso. Guarda una captura de esa ficha como prueba. El sello «by vasnev.art» se mantiene |
| Fondo de puntos | Degradado CSS | No es una imagen |
| Fotos u otras imágenes | **No hay ninguna** (ni PNG, JPG, WebP ni GIF) en `web/` ni en `dist/` | — |

Al compilar se borran los comentarios de licencia del código, así que `npm run build` genera **`dist/licencias.txt`** con el texto completo de cada licencia (lo exigen MIT, ISC y OFL). Está enlazado como «Licencias» al pie de cada pantalla. El video de `video-tareas/` no forma parte de la web; si lo publicas, revisa sus recursos aparte.

## 6. Leyes colombianas revisadas

| Norma | Qué exige | Estado |
|---|---|---|
| **Ley 1581 de 2012** y **Decreto 1074 de 2015** (protección de datos) | Política de tratamiento con contenido mínimo; autorización previa, expresa e informada; prueba de la autorización; canal de consultas (10 días hábiles) y reclamos (15); derechos del titular; seguridad; avisar a la SIC de incidentes | ✅ Cumplido en la app. ⚠️ Falta poner tus datos (punto 1) |
| Registro Nacional de Bases de Datos (Decreto 090 de 2018) | Solo sociedades y entidades sin ánimo de lucro con activos de más de 100.000 UVT, y entidades públicas | ✅ No aplica si eres persona natural o una empresa pequeña. Revísalo si creas una sociedad grande |
| **Ley 1480 de 2011** (Estatuto del Consumidor), modificada por la **Ley 2439 de 2024** | Identidad del proveedor visible; precio final; condiciones del contrato disponibles antes y después, para imprimir y descargar; retracto de 5 días hábiles con devolución en 15 días calendario; canal de PQR con radicado, fecha, hora y seguimiento; **enlace visible a la SIC**; sin cláusulas abusivas; reversión del pago | ✅ Cumplido: pantalla de PQR (`#/pqr`), enlace a la SIC al pie de todas las pantallas, documentos imprimibles, «Precio final» en Planes. ⚠️ Identidad: punto 1 |
| **Ley 527 de 1999** (comercio electrónico) | Validez de la aceptación electrónica y de los mensajes de datos como prueba íntegra | ✅ Registro de consentimientos con huellas encadenadas |
| **Ley 1273 de 2009** (delitos informáticos) | — | ✅ Citada en los términos como conducta prohibida |
| **Ley 23 de 1982** y Decisión Andina 351 (derechos de autor) | Licencias de lo que usas | ✅ Ver punto 5 |
| **Estatuto Tributario** y facturación electrónica DIAN | Las facturas de la app no son factura electrónica; lo que tú cobras puede requerirla | ✅ Aviso claro en términos y en la app. ⚠️ Tu propia facturación: punto 5 de la lista |
| **Ley 2300 de 2023** («Dejen de fregar») | Horarios y límites para contactar consumidores con cobranza o publicidad | ✅ No aplica: la app no envía mensajes. Tenlo en cuenta si empiezas a escribir a tus clientes |
| Ley 1266 de 2008 (datos financieros para crédito) | — | ✅ No aplica: la app no reporta a centrales de riesgo |

## 7. Peticiones, quejas y reclamos (PQR)

- **La persona** entra en «Peticiones, quejas y reclamos» (pie de cada pantalla o Configuración), elige Petición, Queja, Reclamo o Datos personales, y recibe al instante un radicado `PQR-2026-00001` con fecha y hora. En la misma pantalla ve si está «En trámite» o «Respondida» y lee la respuesta. Máximo 5 por día.
- Se puede usar **aunque no haya aceptado** una versión nueva de los términos (puede querer reclamar justamente por eso).
- Si elimina su cuenta, la PQR se conserva sin cuenta asociada.
- **Tú** respondes desde la terminal:

```bash
npm run pqr
```

```bash
npm run pqr -- --ver=12
```

```bash
npm run pqr -- --responder=12 --respuesta="Te devolvimos el dinero el 20/11 a tu Nequi."
```

## Archivos

| Nuevos | Para qué |
|---|---|
| `legal/terminos.md`, `privacidad.md`, `cookies.md`, `reembolsos.md` | Los documentos |
| `docs/responsable.ejemplo.json` | Plantilla de `data/responsable.json` |
| `server/security.js` | Límites por IP, IP real tras un proxy, dominios permitidos, contraseñas débiles |
| `server/legal.js` | Carga de documentos, registro de consentimientos y verificación |
| `server/routes/legal.js`, `server/routes/pqr.js` | API de documentos, consentimientos y PQR |
| `server/migrations/009_legal_y_pqr.sql` | Tablas `legal_texts`, `consents` y `pqrs` |
| `scripts/pqr.js`, `scripts/consentimientos.js`, `scripts/licencias.js` | Comandos `npm run pqr`, `npm run consentimientos` y la generación de `dist/licencias.txt` |
| `web/src/components/legal.tsx`, `privacy-card.tsx` | Casillas, pie legal, lector de documentos, historial de consentimientos |
| `web/src/pages/legal.tsx`, `consent-gate.tsx`, `pqr.tsx` | Documentos, «Antes de seguir» y PQR |
| `tests/legal.test.js`, `tests/security.test.js` | 22 pruebas nuevas |

Cambiados: `server/app.js`, `auth.js`, `router.js`, `index.js`, `validation.js`, `routes/auth.js`, `routes/payments.js`, `routes/accountant.js`; `web/src/App.tsx`, `lib/session.tsx`, `lib/api.ts`, `lib/types.ts`, `pages/auth.tsx`, `pay.tsx`, `plans.tsx`, `settings.tsx`, `components/app-shell.tsx`, `accountant.tsx`; `package.json`; `tests/helpers.js`, `auth.test.js`, `payments.test.js`.

## API nueva

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/legal` | Documentos vigentes, versiones, huellas y textos de las casillas (público) |
| GET | `/api/legal/:doc` | Texto completo de un documento (público) |
| GET | `/api/consents` | Historial de aceptaciones de la propia cuenta y documentos pendientes |
| POST | `/api/consents` | Aceptar las versiones vigentes: `{ accept_terms: true, accept_privacy: true, versions }` |
| GET | `/api/pqrs` | Las PQR de la propia cuenta |
| POST | `/api/pqrs` | Radicar: `{ type, subject, message }` |

Cambios en la API existente: `POST /api/auth/register` exige `accept_terms: true` y `accept_privacy: true` (y acepta `versions`); `POST /api/payments` también; `GET /api/auth/me` y `POST /api/auth/login` devuelven `consent.pending`; sin aceptar la versión vigente, las demás rutas responden **403 `CONSENT_REQUIRED`**; los límites responden **429** con `Retry-After`.
