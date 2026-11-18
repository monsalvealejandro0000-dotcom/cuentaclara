import * as React from 'react';
import { ArrowLeft, Check, Copy, Send } from 'lucide-react';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { navigate } from '@/lib/router';
import { parseMoney } from '@/lib/format';
import { pesos } from '@/lib/tax';
import { TIER_NAME, untilAfterPayment, usePaymentConfig, usePayments } from '@/lib/payments';
import type { PaidTier, PaymentConfig } from '@/lib/types';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { SegmentedRadio } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { Field, FormError, Loading, PageHeader, useFocusFirstError } from '@/components/common';
import { dayLabel, PAYMENT_NOTE } from '@/components/plan';
import { LegalConsentFields, legalVersions, type LegalAccept } from '@/components/legal';
import { VerifyEmailFirst } from '@/components/security';

/* ------------------------------------------------------------------ */
/*  Pagar plan (#/planes/pagar?plan=pro|contador), fase 11.            */
/*  El cliente paga POR FUERA de la app y avisa que pagó. El plan solo */
/*  se activa cuando el administrador confirma el dinero.              */
/* ------------------------------------------------------------------ */

const monthsLabel = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`;
const pesosText = (cents: number) => pesos(cents / 100);
/** Centavos → texto para el campo de valor ("44.700"). */
const amountInput = (cents: number) => (cents / 100).toLocaleString('es-CO', { maximumFractionDigits: 0 });

export function PayPage({ query }: { query: URLSearchParams }) {
  const { plan, user } = useAuthed();
  const tier: PaidTier = query.get('plan') === 'contador' ? 'contador' : 'pro';
  const { config, loading } = usePaymentConfig();
  const { data: payments, loading: loadingPayments } = usePayments();
  const renewing = plan.tier === tier;
  const name = TIER_NAME[tier];

  const back = (
    <ButtonLink variant="ghost" href="#/planes">
      <ArrowLeft /> Volver a Planes
    </ButtonLink>
  );
  const header = <PageHeader title={`${renewing ? 'Renovar' : 'Comprar'} ${name}`} description="Pagas por fuera de la app y nos avisas aquí. Activamos tu plan cuando confirmamos el dinero." actions={back} />;

  if ((loading && !config) || (loadingPayments && !payments)) return <Loading />;

  const message = (title: string, text: React.ReactNode, action?: React.ReactNode) => (
    <>
      {header}
      <Card className="max-w-2xl">
        <CardTitle>{title}</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        {action && <div className="mt-4">{action}</div>}
      </Card>
    </>
  );

  if (!config) return message('El pago de los planes aún no está disponible', PAYMENT_NOTE);
  if (tier === 'pro' && plan.tier === 'contador') return message('Ya tienes el plan Contador', 'El plan Contador incluye todo lo de Pro: no necesitas comprarlo.');
  if (renewing && !plan.until) return message(`Tu plan ${name} no tiene fecha de fin`, 'Lo activó el administrador sin fecha de fin: no necesitas pagar.');
  if (payments?.pending) {
    const p = payments.pending;
    return message(
      'Ya tienes un pago en revisión',
      <>
        Avisaste un pago de {pesosText(p.expected_cents)} ({monthsLabel(p.months)} de {TIER_NAME[p.tier]}) con la referencia <b className="font-semibold text-foreground">{p.reference}</b>. Te
        avisaremos en Configuración cuando se confirme.
      </>,
      <ButtonLink variant="outline" href="#/configuracion">
        Ver estado
      </ButtonLink>,
    );
  }
  // Fase 13: para avisar un pago hace falta un correo confirmado (por ahí le escribimos sobre su compra).
  if (!user.emailVerified) {
    return (
      <>
        {header}
        <Card className="max-w-2xl">
          <CardTitle>Confirma tu correo para avisar un pago</CardTitle>
          <VerifyEmailFirst>Lo necesitamos para escribirte sobre tu compra: cuándo se activa tu plan o si hay que devolverte el dinero.</VerifyEmailFirst>
        </Card>
      </>
    );
  }
  return (
    <>
      {header}
      <PayForm tier={tier} config={config} />
    </>
  );
}

function PayForm({ tier, config }: { tier: PaidTier; config: PaymentConfig }) {
  const { plan, legal } = useAuthed();
  // Contrato de compra: términos + reembolsos, y autorización de los datos del pago. Sin marcar por defecto.
  const [accept, setAccept] = React.useState<LegalAccept>({ terms: false, privacy: false });
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [months, setMonths] = React.useState(1);
  const total = config.prices[tier] * months;
  const until = untilAfterPayment(plan, tier, months);
  const [f, setF] = React.useState({ method: config.methods[0].name, paid_on: plan.today, amount: amountInput(config.prices[tier]), receipt: '', note: '', confirm: false });
  const [amountTouched, setAmountTouched] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  useFocusFirstError(formRef, errors);

  // Mientras no lo edite, el valor pagado sigue al total.
  React.useEffect(() => {
    if (!amountTouched) setF((s) => ({ ...s, amount: amountInput(total) }));
  }, [total, amountTouched]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount_cents = parseMoney(f.amount);
    const errs: Record<string, string> = {};
    if (!amount_cents) errs.amount_cents = 'Escribe el valor que pagaste, p. ej. 44.700';
    if (!f.receipt.trim()) errs.receipt = 'Escribe el número de comprobante o de transacción';
    if (!f.paid_on) errs.paid_on = 'Elige la fecha del pago';
    else if (f.paid_on > plan.today) errs.paid_on = 'La fecha del pago no puede ser futura';
    setFormError(null);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api('/payments', {
        method: 'POST',
        body: {
          tier,
          months,
          method: f.method,
          paid_on: f.paid_on,
          amount_cents,
          receipt: f.receipt,
          note: f.note,
          confirm: f.confirm,
          accept_terms: accept.terms,
          accept_privacy: accept.privacy,
          versions: legalVersions(legal, ['terminos', 'reembolsos', 'privacidad']),
        },
      });
      toast('Recibimos tu aviso de pago. Activaremos tu plan cuando confirmemos el dinero.');
      navigate('/configuracion');
    } catch (err) {
      const fields = errorFields(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <Card>
        <CardTitle>1. Cuánto</CardTitle>
        <CardDescription>Cada mes son 30 días. Precio en pesos colombianos.</CardDescription>
        <SegmentedRadio
          name="months"
          label="Meses"
          className="mt-4 sm:max-w-md"
          value={String(months)}
          onChange={(v) => setMonths(Number(v))}
          options={config.months.map((m) => ({ value: String(m), label: monthsLabel(m) }))}
        />
        <Inset className="mt-4 flex flex-wrap items-end justify-between gap-3 px-4 py-3.5" aria-live="polite">
          <div>
            <div className="text-xs text-muted-foreground">Total a pagar</div>
            <div className="tabular mt-1 text-[28px] font-medium leading-none" data-testid="pay-total">
              {pesosText(total)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {pesosText(config.prices[tier])} × {monthsLabel(months)}
            </div>
          </div>
          <p className="text-sm text-muted-foreground sm:text-right">
            {plan.tier === tier ? 'Renovando, tu' : 'Tu'} plan {TIER_NAME[tier]} quedará hasta el{' '}
            <b className="font-semibold text-foreground">{until ? dayLabel(until) : '—'}</b>
            <br />
            cuando confirmemos el pago.
          </p>
        </Inset>
      </Card>

      <Card>
        <CardTitle>2. Cómo pagar</CardTitle>
        <CardDescription>Paga por cualquiera de estos medios. La app no recibe ni guarda dinero.</CardDescription>
        <ul className="mt-4 grid gap-2">
          {config.methods.map((m) => (
            <li key={m.name}>
              <Inset className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{m.name}</p>
                  <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{m.detail}</p>
                </div>
                <CopyButton text={m.detail} what={m.name} />
              </Inset>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-violet/40 bg-violet/10 px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">Tu referencia de pago</div>
            <div className="tabular mt-1 text-xl font-semibold" data-testid="pay-reference">
              {config.reference}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Escríbela en la descripción del pago para que podamos encontrarlo. Es siempre la misma.</p>
          </div>
          <CopyButton text={config.reference} what="la referencia" />
        </div>
        {config.contact && <p className="mt-3 text-sm text-muted-foreground">¿Dudas? {config.contact}</p>}
      </Card>

      <Card>
        <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
          <div>
            <CardTitle>3. Avisa que pagaste</CardTitle>
            <CardDescription>Con estos datos buscamos tu pago. Nunca escribas contraseñas, claves ni números de tarjeta.</CardDescription>
          </div>
          <FormError message={formError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pay-method" label="Cómo pagaste" error={errors.method}>
              <NativeSelect name="method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                {config.methods.map((m) => (
                  <option key={m.name}>{m.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="pay-date" label="Fecha del pago" error={errors.paid_on}>
              <Input type="date" name="paid_on" max={plan.today} value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} />
            </Field>
            <Field id="pay-amount" label="Valor que pagaste (pesos)" error={errors.amount_cents} hint={`El total es ${pesosText(total)}.`}>
              <Input
                name="amount"
                inputMode="numeric"
                value={f.amount}
                onChange={(e) => {
                  setAmountTouched(true);
                  setF({ ...f, amount: e.target.value });
                }}
              />
            </Field>
            <Field id="pay-receipt" label="Número de comprobante o de transacción" error={errors.receipt}>
              <Input name="receipt" maxLength={60} autoComplete="off" placeholder="Ej.: M1234567" value={f.receipt} onChange={(e) => setF({ ...f, receipt: e.target.value })} />
            </Field>
          </div>
          <Field id="pay-note" label="Nota (opcional)" error={errors.note}>
            <Textarea name="note" rows={2} maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
          <div>
            <label htmlFor="pay-confirm" className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                id="pay-confirm"
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-positive"
                checked={f.confirm}
                aria-invalid={errors.confirm ? true : undefined}
                onChange={(e) => setF({ ...f, confirm: e.target.checked })}
              />
              <span>Confirmo que hice este pago de {f.amount ? `$ ${f.amount}` : 'este valor'} a CuentaClara.</span>
            </label>
            {errors.confirm && <p className="ml-8 mt-1 text-xs font-semibold text-negative-ink">{errors.confirm}</p>}
          </div>
          <LegalConsentFields idPrefix="pay" variant="pago" value={accept} onChange={setAccept} errors={errors} />
          <p className="text-xs text-muted-foreground">
            Tienes 5 días hábiles para retractarte y recibir el 100 % de tu dinero, aunque el plan ya esté activo. Te lo devolvemos en máximo 15 días calendario.
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={!f.confirm || !accept.terms || !accept.privacy || busy} className="max-sm:w-full">
              <Send /> {busy ? 'Enviando…' : 'Enviar aviso de pago'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/** Copia seleccionando un texto oculto (método antiguo, funciona donde el portapapeles moderno está bloqueado). */
function copyWithSelection(text: string) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export function CopyButton({ text, what }: { text: string; what: string }) {
  const toast = useToast();
  const [done, setDone] = React.useState(false);
  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = copyWithSelection(text); // navegadores o ventanas que no dejan usar el portapapeles moderno
    }
    if (!ok) return toast('No se pudo copiar: selecciónalo y cópialo a mano', 'error');
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} aria-label={`Copiar ${what}`}>
      {done ? <Check /> : <Copy />} {done ? 'Copiado' : 'Copiar'}
    </Button>
  );
}
