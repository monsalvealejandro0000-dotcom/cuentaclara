import * as React from 'react';
import { api, errorFields, errorMessage } from '@/lib/api';
import type { CalendarEvent, EventCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Field, FormError, useFocusFirstError } from '@/components/common';

export const EVENT_CATEGORIES: Record<EventCategory, { label: string; color: string }> = {
  reunion: { label: 'Reunión', color: 'var(--brand)' },
  fiscal: { label: 'Fiscal / impuestos', color: 'var(--warning)' },
  cobro: { label: 'Cobro / pago', color: 'var(--positive)' },
  otro: { label: 'Otro', color: 'var(--muted-foreground)' },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function EventDialog({ event, date, onClose, onSaved, onDelete }: { event?: CalendarEvent; date: string; onClose: () => void; onSaved: () => void; onDelete?: (e: CalendarEvent) => void }) {
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState(() => ({
    title: event?.title ?? '',
    date: event?.date ?? date,
    category: event?.category ?? ('reunion' as EventCategory),
    all_day: event?.all_day ?? false,
    start_time: event?.start_time ?? '09:00',
    end_time: event ? event.end_time ?? '' : '10:00',
    notes: event?.notes ?? '',
  }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  useFocusFirstError(formRef, errors);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.title.trim()) errs.title = 'Escribe un título';
    if (!f.date) errs.date = 'Elige una fecha';
    if (!f.all_day) {
      if (!TIME_RE.test(f.start_time)) errs.start_time = 'Indica la hora de inicio o marca «Todo el día»';
      else if (f.end_time && f.end_time <= f.start_time) errs.end_time = 'Debe ser posterior a la hora de inicio';
    }
    setFormError(null);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      title: f.title,
      date: f.date,
      all_day: f.all_day,
      start_time: f.all_day ? null : f.start_time,
      end_time: f.all_day ? null : f.end_time || null,
      category: f.category,
      notes: f.notes,
    };
    setBusy(true);
    try {
      if (event) await api(`/events/${event.id}`, { method: 'PUT', body });
      else await api('/events', { method: 'POST', body });
      toast(event ? 'Evento actualizado' : 'Evento creado');
      onSaved();
    } catch (err) {
      setErrors(errorFields(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={event ? 'Editar evento' : 'Nuevo evento'}>
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <Field id="ev-title" label="Título" error={errors.title}>
          <Input name="title" maxLength={120} placeholder="Ej.: Reunión con cliente" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ev-date" label="Fecha" error={errors.date}>
            <Input type="date" name="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field id="ev-cat" label="Categoría" error={errors.category}>
            <NativeSelect name="category" value={f.category} onChange={(e) => set('category', e.target.value as EventCategory)}>
              {Object.entries(EVENT_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="all_day" className="size-5 accent-[var(--brand)]" checked={f.all_day} onChange={(e) => set('all_day', e.target.checked)} />
          Todo el día
        </label>
        {!f.all_day && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ev-start" label="Hora de inicio" error={errors.start_time}>
              <Input type="time" step={300} name="start_time" value={f.start_time} onChange={(e) => set('start_time', e.target.value)} />
            </Field>
            <Field id="ev-end" label={<>Hora de fin <span className="text-muted-foreground">(opcional)</span></>} error={errors.end_time}>
              <Input type="time" step={300} name="end_time" value={f.end_time} onChange={(e) => set('end_time', e.target.value)} />
            </Field>
          </div>
        )}
        <Field id="ev-notes" label={<>Notas <span className="text-muted-foreground">(opcional)</span></>} error={errors.notes}>
          <Textarea name="notes" rows={3} maxLength={1000} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <DialogActions>
          {event && onDelete && (
            <Button variant="ghost-destructive" className="sm:mr-auto" onClick={() => onDelete(event)}>
              Eliminar
            </Button>
          )}
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
