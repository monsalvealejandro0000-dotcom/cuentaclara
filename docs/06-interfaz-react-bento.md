# 6. Nueva interfaz: React + shadcn con la paleta del AnalyticsBento

> Fecha: 09/11/2026. Objetivo: integrar el componente `AnalyticsBento` y que **toda la app** use su estética y su paleta.

## Qué ha cambiado

| Antes | Ahora |
|---|---|
| Frontend HTML/CSS/JS sin compilación (`public/`) | **React 19 + TypeScript + Tailwind CSS 4 + estructura shadcn** (`web/src`), compilado con Vite a `dist/` |
| El proyecto vivía en una subcarpeta | El proyecto ocupa la raíz de `GASTOS INGRESOS` |
| Gráfico de barras propio | `AnalyticsBento` (4 tarjetas animadas) con **datos reales** |
| — | Nuevo endpoint `GET /api/analytics?month=AAAA-MM` (con 8 pruebas) |

El backend (API, SQLite, autenticación, permisos, copias de seguridad) **no ha cambiado de comportamiento**: sus pruebas siguen pasando sin modificarlas.

## Estructura shadcn

```
components.json            configuración de shadcn (alias @ → web/src)
web/src/
├── index.css              Tailwind + tokens de color (la paleta) + fuentes Geist
├── lib/utils.ts           cn() (clsx + tailwind-merge), como en shadcn
├── components/ui/         componentes base estilo shadcn
│   ├── analytics-bento.tsx   ← el componente integrado
│   ├── button.tsx  input.tsx  card.tsx  badge.tsx  dialog.tsx
│   └── table.tsx  toast.tsx  segmented.tsx
├── components/            componentes de la app (formularios, navegación…)
└── pages/                 pantallas
```

**Por qué `components/ui`:** es la ruta por defecto de la CLI de shadcn (`npx shadcn add …`) y de los componentes que se copian de su ecosistema. El ejemplo del componente importa `@/components/ui/analytics-bento`. Con esta carpeta y el alias `@`, cualquier componente futuro se instala sin tocar rutas.

## La paleta, aplicada a toda la app

Definida una sola vez en `web/src/index.css` como variables (modo claro y oscuro) y usada en todas las pantallas:

| Papel | Claro | Oscuro | Uso |
|---|---|---|---|
| Superficies | `#f5f5f3` fondo · `#ffffff` tarjeta | `#09090a` · `#111113` | Tarjetas de 28 px, fondo de puntos |
| Bordes | negro 9 % | blanco 10 % | Todos los contornos |
| Primario | `#0b0b0c` | `#f4f4f5` | Botones principales |
| Verde | `#12b863` | `#3BF08C` | Ingresos, positivo, línea de ingresos |
| Índigo | `#3c2cff` | `#6a5cff` | Enlaces, foco, reuniones |
| Ámbar | `#FFB800` | | Impuestos, avisos, fiscal |
| Naranja | `#FF5A1F` | | Gastos, eliminar, movilidad |
| Violeta / lima / cian / rosa | `#8B3DFF` · `#7CFF5B` · `#22D3EE` · `#FF3DA5` | | Treemap y degradados |

Tipografía: **Geist** y **Geist Mono** (cifras), autoalojadas: sin CDN, compatibles con la CSP. Tema claro/oscuro: sigue al sistema o se elige en la barra lateral o en Configuración.

## Cómo se alimenta el bento (sin datos de ejemplo)

El `demo.tsx` original trae cifras inventadas (revenue en $, sesiones desktop/mobile, ciudades…). **No se ha incluido.** Cada tarjeta se alimenta con tus movimientos:

| Tarjeta original | En CuentaClara | Datos |
|---|---|---|
| Revenue (línea) | **Ingresos del mes** | Ingresos de los últimos 12 meses; variación frente al mes anterior; beneficio del mes |
| Sessions (ondas desktop/mobile) | **Beneficio del año** | Ondas: ingresos arriba, gastos abajo, por mes; el año anterior, más tenue |
| Sales by category (treemap) | **Gastos por categoría** | Mes / trimestre / año, comparados con el periodo anterior (bajar es bueno); grupos Estructura, Herramientas, Crecimiento, Movilidad y Otros; tabla de ingresos, gastos y beneficio |
| Seasonality (radar) | **Estacionalidad de ingresos** | Ingresos por mes de cada año con datos; media, total, mejor mes, beneficio y reserva del año |

Encima del bento siguen las tarjetas clave de la app: **a reservar para impuestos**, **trimestre (modelos 303/130)** y **pendiente de cobro**, con céntimos exactos.

## Adaptaciones al componente

Las mínimas para usarlo en España y en esta app; están documentadas en la cabecera del fichero:

1. Formato por *locale* (`es-ES`, «1.234 €» con el € detrás) mediante nuevas props `locale`, `currencyPosition` y `fractionDigits`.
2. Textos de tooltips y etiquetas accesibles configurables (`labels`): el original los tenía en inglés.
3. Variaciones negativas con flecha hacia abajo y métricas «inversas» (en gastos, bajar es bueno). El original siempre mostraba una flecha verde hacia arriba.
4. Eje de las ondas configurable (meses en lugar de horas).
5. Treemap sin errores cuando no hay gastos (estado vacío) e ignorando categorías a 0.
6. Los bloques `<style>` en línea se movieron a `index.css`, porque la política de seguridad (CSP) los bloquea.
7. IDs de SVG saneados para React 19, y el gráfico pasa bajo la cifra cuando la tarjeta es estrecha (`@container`).
8. En móvil, el selector de año mide 44 px.
9. La insignia «by vasnev.art» se desactiva con la prop `credit={false}`. **Crédito del diseño original: [vasnev.art](https://vasnev.art).**

## Verificación

| Prueba | Resultado |
|---|---|
| `npm test` (compila y ejecuta todas las pruebas) | **88/88** (80 anteriores + 8 de `/api/analytics` con valores calculados a mano) |
| `tsc --noEmit` sobre los 31 ficheros de `web/src` | Sin errores |
| Registro (validación y foco en el primer error) | ✅ |
| Movimientos: crear, editar (carga sus datos), validar, eliminar («Cancelar» no borra; el foco empieza en «Cancelar») | ✅ (comprobado contra la API) |
| El ingreso de una factura solo ofrece «Ver factura» | ✅ |
| Facturas: crear (HTML malicioso mostrado como texto), cobrar, eliminar (borra su ingreso → 404) | ✅ |
| Calendario: validar horas, crear, editar y eliminar | ✅ |
| Configuración: guardar datos fiscales (NIF normalizado) y desaparición del aviso | ✅ |
| 404 con «Volver»; sesión caducada → login con aviso; login incorrecto y correcto | ✅ |
| Escritorio 1280 px: 6 pantallas sin desbordamiento; todas las tablas caben | ✅ (corregido: la tabla de Movimientos no cabía; la categoría pasó bajo el concepto) |
| Móvil 375 px: 6 pantallas sin desbordamiento, barra inferior fija, controles ≥ 44 px | ✅ |
| Tema claro y oscuro | ✅ revisado visualmente |
| Consola | Solo los 401/404 provocados por las pruebas; sin excepciones ni bloqueos de la CSP |

Los datos de prueba (BD E2E con movimientos de 2025-2026 para ver los gráficos) se borraron al terminar.

## Moneda local configurable

**Dónde:** Configuración → tarjeta **Moneda**. Tiene buscador (por nombre o código), selector con las monedas habituales primero, vista previa en directo y el botón **Guardar moneda**, que solo se activa si hay cambios.

| Pieza | Detalle |
|---|---|
| Monedas | 153 oficiales vigentes (ISO 4217), en `server/currencies.js`, que es la única fuente; nombres en español con `Intl.DisplayNames`. Excluidas las retiradas (BGN, HRK, ANG, SLL, ZWL, CUC) y VED, que los datos internacionales aún no reconocen |
| Formato | Cada moneda usa el formato de su país cuando la app lo conoce: 18 monedas hispanohablantes y el euro (MXN → `$1,234.56`, ARS → `$ 1.234,56`, PEN → `S/ 1,234.56`). Las demás usan el formato español con su símbolo (`1234,56 £`) |
| Decimales | Los oficiales de cada moneda (yen, peso chileno, peso colombiano o guaraní: sin decimales), con un máximo de 2 porque los importes se guardan en centésimas. En las monedas de 3 decimales (dinar kuwaití, bareiní, jordano…) se muestran 2 |
| Entrada de importes | Acepta `1.234,56` y `1,234.56` (si aparecen los dos signos, el último es el decimal) |
| Alcance | Todos los importes de la app: Dashboard y bento, listas, formularios, facturas, vista previa y CSV (separador decimal de la moneda y columna «Moneda») |
| Datos | Cambiar la moneda **no convierte** los importes guardados. Cada usuario tiene la suya; por defecto, EUR |
| Base de datos | Migración `003_currency.sql` (columna `settings.currency`, por defecto EUR). Antes de aplicarla en la base de datos real se hizo una copia de seguridad |

**Pruebas:** `tests/currency.test.js`, 8/8:
- La lista: sin duplicados, reconocida por Intl, con nombre en español y sin monedas retiradas.
- Euro por defecto, y guardar la moneda sin convertir importes.
- Si no se envía la moneda, se conserva la actual; las no válidas devuelven 400.
- Cada usuario tiene la suya.
- La migración sobre una base de datos existente no pierde datos.

**En el navegador** (base de datos de prueba, ya borrada):

| Moneda | Comprobado |
|---|---|
| Peso mexicano | Vista previa `$1,234.56`; el Dashboard sin ningún `€`; lista y factura en `$`; formulario «Base imponible ($)»; `1,500.50` se guarda como 1500,50 y se edita como `1500.50`; CSV con punto decimal y columna Moneda |
| Yen | Sin decimales en todas las pantallas; la reserva de `7 ¥` cuadra con el cálculo a mano |
| Euro | Se vuelve al formato original |
| Móvil | La tarjeta sin desbordamiento y con controles de al menos 44 px |

**Actualización:** desde la [fase 7](07-impuestos-colombia.md) los impuestos son los de Colombia y la moneda inicial es el peso colombiano.

### No probado

Safari y Firefox reales (la app usa `@container`, `<dialog>` y `color-mix()`, que necesitan versiones de 2023 o posteriores); dispositivos reales; lector de pantalla; resultado impreso de la factura. Siguen abiertos los puntos críticos del [informe de pruebas](05-informe-pruebas.md): HTTPS, validez legal de las facturas y copias fuera del servidor.
