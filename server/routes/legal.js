import { HttpError, validationError, notFound } from '../validation.js';
import { DOC_KEYS, REQUIRED_DOCS, accountConsentEntries, checkVersions, consentHistory, pendingConsents, recordConsents } from '../legal.js';

/** Documentos legales (públicos) y consentimientos de la propia cuenta (docs/12-legal-y-seguridad.md). */
export function registerLegalRoutes(router, { db, legal, now }) {
  // Lista de documentos, versiones y textos de las casillas: la usan el registro y el pie de página.
  router.get('/api/legal', () => legal.publicInfo(), { auth: false });

  router.get(
    '/api/legal/:doc',
    ({ params }) => {
      if (!DOC_KEYS.includes(params.doc)) throw notFound('Documento no encontrado');
      const d = legal.docs[params.doc];
      return { key: d.key, title: d.title, version: d.version, effective: d.effective, sha256: d.sha256, text: d.text, complete: legal.responsable.complete };
    },
    { auth: false },
  );

  // Prueba de la autorización: cuándo y cómo aceptó cada documento (art. 8, literal b, Ley 1581 de 2012).
  router.get('/api/consents', ({ user }) => ({ history: consentHistory(db, legal, user), pending: pendingConsents(db, legal, user) }), { consent: false });

  // Aceptar la versión vigente (cuentas creadas antes de esta fase o tras cambiar un documento).
  router.post(
    '/api/consents',
    ({ body, user, req, ip }) => {
      const errors = {};
      if (body.accept_terms !== true) errors.accept_terms = 'Para seguir debes aceptar los Términos y condiciones';
      if (body.accept_privacy !== true) errors.accept_privacy = 'Para seguir debes autorizar el tratamiento de tus datos';
      if (Object.keys(errors).length) throw validationError(errors);
      checkVersions(legal, body.versions, REQUIRED_DOCS);
      if (!pendingConsents(db, legal, user).length) throw new HttpError(409, 'ALREADY_ACCEPTED', 'Ya aceptaste las versiones vigentes');
      recordConsents(db, legal, accountConsentEntries(), {
        userId: user.id,
        email: user.email,
        ip,
        userAgent: req.headers['user-agent'],
        context: 'actualizacion',
        now: now(),
      });
      return { pending: pendingConsents(db, legal, user) };
    },
    { consent: false },
  );
}
