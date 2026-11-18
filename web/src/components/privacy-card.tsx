import * as React from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import type { ConsentRecord } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { FormError } from '@/components/common';
import { whenLocal } from '@/components/accountant';
import { DOC_SHORT } from '@/components/legal';
import { LEGAL_KEYS } from '@/pages/legal';

const PURPOSE: Record<ConsentRecord['purpose'], string> = {
  terminos: 'Términos y condiciones',
  privacidad: 'Tratamiento de datos personales',
  reembolsos: 'Política de reembolsos',
  compartir_contador: 'Compartir datos con tu contador',
};

/** Navegador legible a partir del user agent («Chrome en Windows»). Solo para mostrarlo: se guarda completo. */
function browserName(ua: string) {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return b ? `${b}${os ? ` en ${os}` : ''}` : ua || 'desconocido';
}

/**
 * Configuración → Privacidad y consentimientos (fase 12).
 * La prueba de cuándo y cómo aceptó cada documento (art. 8 lit. b, Ley 1581 de 2012), los documentos y las PQR.
 */
export function PrivacyCard() {
  const { data, error, loading } = useLoad(() => api<{ history: ConsentRecord[] }>('/consents'), []);
  const [open, setOpen] = React.useState(false);
  const history = data?.history ?? [];
  const shown = open ? history : history.slice(0, 4);

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <ShieldCheck className="size-[18px] text-muted-foreground" aria-hidden="true" /> Privacidad y consentimientos
      </CardTitle>
      <CardDescription>Qué aceptaste, cuándo y cómo. Es la prueba de tu autorización: puedes pedirla cuando quieras.</CardDescription>

      <div className="mt-4 flex flex-wrap gap-2">
        {LEGAL_KEYS.map((k) => (
          <ButtonLink key={k} variant="outline" size="sm" href={`#/legal/${k}`}>
            {DOC_SHORT[k]}
          </ButtonLink>
        ))}
        <ButtonLink variant="outline" size="sm" href="#/pqr">
          Peticiones, quejas y reclamos
        </ButtonLink>
      </div>

      {loading && !data ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : error && !data ? (
        <div className="mt-4">
          <FormError message="No se pudo cargar tu historial de consentimientos." />
        </div>
      ) : history.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No hay aceptaciones registradas.</p>
      ) : (
        <>
          <ul className="mt-4 grid gap-2" data-testid="consent-history">
            {shown.map((h) => (
              <li key={h.id}>
                <Inset className="grid gap-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {h.action === 'acepta' ? 'Aceptaste' : 'Revocaste'}: {PURPOSE[h.purpose]}
                    </span>
                    <Badge tone={h.action === 'revoca' ? 'neutral' : h.current ? 'positive' : 'neutral'}>
                      {h.action === 'revoca' ? 'Revocado' : h.current ? 'Versión vigente' : `Versión ${h.version}`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {whenLocal(h.at)} · {h.contextLabel}
                    {h.detail ? ` · ${h.detail}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Casilla: «{h.label}»
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.docTitle}, versión {h.version} · IP {h.ip} · {browserName(h.userAgent)}
                  </p>
                </Inset>
              </li>
            ))}
          </ul>
          {history.length > 4 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-3 inline-flex cursor-pointer items-center gap-1 rounded text-sm font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={open}
            >
              <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              {open ? 'Ver menos' : `Ver todo (${history.length})`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
