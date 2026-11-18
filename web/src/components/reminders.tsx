import * as React from 'react';
import { BellRing } from 'lucide-react';
import { api, ApiError, errorFields, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { useLoad } from '@/lib/use-load';
import { money } from '@/lib/format';
import { monthOfYear } from '@/lib/tax';
import type { Declaration, Reminders } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Field, FormError } from '@/components/common';
import { dayLabel, hasPro, ProBadge, useProAction } from '@/components/plan';
import { useScope } from '@/lib/scope';

/* ------------------------------------------------------------------ */
/*  Avisos de declaración (Pro). La app avisa por mes: el día exacto   */
/*  depende de los últimos dígitos del NIT y lo anota el usuario.       */
/* ------------------------------------------------------------------ */

/** Si el plan cambió (403 PLAN_REQUIRED), vuelve a pedirlo para que la pantalla se actualice. */
export function usePlanRefreshOn(error: unknown) {
  const { refreshPlan } = useAuthed();
  const handled = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (error instanceof ApiError && error.code === 'PLAN_REQUIRED' && handled.current !== error) {
      handled.current = error; // una sola vez por error
      refreshPlan();
    }
  }, [error, refreshPlan]);
}

const ivaPeriod = (d: Declaration) => d.title.replace(/^IVA /, '');

function whenText(d: Declaration) {
  if (d.exactDate) {
    const n = d.daysUntil ?? 0;
    const left = n > 1 ? `faltan ${n} días` : n === 1 ? 'es mañana' : n === 0 ? 'es hoy' : 'la fecha que anotaste ya pasó';
    return d.kind === 'iva'
      ? `Declaras el IVA de ${ivaPeriod(d)} el ${dayLabel(d.exactDate)} · ${left}`
      : `Declaras la renta de ${d.year} el ${dayLabel(d.exactDate)} · ${left}`;
  }
  return d.kind === 'iva'
    ? `Declaras el IVA de ${ivaPeriod(d)} en ${monthOfYear(d.dueFrom)}`
    : `Entre agosto y octubre de ${d.year + 1} declaras la renta de ${d.year} (formulario 210), si estás obligado a declarar`;
}

function amountText(d: Declaration) {
  if (d.amount > 0) return `Estimado a pagar: ${money(d.amount)}`;
  if (d.amount < 0) return `Saldo a favor estimado: ${money(-d.amount)}`;
  return 'Sin saldo estimado con tus movimientos';
}

/** Dashboard: avisos activos (como máximo 2, primero el más cercano). Solo con Pro. */
export function DashboardReminders() {
  const { plan } = useAuthed();
  return hasPro(plan) ? <ActiveReminders /> : null;
}

function ActiveReminders() {
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api<Reminders>('/reminders'), []);
  const [dating, setDating] = React.useState<Declaration | null>(null);
  usePlanRefreshOn(error);

  async function markFiled(d: Declaration) {
    try {
      await api(`/reminders/${d.key}`, { method: 'PUT', body: { filed: true } });
      toast('Marcada como presentada. Puedes deshacerlo en Configuración.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    reload();
  }

  if (!data?.active.length) return null;
  return (
    <section aria-label="Avisos de declaración" className="mb-5 grid gap-3">
      {data.active.slice(0, 2).map((d) => (
        <div key={d.key} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-warning/40 bg-warning/12 px-4 py-3" data-testid="reminder">
          <div className="flex min-w-0 items-start gap-2.5">
            <BellRing className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{whenText(d)}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {amountText(d)}
                {d.kind === 'iva' && !d.exactDate && ' · El día exacto depende de los últimos dígitos de tu NIT.'}
                {d.kind === 'renta' && ' · Estimación con tus movimientos: revísala con tu contador.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
            <Button variant="outline" size="sm" onClick={() => setDating(d)}>
              {d.exactDate ? 'Cambiar el día' : 'Anotar el día exacto'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => markFiled(d)}>
              Ya la presenté
            </Button>
          </div>
        </div>
      ))}
      {dating && (
        <ExactDateDialog
          declaration={dating}
          onClose={() => setDating(null)}
          onSaved={() => {
            setDating(null);
            reload();
          }}
        />
      )}
    </section>
  );
}

/** Anotar el día exacto: se guarda como evento «Fiscal / impuestos» del calendario. */
function ExactDateDialog({ declaration: d, onClose, onSaved }: { declaration: Declaration; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [date, setDate] = React.useState(d.exactDate ?? '');
  const [error, setError] = React.useState<string | undefined>();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return setError('Elige el día');
    setBusy(true);
    setFormError(null);
    try {
      await api(`/reminders/${d.key}`, { method: 'PUT', body: { date } });
      toast(d.exactDate ? 'Día cambiado en tu calendario' : 'Día anotado en tu calendario');
      onSaved();
    } catch (err) {
      setError(errorFields(err).date);
      setFormError(errorFields(err).date ? null : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Día exacto de la declaración" description={d.kind === 'iva' ? `IVA de ${ivaPeriod(d)} (formulario 300)` : `Renta ${d.year} (formulario 210)`} size="sm">
      <form noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <Field
          id="rem-date"
          label="Día"
          error={error}
          hint="Búscalo en el calendario tributario de la DIAN según los últimos dígitos de tu NIT. Se guarda como evento en tu Calendario."
        >
          <Input type="date" name="date" min="2000-01-01" max="2100-12-31" value={date} onChange={(e) => (setDate(e.target.value), setError(undefined))} />
        </Field>
        <DialogActions>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Configuración → «Avisos de declaración». */
export function RemindersCard() {
  const { plan } = useAuthed();
  return hasPro(plan) ? <RemindersSettings /> : <RemindersLocked />;
}

function CardHead() {
  return (
    <>
      <CardTitle className="flex items-center gap-2">
        <BellRing className="size-[18px] text-muted-foreground" aria-hidden="true" /> Avisos de declaración <ProBadge />
      </CardTitle>
      <CardDescription>Te avisamos en el Dashboard cuando se acerca tu declaración de IVA o de renta. Se ven al abrir la app: no llegan por correo ni al celular.</CardDescription>
    </>
  );
}

function RemindersLocked() {
  const run = useProAction();
  return (
    <Card>
      <CardHead />
      <Button variant="outline" className="mt-4" onClick={() => run('avisos', () => {})}>
        Ver qué incluye
      </Button>
    </Card>
  );
}

function RemindersSettings() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<Reminders>('/reminders'), []);
  const [prefs, setPrefs] = React.useState<{ vat: boolean; renta: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  usePlanRefreshOn(error);

  React.useEffect(() => {
    if (data && !prefs) setPrefs(data.preferences);
  }, [data, prefs]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs) return;
    setBusy(true);
    setSaveError(null);
    try {
      await api('/reminders', { method: 'PUT', body: prefs });
      toast('Avisos guardados');
      reload();
    } catch (err) {
      setSaveError(errorMessage(err));
    }
    setBusy(false);
  }

  async function undo(d: Declaration) {
    try {
      await api(`/reminders/${d.key}`, { method: 'PUT', body: { filed: false } });
      toast('Vuelve a estar pendiente');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    reload();
  }

  const changed = Boolean(data && prefs && (prefs.vat !== data.preferences.vat || prefs.renta !== data.preferences.renta));

  return (
    <Card>
      <CardHead />
      {loading && !data ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : error && !data ? (
        <div className="mt-4">
          <FormError message={errorMessage(error)} />
          <Button variant="outline" className="mt-3" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : data && prefs ? (
        <>
          <form onSubmit={save} className="mt-4 grid gap-3">
            <FormError message={saveError} />
            <Toggle
              id="rem-vat"
              label="Avisar del IVA (formulario 300)"
              checked={prefs.vat}
              disabled={!data.vatResponsible}
              hint={!data.vatResponsible ? 'No eres responsable de IVA: no hay declaraciones de IVA que avisar.' : undefined}
              onChange={(vat) => setPrefs({ ...prefs, vat })}
            />
            <Toggle id="rem-renta" label="Avisar de la renta (formulario 210)" checked={prefs.renta} onChange={(renta) => setPrefs({ ...prefs, renta })} />
            <div className="flex justify-end">
              <Button type="submit" disabled={!changed || busy}>
                {busy ? 'Guardando…' : 'Guardar avisos'}
              </Button>
            </div>
          </form>

          <h3 className="mt-5 text-sm font-semibold">Próximas declaraciones</h3>
          <ul className="mt-2 grid gap-2">
            {data.upcoming.map((d) => (
              <li key={d.key}>
                <Inset className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.kind === 'iva' ? `IVA de ${ivaPeriod(d)}` : `Renta ${d.year}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.kind === 'iva' ? `Se declara en ${monthOfYear(d.dueFrom)}` : `Se declara entre agosto y octubre de ${d.year + 1}`}
                      {d.exactDate && ` · Día anotado: ${dayLabel(d.exactDate)}`}
                      {d.filedOn && ` · Presentada (marcada el ${dayLabel(d.filedOn)})`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StateBadge d={d} />
                    {d.filed && (
                      <Button variant="ghost" size="sm" onClick={() => undo(d)}>
                        Deshacer
                      </Button>
                    )}
                  </div>
                </Inset>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

/** Texto corto de una declaración (panel de clientes): «IVA septiembre–octubre 2026 · 19 de noviembre (faltan 3 días)». */
export function declarationShort(d: Declaration) {
  const name = d.kind === 'iva' ? d.title : `Renta ${d.year}`;
  if (d.exactDate) {
    const n = d.daysUntil ?? 0;
    const left = n > 1 ? `faltan ${n} días` : n === 1 ? 'mañana' : n === 0 ? 'hoy' : 'ya pasó';
    return `${name} · ${dayLabel(d.exactDate)} (${left})`;
  }
  return d.kind === 'iva' ? `${name} · se declara en ${monthOfYear(d.dueFrom)}` : `${name} · entre agosto y octubre de ${d.year + 1}`;
}

/** Modo cliente (plan Contador): las declaraciones del cliente con su estado, sin botones. */
export function ClientDeclarations() {
  const { apiBase } = useScope();
  const { data, error } = useLoad(() => api<Reminders>(`${apiBase}/reminders`), [apiBase]);
  if (error) return <FormError message={errorMessage(error)} />;
  if (!data) return null;
  return (
    <Card className="mb-5">
      <CardTitle className="flex items-center gap-2">
        <BellRing className="size-[18px] text-muted-foreground" aria-hidden="true" /> Sus declaraciones
      </CardTitle>
      <CardDescription>Estado según lo que marcó el cliente en sus avisos. Solo lectura.</CardDescription>
      {data.upcoming.length ? (
        <ul className="mt-3 grid gap-2">
          {data.upcoming.map((d) => (
            <li key={d.key}>
              <Inset className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{declarationShort(d)}</p>
                  <p className="text-xs text-muted-foreground">{amountText(d)}</p>
                </div>
                <StateBadge d={d} />
              </Inset>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Sin declaraciones próximas.</p>
      )}
    </Card>
  );
}

function StateBadge({ d }: { d: Declaration }) {
  if (d.filed) return <Badge tone="positive">Presentada</Badge>;
  if (d.active) return <Badge tone="warning">Avisando</Badge>;
  if (!d.enabled) return <Badge>Aviso desactivado</Badge>;
  if (!d.hasOperations) return <Badge>Sin movimientos</Badge>;
  if (d.exactDate) return <Badge tone="brand">Día anotado</Badge>;
  return <Badge>Pendiente</Badge>;
}

function Toggle({ id, label, checked, disabled, hint, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; hint?: string; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label htmlFor={id} className={`flex min-h-11 cursor-pointer items-center gap-3 text-sm ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
        <input
          id={id}
          type="checkbox"
          className="size-5 shrink-0 cursor-pointer accent-positive disabled:cursor-not-allowed"
          checked={checked && !disabled}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="ml-8 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
