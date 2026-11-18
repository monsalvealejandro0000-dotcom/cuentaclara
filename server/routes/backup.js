/**
 * Descarga de una copia de seguridad recién hecha, para guardarla fuera del servidor
 * (scripts/descargar-copia.js la baja a tu computador; docs/14-publicar-en-railway.md).
 *
 * - Solo existe si el servidor arranca con BACKUP_DOWNLOAD_TOKEN (mínimo 32 caracteres). Sin ella: 404.
 * - La clave va en la cabecera «Authorization: Bearer …», nunca en la dirección (acabaría en los registros).
 * - Se compara su huella SHA-256 en tiempo constante. 10 intentos por hora y por IP, acierten o no.
 * - La copia contiene los datos de todas las cuentas: quien tenga la clave puede leerlos.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { HttpError } from '../validation.js';
import { backupFileName, writeVerifiedCopy } from '../backup.js';

export const MIN_BACKUP_TOKEN_LENGTH = 32;
const digest = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();

/** Huella de la clave configurada, o null si no hay (o es demasiado corta): entonces la descarga no existe. */
export function backupTokenDigest(token) {
  return typeof token === 'string' && token.trim().length >= MIN_BACKUP_TOKEN_LENGTH ? digest(token.trim()) : null;
}

export function registerBackupRoutes(router, { db, backupToken, limiters, logger, now }) {
  const expected = backupTokenDigest(backupToken);

  router.get(
    '/api/admin/copia',
    async ({ req, res, ip }) => {
      if (!expected) throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
      if (!limiters.backupDownload.take(ip)) {
        const wait = Math.ceil(limiters.backupDownload.retryAfterMs(ip) / 1000);
        throw new HttpError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Vuelve a intentarlo más tarde.', undefined, { 'Retry-After': String(wait) });
      }
      const m = /^Bearer\s+(\S+)\s*$/i.exec(String(req.headers.authorization ?? ''));
      if (!m || !crypto.timingSafeEqual(digest(m[1]), expected)) {
        logger.error(`[copias] Intento de descarga con una clave incorrecta desde ${ip}`);
        throw new HttpError(401, 'UNAUTHORIZED', 'Clave de descarga incorrecta', undefined, { 'WWW-Authenticate': 'Bearer' });
      }

      const tmp = path.join(os.tmpdir(), `cuentaclara-descarga-${crypto.randomBytes(8).toString('hex')}.db`);
      try {
        const counts = writeVerifiedCopy(db, tmp);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.sqlite3',
          'Content-Length': fs.statSync(tmp).size,
          'Content-Disposition': `attachment; filename="${backupFileName(now())}"`,
        });
        await pipeline(fs.createReadStream(tmp), res);
        logger.log?.(`[copias] Copia descargada desde ${ip} (${counts.users} usuarios, ${counts.movements} movimientos)`);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    },
    { auth: false },
  );
}
