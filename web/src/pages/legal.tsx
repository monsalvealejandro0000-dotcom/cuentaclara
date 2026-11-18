import * as React from 'react';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useSession } from '@/lib/session';
import { downloadFile } from '@/lib/format';
import type { LegalDoc, LegalDocKey } from '@/lib/types';
import { Button, ButtonLink } from '@/components/ui/button';
import { ErrorState, Loading } from '@/components/common';
import { Logo, ThemeSwitch } from '@/components/app-shell';
import { DOC_SHORT, LegalFooter, Markdown } from '@/components/legal';
import { dayLabel } from '@/components/plan';

export const LEGAL_KEYS: LegalDocKey[] = ['terminos', 'privacidad', 'cookies', 'reembolsos'];

/**
 * Documento legal (#/legal/terminos, privacidad, cookies, reembolsos). Público: se ve con o sin sesión.
 * Se puede imprimir o descargar antes y después de aceptarlo (art. 50 lit. d, Ley 1480 de 2011).
 */
export function LegalPage({ doc }: { doc: LegalDocKey }) {
  const { user } = useSession();
  const { data, error, loading, reload } = useLoad(() => api<LegalDoc>(`/legal/${doc}`), [doc]);

  React.useEffect(() => {
    if (data) document.title = `${data.title} · CuentaClara`;
  }, [data]);

  // Abierto desde una casilla (otra pestaña) no hay «atrás»: se ofrece ir a la app.
  const canGoBack = window.history.length > 1;
  const back = canGoBack ? (
    <Button variant="ghost" onClick={() => window.history.back()}>
      <ArrowLeft /> Volver
    </Button>
  ) : (
    <ButtonLink variant="ghost" href={user ? '#/dashboard' : '#/login'}>
      <ArrowLeft /> Ir a CuentaClara
    </ButtonLink>
  );

  const download = () =>
    data && downloadFile(`cuentaclara-${data.key}-${data.version}.txt`, `${data.title}\nVersión ${data.version} · vigente desde ${data.effective}\n\n${data.text}\n`, 'text/plain;charset=utf-8');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <a href={user ? '#/dashboard' : '#/login'} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </a>
        <ThemeSwitch className="w-40" />
      </div>
      <nav aria-label="Documentos legales" className="no-print mb-4 flex flex-wrap gap-2">
        {LEGAL_KEYS.map((k) => (
          <a
            key={k}
            href={`#/legal/${k}`}
            aria-current={k === doc ? 'page' : undefined}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-foreground aria-[current=page]:text-background"
          >
            {DOC_SHORT[k]}
          </a>
        ))}
      </nav>
      <article className="rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none">
        {loading && !data ? (
          <Loading />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data ? (
          <>
            <header className="mb-6 border-b border-border pb-5">
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">{data.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Versión {data.version} · vigente desde el {dayLabel(data.effective)}
              </p>
              {!data.complete && (
                <p role="note" className="mt-3 rounded-xl border border-warning/40 bg-warning/12 px-3 py-2 text-xs font-medium">
                  Faltan los datos del responsable (archivo data/responsable.json). Aparecen como «[pendiente: …]».
                </p>
              )}
              <div className="no-print mt-4 flex flex-wrap gap-2">
                {back}
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer /> Imprimir o guardar en PDF
                </Button>
                <Button variant="outline" size="sm" onClick={download}>
                  <Download /> Descargar
                </Button>
              </div>
            </header>
            <Markdown text={data.text} />
            <p className="mt-8 break-all border-t border-border pt-4 text-[11px] text-muted-foreground">Huella SHA-256 de esta versión: {data.sha256}</p>
          </>
        ) : null}
      </article>
      <LegalFooter className="mt-6" pqr={Boolean(user)} />
    </div>
  );
}
