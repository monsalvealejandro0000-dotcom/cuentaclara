// Fase 13: código QR propio para la verificación en dos pasos (web/src/lib/qr.ts). Node carga el .ts directamente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignmentPositions, byteCapacity, encodeQr, formatBits, gfMultiply, versionBits } from '../web/src/lib/qr.ts';

const L = 0;
const M = 1;

test('QR: valores publicados en la norma (formato, versión, capacidad y alineación)', () => {
  // Información de formato (tabla C.1 de ISO/IEC 18004).
  assert.equal(formatBits(L, 0).toString(2).padStart(15, '0'), '111011111000100');
  assert.equal(formatBits(L, 1).toString(2).padStart(15, '0'), '111001011110011');
  assert.equal(formatBits(M, 0).toString(2).padStart(15, '0'), '101010000010010');
  assert.equal(formatBits(M, 1).toString(2).padStart(15, '0'), '101000100100101');
  assert.equal(formatBits(2, 0).toString(2).padStart(15, '0'), '011010101011111');
  assert.equal(formatBits(3, 0).toString(2).padStart(15, '0'), '001011010001001');
  // Información de versión (tabla D.1).
  assert.equal(versionBits(7), 0x07c94);
  assert.equal(versionBits(8), 0x085bc);
  assert.equal(versionBits(40), 0x28c69);
  // Bytes que caben en modo byte, niveles L y M, versiones 1 a 10 (tabla 7).
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => byteCapacity(v, L)), [17, 32, 53, 78, 106, 134, 154, 192, 230, 271]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => byteCapacity(v, M)), [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
  assert.equal(byteCapacity(40, M), 2331);
  // Patrones de alineación (anexo E).
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(14), [6, 26, 46, 66]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);
});

/** Lee un QR de vuelta (formato, máscara, zigzag, bloques), comprueba Reed-Solomon y devuelve el texto. */
function decode(qr) {
  const { size, modules } = qr;
  const ver = (size - 17) / 4;
  // Información de formato, primera copia.
  let f = 0;
  const fmt = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  fmt.forEach(([x, y], i) => (f |= (modules[y][x] ? 1 : 0) << i));
  const mask = [0, 1, 2, 3, 4, 5, 6, 7].find((m) => formatBits(M, m) === f);
  assert.notEqual(mask, undefined, 'formato legible (nivel M)');
  // La segunda copia coincide.
  let f2 = 0;
  for (let i = 0; i < 8; i++) f2 |= (modules[8][size - 1 - i] ? 1 : 0) << i;
  for (let i = 8; i < 15; i++) f2 |= (modules[size - 15 + i][8] ? 1 : 0) << i;
  assert.equal(f2, f, 'las dos copias del formato coinciden');
  assert.equal(modules[size - 8][8], true, 'módulo oscuro fijo');

  // Zonas reservadas, calculadas aquí aparte.
  const reserved = (x, y) => {
    if (x === 6 || y === 6) return true;
    if ((x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8)) return true;
    if (ver >= 7 && ((x >= size - 11 && x < size - 8 && y < 6) || (y >= size - 11 && y < size - 8 && x < 6))) return true;
    const a = alignmentPositions(ver);
    for (const ax of a) for (const ay of a) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === a.at(-1)) || (ax === a.at(-1) && ay === 6)) continue;
      if (Math.abs(x - ax) <= 2 && Math.abs(y - ay) <= 2) return true;
    }
    return false;
  };
  const masked = (m, x, y) =>
    [
      (x + y) % 2 === 0,
      y % 2 === 0,
      x % 3 === 0,
      (x + y) % 3 === 0,
      (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      ((x * y) % 2) + ((x * y) % 3) === 0,
      (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ][m];
  const bits = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let k = 0; k < size; k++) {
      const y = upward ? size - 1 - k : k;
      for (const x of [right, right - 1]) if (!reserved(x, y)) bits.push(modules[y][x] !== masked(mask, x, y) ? 1 : 0);
    }
    upward = !upward;
  }
  const codewords = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Bloques (nivel M): deshacer el intercalado y comprobar cada bloque con sus síndromes.
  const blocksM = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5][ver];
  const eccM = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26][ver];
  const total = codewords.length;
  const shortLen = Math.floor(total / blocksM);
  const numShort = blocksM - (total % blocksM);
  const blocks = Array.from({ length: blocksM }, (_, j) => new Array(shortLen + (j < numShort ? 0 : 1)));
  let p = 0;
  for (let i = 0; i < shortLen - eccM; i++) for (const b of blocks) b[i] = codewords[p++];
  for (const b of blocks.slice(numShort)) b[shortLen - eccM] = codewords[p++];
  for (let i = 0; i < eccM; i++) for (const b of blocks) b[b.length - eccM + i] = codewords[p++];
  const data = [];
  for (const b of blocks) {
    let alpha = 1;
    for (let i = 0; i < eccM; i++) {
      let s = 0;
      for (const c of b) s = gfMultiply(s, alpha) ^ c;
      assert.equal(s, 0, 'síndrome cero: la corrección de errores es correcta');
      alpha = gfMultiply(alpha, 2);
    }
    data.push(...b.slice(0, b.length - eccM));
  }
  // Modo byte.
  const dbits = data.flatMap((c) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (c >>> i) & 1));
  const read = (from, len) => dbits.slice(from, from + len).reduce((a, b) => (a << 1) | b, 0);
  assert.equal(read(0, 4), 0b0100, 'modo byte');
  const cbits = ver <= 9 ? 8 : 16;
  const len = read(4, cbits);
  const bytes = Array.from({ length: len }, (_, i) => read(4 + cbits + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

test('QR: lo que se codifica se lee igual, con la corrección de errores correcta, en varias versiones', () => {
  const samples = [
    'HOLA',
    'otpauth://totp/CuentaClara:ana%40correo.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CuentaClara&algorithm=SHA1&digits=6&period=30',
    `otpauth://totp/CuentaClara:${encodeURIComponent('maría.fernanda.gonzález.restrepo+facturas@empresa-muy-larga.com.co')}?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CuentaClara&algorithm=SHA1&digits=6&period=30`,
    'ñandú €',
  ];
  const versions = new Set();
  for (const s of samples) {
    const qr = encodeQr(s);
    versions.add(qr.version);
    assert.equal(qr.size, qr.version * 4 + 17);
    assert.equal(decode(qr), s);
  }
  assert.ok(versions.size >= 3, `se probaron varias versiones: ${[...versions]}`);
  assert.ok([...versions].some((v) => v >= 7), 'incluida una con información de versión');
});
