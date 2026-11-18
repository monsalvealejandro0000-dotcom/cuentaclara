import * as React from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useSession } from '@/lib/session';
import type { Pqr, PqrType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, Field, FormError, Loading, PageHeader, useFocusFirstError } from '@/components/common';
import { whenLocal } from '@/components/accountant';

/* ------------------------------------------------------------------ */
/*  Peticiones, quejas y reclamos (#/pqr), fase 12.                    */
/*  Radicado con fecha y hora y seguimiento en la misma pantalla        */
/*  (art. 50 lit. g, Ley 1480 de 2011, modificado por la Ley 2439/2024). */
/* ------------------------------------------------------------------ */

export const PQR_TYPES: { value: PqrType; label: string; hint: string }[] = [
  { value: 'peticion', label: 'Petición', hint: 'Pides información o algo sobre el servicio.' },
  { value: 'queja', label: 'Queja', hint: 'No estás conforme con la atención o con algo de la app.' },
  { value: 'reclamo', label: 'Reclamo', hint: 'Pides que se corrija algo: un cobro, un reembolso, el retracto, una falla.' },
  { value: 'datos', label: 'Datos personales', hint: 'Consultar, corregir o borrar tus datos, o revocar tu autorización (Ley 1581 de 2012).' },
];
const TYPE_LABEL = Object.fromEntries(PQR_TYPES.map((t) => [t.value, t.label])) as Record<PqrType, string>;
const MAX_MESSAGE = 3000;

export function PqrPage() {
  const { consentPending } = useSession();
  const { data, error, loading, reload } = useLoad(() => api<{ pqrs: Pqr[] }>('/pqrs'), []);
  // Sin aceptar los documentos vigentes la página se ve sola, fuera de la app.
  const standalone = consentPending.length > 0;

  const content = (
    <>
      <PageHeader
        title="Peticiones, quejas y reclamos"
        description="Recibes un número de radicado con la fecha y la hora, y aquí mismo ves el estado y la respuesta. Respondemos en máximo 15 días hábiles (10 para consultas de datos personales)."
        actions={
          standalone ? (
            <ButtonLink variant="ghost" href="#/dashboard">
              <ArrowLeft /> Volver
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="grid max-w-3xl gap-4">
        <PqrForm onSent={() => reload()} />
        <Card>
          <CardTitle>Tus solicitudes</CardTitle>
          {loading && !data ? (
            <Loading />
          ) : error && !data ? (
            <div className="mt-4">
              <ErrorState error={error} onRetry={reload} />
            </div>
          ) : data && data.pqrs.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Aún no has radicado ninguna">Cuando radiques una, aparecerá aquí con su número y su estado.</EmptyState>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3" data-testid="pqr-list">
              {data?.pqrs.map((p) => (
                <li key={p.id}>
                  <PqrItem p={p} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );

  return standalone ? <div className="mx-auto w-full max-w-[1000px] px-4 py-8">{content}</div> : content;
}

function PqrItem({ p }: { p: Pqr }) {
  return (
    <Inset className="grid gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="tabular text-sm font-semibold">{p.radicado}</p>
          <p className="text-xs text-muted-foreground">
            {TYPE_LABEL[p.type]} · radicada {whenLocal(p.createdAt)}
          </p>
        </div>
        <Badge tone={p.status === 'respondida' ? 'positive' : 'warning'}>{p.status === 'respondida' ? 'Respondida' : 'En trámite'}</Badge>
      </div>
      <p className="text-sm font-medium">{p.subject}</p>
      <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{p.message}</p>
      {p.status === 'respondida' && (
        <div className="mt-1 rounded-xl border border-positive/30 bg-positive/8 px-3 py-2.5">
          <p className="text-xs font-semibold">Respuesta · {p.respondedAt ? whenLocal(p.respondedAt) : ''}</p>
          <p className="mt-1 whitespace-pre-line break-words text-sm">{p.response}</p>
        </div>
      )}
    </Inset>
  );
}

function PqrForm({ onSent }: { onSent: () => void }) {
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState<{ type: PqrType; subject: string; message: string }>({ type: 'peticion', subject: '', message: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState<Pqr | null>(null);
  useFocusFirstError(formRef, errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.subject.trim()) errs.subject = 'Escribe el asunto';
    if (!f.message.trim()) errs.message = 'Cuéntanos qué necesitas';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { pqr } = await api<{ pqr: Pqr }>('/pqrs', { method: 'POST', body: f });
      setSent(pqr);
      setF({ type: 'peticion', subject: '', message: '' });
      toast(`Radicada con el número ${pqr.radicado}`);
      onSent();
    } catch (err) {
      const fields = errorFields(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
    }
    setBusy(false);
  }

  const type = PQR_TYPES.find((t) => t.value === f.type)!;
  return (
    <Card>
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <div>
          <CardTitle>Radicar una solicitud</CardTitle>
          <CardDescription>Nunca escribas contraseñas, claves ni números de tarjeta.</CardDescription>
        </div>
        {sent && (
          <div role="status" className="rounded-[18px] border border-positive/35 bg-positive/10 px-4 py-3 text-sm">
            Radicada: <b className="tabular font-semibold">{sent.radicado}</b> · {whenLocal(sent.createdAt)}. Guarda este número para hacerle seguimiento.
          </div>
        )}
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <Field id="pqr-type" label="Tipo" error={errors.type} hint={type.hint}>
            <NativeSelect name="type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as PqrType })}>
              {PQR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="pqr-subject" label="Asunto" error={errors.subject}>
            <Input name="subject" maxLength={120} autoComplete="off" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          </Field>
        </div>
        <Field id="pqr-message" label="Mensaje" error={errors.message} hint={`${f.message.length} / ${MAX_MESSAGE} caracteres`}>
          <Textarea name="message" rows={5} maxLength={MAX_MESSAGE} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy} className="max-sm:w-full">
            <Send /> {busy ? 'Enviando…' : 'Radicar'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
