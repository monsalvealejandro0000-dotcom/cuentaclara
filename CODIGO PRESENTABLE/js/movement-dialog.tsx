import * as React from 'react';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { amountExample, amountPlaceholder, centsToInput, currencySymbol, money, parseMoney, pct, pctOf, todayISO } from '@/lib/format';
import type { Movement, MovementType } from '@/lib/types';
import { VAT_LABELS, WITHHOLDING_SHORT } from '@/lib/tax';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { SegmentedRadio } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { Field, FormError, useFocusFirstError } from '@/components/common';

export function RateOptions({ rates, selected, labels }: { rates: number[]; selected: number; labels?: Record<number, string> }) {
  const list = rates.includes(selected) ? rates : [...rates, selected];
  return (
    <>
      {list.map((r) => (
        <option key={r} value={r}>
          {labels?.[r] ?? pct(r)}
        </option>
      ))}
    </>
  );
}

export type MovementDialogState = { movement?: Movement; type?: MovementType; date?: string };

export function MovementDialog({ movement, type = 'ingreso', date, onClose, onSaved }: MovementDialogState & { onClose: () => void; onSaved: (m: Movement) => void }) {
  const { settings, meta } = useAuthed();
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState(() => ({
    type: movement?.type ?? type,
    date: movement?.date ?? date ?? todayISO(),
    concept: movement?.concept ?? '',
    category: movement?.category ?? meta.categories[movement?.type ?? type][0],
    base: centsToInput(movement?.base_cents),
    vat: movement?.vat_rate ?? settings.default_vat_rate,
    irpf: movement?.type === 'ingreso' ? movement.irpf_rate : settings.default_irpf_rate,
    deductible: movement?.deductible ?? true,
    notes: movement?.notes ?? '',
  }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  useFocusFirstError(formRef, errors);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const setType = (t: MovementType) => setF((s) => ({ ...s, type: t, category: meta.categories[t][0] }));

  const base = parseMoney(f.base);
  const vat = base != null ? pctOf(base, Number(f.vat)) : 0;
  const irpf = base != null && f.type === 'ingreso' ? pctOf(base, Number(f.irpf)) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.date) errs.date = 'Elige una fecha';
    if (!f.concept.trim()) errs.concept = 'Escribe un concepto';
    if (base == null) errs.base_cents = `Importe no válido (ej.: ${amountExample()})`;
    else if (base <= 0) errs.base_cents = 'El importe debe ser mayor que 0';
    setFormError(null);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      type: f.type,
      date: f.date,
      concept: f.concept,
      category: f.category,
      base_cents: base,
      vat_rate: Number(f.vat),
      irpf_rate: f.type === 'ingreso' ? Number(f.irpf) : 0,
      deductible: f.type === 'gasto' ? f.deductible : true,
      notes: f.notes,
    };
    setBusy(true);
    try {
      const res = movement
        ? await api<{ movement: Movement }>(`/movements/${movement.id}`, { method: 'PUT', body })
        : await api<{ movement: Movement }>('/movements', { method: 'POST', body });
      toast(movement ? 'Movimiento actualizado' : 'Movimiento guardado');
      onSaved(res.movement);
    } catch (err) {
      setErrors(errorFields(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={movement ? 'Editar movimiento' : f.type === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'}>
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <SegmentedRadio
          name="type"
          label="Tipo de movimiento"
          value={f.type}
          onChange={setType}
          options={[
            { value: 'ingreso', label: 'Ingreso' },
            { value: 'gasto', label: 'Gasto' },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="mf-date" label="Fecha" error={errors.date}>
            <Input type="date" name="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field id="mf-category" label="Categoría" error={errors.category}>
            <NativeSelect name="category" value={f.category} onChange={(e) => set('category', e.target.value)}>
              {meta.categories[f.type].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field id="mf-concept" label="Concepto" error={errors.concept}>
          <Input name="concept" maxLength={200} placeholder="Ej.: Diseño web para Cliente S.A.S." value={f.concept} onChange={(e) => set('concept', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="mf-base" label={`Base gravable (${currencySymbol()})`} error={errors.base_cents}>
            <Input name="base_cents" inputMode="decimal" autoComplete="off" placeholder={amountPlaceholder()} value={f.base} onChange={(e) => set('base', e.target.value)} />
          </Field>
          <Field id="mf-vat" label="IVA" error={errors.vat_rate}>
            <NativeSelect name="vat_rate" value={f.vat} onChange={(e) => set('vat', Number(e.target.value))}>
              <RateOptions rates={meta.vatRates} selected={Number(f.vat)} labels={VAT_LABELS} />
            </NativeSelect>
          </Field>
          {f.type === 'ingreso' && (
            <Field id="mf-irpf" label="Retención en la fuente" error={errors.irpf_rate}>
              <NativeSelect name="irpf_rate" value={f.irpf} onChange={(e) => set('irpf', Number(e.target.value))}>
                <RateOptions rates={meta.irpfRates} selected={Number(f.irpf)} labels={WITHHOLDING_SHORT} />
              </NativeSelect>
            </Field>
          )}
        </div>
        {f.type === 'gasto' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <input type="checkbox" name="deductible" className="mt-0.5 size-5 shrink-0 accent-[var(--positive-ink)]" checked={f.deductible} onChange={(e) => set('deductible', e.target.checked)} />
            <span>
              <span className="font-medium">Gasto deducible</span>
              <span className="block text-xs text-muted-foreground">{settings.vat_responsible ? 'Resta en tu renta y su IVA es descontable.' : 'Resta en tu renta, con su IVA incluido (para ti es costo).'}</span>
            </span>
          </label>
        )}
        <Field id="mf-notes" label={<>Notas <span className="text-muted-foreground">(opcional)</span></>} error={errors.notes}>
          <Textarea name="notes" rows={2} maxLength={1000} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-[18px] border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
          {base == null ? (
            'Escribe la base gravable para ver el IVA y el total.'
          ) : (
            <>
              <span>
                IVA <b className="tabular font-medium text-foreground">{money(vat)}</b>
              </span>
              {f.type === 'ingreso' && (
                <span>
                  Retención <b className="tabular font-medium text-foreground">−{money(irpf)}</b>
                </span>
              )}
              <span>
                Total {f.type === 'ingreso' ? 'a cobrar' : 'pagado'} <b className="tabular font-medium text-foreground">{money(base + vat - irpf)}</b>
              </span>
            </>
          )}
        </div>
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
