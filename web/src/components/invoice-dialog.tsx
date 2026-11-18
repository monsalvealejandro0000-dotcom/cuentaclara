import * as React from 'react';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { addDays, amountExample, amountPlaceholder, centsToInput, currencySymbol, money, parseMoney, pctOf, todayISO } from '@/lib/format';
import type { Invoice } from '@/lib/types';
import { VAT_LABELS, WITHHOLDING_SHORT } from '@/lib/tax';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Field, FormError, useFocusFirstError } from '@/components/common';
import { RateOptions } from './movement-dialog';

export function InvoiceDialog({ invoice, onClose, onSaved }: { invoice?: Invoice; onClose: () => void; onSaved: (i: Invoice) => void }) {
  const { settings, meta } = useAuthed();
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const today = todayISO();
  const [f, setF] = React.useState(() => ({
    client_name: invoice?.client_name ?? '',
    client_nif: invoice?.client_nif ?? '',
    client_address: invoice?.client_address ?? '',
    issue_date: invoice?.issue_date ?? today,
    due_date: invoice ? invoice.due_date ?? '' : addDays(today, 30),
    concept: invoice?.concept ?? '',
    base: centsToInput(invoice?.base_cents),
    vat: invoice?.vat_rate ?? settings.default_vat_rate,
    irpf: invoice?.irpf_rate ?? settings.default_irpf_rate,
    notes: invoice?.notes ?? '',
  }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  useFocusFirstError(formRef, errors);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const base = parseMoney(f.base);
  const vat = base != null ? pctOf(base, Number(f.vat)) : 0;
  const irpf = base != null ? pctOf(base, Number(f.irpf)) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.client_name.trim()) errs.client_name = 'Escribe el nombre del cliente';
    if (!f.issue_date) errs.issue_date = 'Elige la fecha de emisión';
    if (f.due_date && f.issue_date && f.due_date < f.issue_date) errs.due_date = 'No puede ser anterior a la emisión';
    if (!f.concept.trim()) errs.concept = 'Describe el servicio o producto';
    if (base == null) errs.base_cents = `Importe no válido (ej.: ${amountExample()})`;
    else if (base <= 0) errs.base_cents = 'El importe debe ser mayor que 0';
    setFormError(null);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      client_name: f.client_name,
      client_nif: f.client_nif,
      client_address: f.client_address,
      issue_date: f.issue_date,
      due_date: f.due_date || null,
      concept: f.concept,
      base_cents: base,
      vat_rate: Number(f.vat),
      irpf_rate: Number(f.irpf),
      status: invoice?.status ?? 'pendiente',
      paid_date: invoice?.paid_date && invoice.paid_date < f.issue_date ? f.issue_date : invoice?.paid_date ?? null,
      notes: f.notes,
    };
    setBusy(true);
    try {
      const res = invoice
        ? await api<{ invoice: Invoice }>(`/invoices/${invoice.id}`, { method: 'PUT', body })
        : await api<{ invoice: Invoice }>('/invoices', { method: 'POST', body });
      toast(invoice ? `Factura ${res.invoice.number} actualizada` : `Factura ${res.invoice.number} creada`);
      onSaved(res.invoice);
    } catch (err) {
      setErrors(errorFields(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={invoice ? `Editar factura ${invoice.number}` : 'Nueva factura'}
      description={invoice ? 'Al guardar se actualiza también su ingreso en Movimientos.' : 'El número se asigna al guardar y se crea su ingreso en Movimientos.'}
    >
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <fieldset className="grid gap-4 rounded-[18px] border border-border p-4">
          <legend className="px-1.5 text-[13px] font-semibold">Cliente</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="if-client" label="Nombre o razón social" error={errors.client_name}>
              <Input name="client_name" maxLength={200} value={f.client_name} onChange={(e) => set('client_name', e.target.value)} />
            </Field>
            <Field id="if-nif" label={<>NIT o cédula <span className="text-muted-foreground">(opcional)</span></>} error={errors.client_nif}>
              <Input name="client_nif" maxLength={20} autoCapitalize="characters" value={f.client_nif} onChange={(e) => set('client_nif', e.target.value)} />
            </Field>
          </div>
          <Field id="if-address" label={<>Dirección <span className="text-muted-foreground">(opcional)</span></>} error={errors.client_address}>
            <Input name="client_address" maxLength={300} value={f.client_address} onChange={(e) => set('client_address', e.target.value)} />
          </Field>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="if-issue" label="Fecha de emisión" error={errors.issue_date}>
            <Input type="date" name="issue_date" value={f.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
          </Field>
          <Field id="if-due" label={<>Vencimiento <span className="text-muted-foreground">(opcional)</span></>} error={errors.due_date}>
            <Input type="date" name="due_date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </Field>
        </div>
        <Field id="if-concept" label="Concepto" error={errors.concept}>
          <Textarea name="concept" rows={2} maxLength={500} value={f.concept} onChange={(e) => set('concept', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="if-base" label={`Base gravable (${currencySymbol()})`} error={errors.base_cents}>
            <Input name="base_cents" inputMode="decimal" autoComplete="off" placeholder={amountPlaceholder()} value={f.base} onChange={(e) => set('base', e.target.value)} />
          </Field>
          <Field id="if-vat" label="IVA" error={errors.vat_rate}>
            <NativeSelect name="vat_rate" value={f.vat} onChange={(e) => set('vat', Number(e.target.value))}>
              <RateOptions rates={meta.vatRates} selected={Number(f.vat)} labels={VAT_LABELS} />
            </NativeSelect>
          </Field>
          <Field id="if-irpf" label="Retención en la fuente" error={errors.irpf_rate}>
            <NativeSelect name="irpf_rate" value={f.irpf} onChange={(e) => set('irpf', Number(e.target.value))}>
              <RateOptions rates={meta.irpfRates} selected={Number(f.irpf)} labels={WITHHOLDING_SHORT} />
            </NativeSelect>
          </Field>
        </div>
        <Field id="if-notes" label={<>Notas en la factura <span className="text-muted-foreground">(opcional)</span></>} error={errors.notes}>
          <Textarea name="notes" rows={2} maxLength={1000} placeholder="Ej.: forma de pago, cuenta bancaria…" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-[18px] border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
          {base == null ? (
            'Escribe la base gravable para ver el total.'
          ) : (
            <>
              <span>
                IVA <b className="tabular font-medium text-foreground">{money(vat)}</b>
              </span>
              <span>
                Retención <b className="tabular font-medium text-foreground">−{money(irpf)}</b>
              </span>
              <span>
                Total factura <b className="tabular font-medium text-foreground">{money(base + vat - irpf)}</b>
              </span>
            </>
          )}
        </div>
        <DialogActions>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : invoice ? 'Guardar cambios' : 'Crear factura'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
