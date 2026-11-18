# Guion: motion graphic de 30 s — «Programación de tareas con CuentaClara»

Para pegar tal cual en HyperFrames de HeyGen (por ejemplo, desde Claude.ai: «Crea este video en HyperFrames»). Todo lo que muestra son funciones reales de la app; los datos son de ejemplo.

---

Crea un motion graphic de 30 segundos, horizontal 16:9 (1920x1080), todo en español, SIN locución: solo texto animado en pantalla y una música suave y moderna. Tema: «Programación de tareas con CuentaClara», una app web para trabajadores independientes en Colombia que lleva ingresos, gastos e impuestos y tiene un Calendario y avisos de declaración. Todas las pantallas son recreaciones en motion graphics de la interfaz (no capturas reales); usa solo datos de ejemplo.

**Estilo de marca (CuentaClara):**
- **Fondo y tarjetas:** fondo oscuro casi negro #09090A; tarjetas #111113 con esquinas muy redondeadas (28 px) y borde sutil.
- **Colores:** texto blanco #F4F4F5; verde #3BF08C como acento (marca y «hecho»); amarillo #FFB800 para avisos e impuestos; azul violeta #6A5CFF para reuniones; violeta #8B3DFF para la etiqueta Pro.
- **Tipografía:** sans moderna tipo Geist (títulos en negrita) y monoespaciada tipo Geist Mono para cifras y horas.
- **Logo:** un cuadrado redondeado oscuro con una línea verde que sube como una gráfica y un punto verde arriba a la derecha, junto a la palabra «CuentaClara».
- **Movimiento:** limpio (deslizar, escalar suave, contadores, checks que se dibujan). Nada recargado.

**Guion** (respeta los textos entre comillas):

1. **0–3 s:** aparece el logo CuentaClara. Título: «Programa tus tareas». Subtítulo: «Que no se te pase ninguna».
2. **3–9 s:** un calendario mensual de noviembre de 2026 se arma día por día. En los días aparecen chips de colores: «10:00 Reunión con cliente» (azul violeta), «Cobro factura 2026-001» (verde) y «Declarar IVA» (amarillo). Texto: «Reuniones, cobros y plazos fiscales en tu Calendario».
3. **9–15 s:** se abre un formulario «Nuevo evento» con:
   - Título: «Declarar IVA septiembre–octubre 2026»
   - Fecha: «19/11/2026»
   - Interruptor «Todo el día» activado
   - Categoría: «Fiscal / impuestos»

   Clic en «Guardar» y el evento vuela al día 19 del calendario. Texto: «Crea un evento en segundos».
4. **15–22 s:** en el Dashboard aparece una tarjeta de aviso amarilla con ícono de campana: «Declaras el IVA de septiembre–octubre 2026 en noviembre de 2026» y, debajo, «Estimado a pagar: $ 794.200».
   - Clic en el botón «Anotar el día exacto» y se elige el 19 de noviembre.
   - El aviso cambia a «Declaras el IVA el 19 de noviembre · faltan 3 días».
   - Lleva una etiqueta pequeña violeta «Pro».

   Texto: «CuentaClara te avisa antes de cada declaración».
5. **22–27 s:** clic en «Ya la presenté»: se dibuja un check verde, la tarjeta se cierra y aparece la etiqueta verde «Presentada». Texto: «Marca lo hecho y sigue con tu día».
6. **27–30 s:** cierre con el logo CuentaClara y la frase «Tus cuentas claras, tus tareas a tiempo». Debajo, en pequeño: «Calendario · Avisos de declaración · Informe para el contador».

No inventes funciones que no estén en este guion: nada de notificaciones push, correos ni integraciones con otras apps.

---

## Versión con voz (locución) — propuesta para aprobar

El video local (`video-tareas/`) dura 30 s y sus escenas van así: intro 0–3,5 s · calendario 3,5–9 s · evento 9–15 s · aviso 15–26,5 s · cierre 26,5–30 s. La voz se suma encima, sin cambiar lo que se ve. Cada frase arranca cuando aparece en pantalla lo que nombra.

**Voz:** español latinoamericano, cálida y natural, ritmo tranquilo (unas 2,5 palabras por segundo). Sin música (el video sigue igual de silencioso, solo con la voz).

| # | Entra en | Mientras se ve | Frase |
|---|---|---|---|
| 1 | 0,3 s | Logo y «Programa tus tareas» | «Programa tus tareas… y que no se te pase ninguna.» |
| 2 | 3,7 s | El calendario se arma y aparecen los chips | «Reuniones, cobros y plazos fiscales, todo en tu Calendario.» |
| 3 | 9,2 s | Formulario «Nuevo evento» y clic en Guardar | «Crea un evento en segundos: nombre, fecha, categoría… y listo.» |
| 4 | 15,3 s | Tarjeta de aviso amarilla en el Dashboard | «CuentaClara te avisa antes de cada declaración.» |
| 5 | 18,4 s | Se elige el 19 de noviembre y se guarda | «Anota el día exacto y queda en tu Calendario.» |
| 6 | 21,4 s | Clic en «Ya la presenté», check verde, «Presentada» | «Cuando la presentes, márcala como hecha y sigue con tu día.» |
| 7 | 26,7 s | Logo y frase final | «CuentaClara: tus cuentas claras, tus tareas a tiempo.» |

**Voz usada:** las voces en español de HeyGen (Emiliano, la elegida) exigen el plan de pago HyperFrames Pro, así que se usa la voz local gratuita Kokoro (masculina: `em_alex` o `em_santa`, español genérico), que corre en el PC con Python 3.12 y el entorno `video-tareas/.venv-tts`. La frase 4 dura 3,0 s, así que la 5 arranca en 18,4 s en vez de 17,9 s; ningún texto cambió.

**Reglas:**
- Si una frase generada dura más que su espacio, primero se ajusta la velocidad de la voz (sin pasar de 1,1×); si aún no cabe, se acorta la frase y se vuelve a aprobar. El video no pasa de 30 s.
- La voz no dice nada que no se vea en pantalla.
- Se entrega un MP4 nuevo (`renders/programacion-tareas-cuentaclara-voz.mp4`); el MP4 sin voz se conserva.
