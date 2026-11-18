// Genera dist/licencias.txt con las licencias de todo el código, las fuentes y los iconos de terceros que
// van dentro de la interfaz compilada. Al compilar se eliminan los comentarios de licencia del código, así que
// este archivo es el que cumple con «incluir el aviso de copyright y la licencia» (MIT, ISC, SIL OFL, Apache).
// Se ejecuta solo con `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(APP_DIR, 'dist', 'licencias.txt');

// Paquetes que acaban dentro de dist/ (código, estilos o fuentes).
const PACKAGES = [
  ['@fontsource-variable/geist', 'Fuente Geist (archivos .woff2 en dist/assets)'],
  ['@fontsource-variable/geist-mono', 'Fuente Geist Mono (archivos .woff2 en dist/assets)'],
  ['lucide-react', 'Iconos Lucide'],
  ['react', 'React'],
  ['react-dom', 'React DOM'],
  ['scheduler', 'Scheduler (dependencia de React DOM)'],
  ['clsx', 'clsx'],
  ['tailwind-merge', 'tailwind-merge'],
  ['class-variance-authority', 'class-variance-authority'],
  ['tailwindcss', 'Tailwind CSS (estilos base generados)'],
];

const ANALYTICS_BENTO = `AnalyticsBento (web/src/components/ui/analytics-bento.tsx, adaptado)
Autor: vasnev.art — https://vasnev.art
Publicado en https://21st.dev/@romanvasnev/components/analytics-bento bajo licencia MIT.

MIT License

Copyright (c) vasnev.art

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

function licenseText(dir) {
  const name = fs.readdirSync(dir).find((f) => /^(license|licence|copying)(\.(md|txt))?$/i.test(f));
  return name ? fs.readFileSync(path.join(dir, name), 'utf8').trim() : null;
}

const parts = [
  'CuentaClara usa el siguiente software, fuentes e iconos de terceros, cada uno bajo su propia licencia.',
  'El logotipo y el favicon de CuentaClara son propios (dibujados en SVG para este proyecto).',
];
const missing = [];
for (const [pkg, what] of PACKAGES) {
  const dir = path.join(APP_DIR, 'node_modules', ...pkg.split('/'));
  if (!fs.existsSync(dir)) {
    missing.push(pkg);
    continue;
  }
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const text = licenseText(dir);
  if (!text) missing.push(pkg);
  parts.push(`${what}\nPaquete: ${pkg}@${meta.version} · Licencia: ${meta.license}\n\n${text ?? `(Ver la licencia ${meta.license} en el paquete)`}`);
}
parts.push(ANALYTICS_BENTO);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${parts.join(`\n\n${'='.repeat(78)}\n\n`)}\n`, 'utf8');
console.log(`Licencias de terceros: ${path.relative(APP_DIR, OUT)}${missing.length ? ` (sin archivo de licencia: ${missing.join(', ')})` : ''}`);
