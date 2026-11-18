import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { useSession } from '@/lib/session';
import type { LegalDocKey, LegalInfo } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Documentos legales (fase 12, docs/12-legal-y-seguridad.md):         */
/*  casillas de aceptación, pie de página y lector de los textos.       */
/* ------------------------------------------------------------------ */

export const DOC_SHORT: Record<LegalDocKey, string> = {
  terminos: 'Términos y condiciones',
  privacidad: 'Política de privacidad',
  cookies: 'Política de cookies',
  reembolsos: 'Política de reembolsos',
};

/** Enlace a un documento. Desde un formulario se abre en otra pestaña para no perder lo escrito. */
export const legalHref = (doc: LegalDocKey) => `/#/legal/${doc}`;

/** Versiones que la persona tiene delante, para que el servidor compruebe que acepta justo esas. */
export function legalVersions(legal: LegalInfo | null, keys: LegalDocKey[]) {
  if (!legal) return undefined;
  return Object.fromEntries(legal.docs.filter((d) => keys.includes(d.key)).map((d) => [d.key, d.version]));
}

/** Casilla sin marcar por defecto, con su enlace al lado para leer el documento. */
export function ConsentCheckbox({
  id,
  checked,
  onChange,
  label,
  links,
  error,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  links: { doc: LegalDocKey; text: string }[];
  error?: string;
}) {
  return (
    <div>
      <div className="flex items-start gap-3 text-sm">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-positive"
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <p className="min-w-0 leading-snug">
          <label htmlFor={id} className="cursor-pointer">
            {label}
          </label>{' '}
          {links.map((l, i) => (
            <React.Fragment key={l.doc}>
              {i > 0 && <span className="text-muted-foreground"> · </span>}
              <a
                href={legalHref(l.doc)}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {l.text}
                <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            </React.Fragment>
          ))}
        </p>
      </div>
      {error && (
        <p id={`${id}-error`} className="ml-8 mt-1 text-xs font-semibold text-negative-ink">
          {error}
        </p>
      )}
    </div>
  );
}

export type LegalAccept = { terms: boolean; privacy: boolean };

/**
 * Las dos casillas separadas: términos (y, al comprar, reembolsos) y autorización de datos personales.
 * Errores: los del servidor (`accept_terms`, `accept_privacy`).
 */
export function LegalConsentFields({
  idPrefix,
  variant = 'cuenta',
  value,
  onChange,
  errors = {},
  className,
}: {
  idPrefix: string;
  variant?: 'cuenta' | 'pago';
  value: LegalAccept;
  onChange: (v: LegalAccept) => void;
  errors?: Record<string, string | undefined>;
  className?: string;
}) {
  const { legal } = useSession();
  const labels = legal?.labels;
  const pago = variant === 'pago';
  return (
    <fieldset className={cn('grid gap-3', className)}>
      <legend className="sr-only">Aceptación de los documentos legales</legend>
      <ConsentCheckbox
        id={`${idPrefix}-terms`}
        checked={value.terms}
        onChange={(terms) => onChange({ ...value, terms })}
        label={(pago ? labels?.pagoTerminos : labels?.terminos) ?? 'Acepto los Términos y condiciones.'}
        links={pago ? [{ doc: 'terminos', text: 'Leer términos' }, { doc: 'reembolsos', text: 'Leer reembolsos' }] : [{ doc: 'terminos', text: 'Leer términos' }]}
        error={errors.accept_terms}
      />
      <ConsentCheckbox
        id={`${idPrefix}-privacy`}
        checked={value.privacy}
        onChange={(privacy) => onChange({ ...value, privacy })}
        label={(pago ? labels?.pagoPrivacidad : labels?.privacidad) ?? 'Autorizo el tratamiento de mis datos personales.'}
        links={[{ doc: 'privacidad', text: 'Leer política de privacidad' }]}
        error={errors.accept_privacy}
      />
    </fieldset>
  );
}

/** Pie con los documentos legales, las PQR y el enlace a la SIC (parágrafo del art. 50, Ley 1480 de 2011). */
export function LegalFooter({ className, pqr = false }: { className?: string; pqr?: boolean }) {
  const { legal } = useSession();
  const link = 'rounded underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <footer className={cn('no-print text-xs text-muted-foreground', className)}>
      <nav aria-label="Información legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        <a className={link} href="#/legal/terminos">
          Términos
        </a>
        <a className={link} href="#/legal/privacidad">
          Privacidad
        </a>
        <a className={link} href="#/legal/cookies">
          Cookies
        </a>
        <a className={link} href="#/legal/reembolsos">
          Reembolsos
        </a>
        {pqr && (
          <a className={link} href="#/pqr">
            Peticiones, quejas y reclamos
          </a>
        )}
        <a className={link} href="/licencias.txt" target="_blank" rel="noopener">
          Licencias
        </a>
        <a className={cn(link, 'inline-flex items-center gap-1')} href={legal?.sicUrl ?? 'https://www.sic.gov.co'} target="_blank" rel="noopener noreferrer">
          Superintendencia de Industria y Comercio
          <ExternalLink className="size-3" aria-hidden="true" />
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      </nav>
    </footer>
  );
}

/* ---------------------------------------------------------------- lector de Markdown (subconjunto) */

const SAFE_HREF = /^(#\/|\/(?!\/)|https:\/\/|mailto:)/;

/** **negrita**, `código` y [enlaces](destino). Nunca usa innerHTML: todo se pinta como texto. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1] !== undefined) out.push(<strong key={key} className="font-semibold text-foreground">{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{m[2]}</code>);
    else {
      const href = m[4];
      if (!SAFE_HREF.test(href)) out.push(m[3]);
      else {
        const external = /^https:/.test(href) || /\.txt$/.test(href);
        out.push(
          <a key={key} href={href} className="font-medium text-brand underline underline-offset-4" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {m[3]}
          </a>,
        );
      }
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const Tag = h[1].length <= 2 ? 'h2' : 'h3';
      blocks.push(
        <Tag key={k} className={Tag === 'h2' ? 'mt-8 text-[19px] font-semibold tracking-[-0.02em] first:mt-0' : 'mt-6 text-base font-semibold'}>
          {inline(h[2], k)}
        </Tag>,
      );
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      blocks.push(
        <div key={k} className="mt-4 overflow-x-auto rounded-[18px] border border-border">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                {cells(head).map((c, j) => (
                  <th key={j} scope="col" className="px-3 py-2 font-semibold">
                    {inline(c, `${k}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-t border-border align-top">
                  {cells(r).map((c, j) => (
                    <td key={j} className="px-3 py-2 text-muted-foreground">
                      {inline(c, `${k}r${ri}c${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const ul = /^-\s+/.test(line);
    const ol = /^\d+\.\s+/.test(line);
    if (ul || ol) {
      const items: string[] = [];
      const re = ul ? /^-\s+/ : /^\d+\.\s+/;
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      const List = ul ? 'ul' : 'ol';
      blocks.push(
        <List key={k} className={cn('mt-3 grid gap-1.5 pl-5 text-muted-foreground', ul ? 'list-disc' : 'list-decimal')}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${k}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|-\s|\d+\.\s|\|)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push(
      <p key={k} className="mt-3 text-muted-foreground">
        {inline(para.join(' '), k)}
      </p>,
    );
  }
  return <div className="text-[15px] leading-relaxed">{blocks}</div>;
}
