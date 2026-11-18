# 8. Abrir la app con doble clic

> Fecha: 09/11/2026. Problema: «cuando abro index.html se me queda así» (página en blanco).

## Por qué salía en blanco

`web/index.html` es el molde que usa Vite para compilar la interfaz. Abierto con doble clic (`file://`), el navegador no puede cargar su código (`/src/main.tsx`) y, aunque pudiera, la app necesita su servidor para leer y guardar tus datos en `data/app.db`. Con `dist/index.html` ocurre lo mismo. El HTML no tenía ningún error: el problema era abrirlo sin servidor.

## Qué ha cambiado

| Archivo | Cambio |
|---|---|
| `Abrir CuentaClara.cmd` | **Nuevo.** Doble clic para abrir la app. Comprueba que Node.js está instalado y ejecuta `scripts/abrir.js`. Si algo falla, la ventana espera a que leas el mensaje |
| `scripts/abrir.js` | **Nuevo** (`npm run abrir`). Si CuentaClara ya responde en el puerto, solo abre el navegador. Si el puerto lo usa otro programa, lo explica. Si no, compila la interfaz si falta, arranca el servidor y abre el navegador cuando responde. Acepta las opciones de `npm start` y `--sin-navegador` |
| `web/index.html` | Dentro de `#app` hay un aviso: «Así no se abre la app», con los pasos y un botón a `http://localhost:3000`. Sigue los colores de la app y el modo claro u oscuro del sistema |
| `web/src/index.css` | Oculta ese aviso cuando la app carga de verdad (además, React lo sustituye al arrancar) |
| `server/app.js` | Las páginas HTML permiten en la CSP **solo** sus `<style>` en línea, mediante su huella SHA-256, que se calcula del archivo servido. Sin `unsafe-inline`; la API y los demás ficheros siguen con `style-src 'self'` |
| `package.json` | Script `abrir` |
| `tests/errors.test.js` | 2 pruebas nuevas: la huella coincide con el `<style>` servido (también con `HEAD`) y no la alteran los comentarios ni los saltos de línea CRLF |

## Verificación

| Prueba | Resultado |
|---|---|
| `npm test` | **108/108** |
| `index.html` abierto como archivo en Chrome (modo claro y oscuro, `web/` y `dist/`) | Muestra el aviso en lugar de la página en blanco |
| Aviso a 375 px | Tarjeta de 16 a 359 px, sin desplazamiento horizontal, botón de 44 px |
| App servida | El aviso no aparece (React lo sustituye y la hoja de estilos lo oculta); estilo en línea aceptado por su huella; consola sin bloqueos de la CSP |
| Lanzador: arrancar el servidor (BD de prueba, puerto aparte, ya borrada) | Arranca y detecta cuándo responde |
| Lanzador: app ya en marcha | Solo abre el navegador (desde la carpeta del proyecto y desde otra carpeta) |
| Lanzador: puerto ocupado por otro programa | Mensaje claro y código de salida 1 |
| Lanzador sin Node.js | Pide instalar Node.js 22.13 o superior y espera |
| Base de datos real | Íntegra después de reiniciar el servidor; tu gasto del 9 de noviembre sigue con IVA 19 % |
| Lanzador en Windows, sin opciones, con la app en marcha | Abre `http://localhost:3000` en el navegador predeterminado (confirmado por el usuario) |

**No probado:** el lanzador en macOS y Linux (usa `open` / `xdg-open`).
