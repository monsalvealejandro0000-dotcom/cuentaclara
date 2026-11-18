import * as React from 'react';
import { Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { navigate, replaceUrl } from '@/lib/router';
import { capitalize, currentMonth, isDate, isMonth, longDate, monthLabel, todayISO } from '@/lib/format';
import type { CalendarEvent } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/confirm';
import { ErrorState, Loading, MonthNav, PageHeader } from '@/components/common';
import { EVENT_CATEGORIES, EventDialog } from '@/components/event-dialog';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const timeLabel = (ev: CalendarEvent) => (ev.all_day ? 'Todo el día' : ev.end_time ? `${ev.start_time}–${ev.end_time}` : ev.start_time ?? '');

/** Días de la cuadrícula: semanas completas de lunes a domingo. */
function gridDays(month: string) {
  const [y, m] = month.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const weeks = Math.ceil((offset + new Date(y, m, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => todayISO(new Date(y, m - 1, 1 - offset + i)));
}

export function CalendarPage({ query }: { query: URLSearchParams }) {
  const today = todayISO();
  const diaParam = query.get('dia');
  const month = isMonth(query.get('mes')) ? query.get('mes')! : isDate(diaParam) ? diaParam!.slice(0, 7) : currentMonth();
  const [selected, setSelected] = React.useState(isDate(diaParam) && diaParam!.startsWith(month) ? diaParam! : today.startsWith(month) ? today : `${month}-01`);
  const days = React.useMemo(() => gridDays(month), [month]);
  const { data, error, loading, reload } = useLoad(() => api<{ events: CalendarEvent[] }>(`/events?from=${days[0]}&to=${days[days.length - 1]}`), [month]);
  const events = data?.events ?? [];
  const on = (day: string) => events.filter((e) => e.date === day);
  const [dialog, setDialog] = React.useState<{ event?: CalendarEvent; date: string } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const gridRef = React.useRef<HTMLDivElement>(null);

  function select(day: string) {
    if (!day.startsWith(month)) return navigate(`/calendario?mes=${day.slice(0, 7)}&dia=${day}`);
    setSelected(day);
    replaceUrl(`/calendario?mes=${month}&dia=${day}`);
  }

  async function remove(ev: CalendarEvent) {
    const ok = await confirm({ title: 'Eliminar evento', message: `Se eliminará «${ev.title}» del ${longDate(ev.date)}. Esta acción no se puede deshacer.` });
    if (!ok) return false;
    try {
      await api(`/events/${ev.id}`, { method: 'DELETE' });
      toast('Evento eliminado');
      reload();
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return false;
    }
  }

  const list = on(selected);

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Reuniones, plazos fiscales, cobros y cualquier cita de tu actividad."
        actions={
          <Button onClick={() => setDialog({ date: selected })}>
            <Plus /> Nuevo evento
          </Button>
        }
      />
      <MonthNav month={month} base="/calendario" />
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label={`Calendario de ${monthLabel(month)}`} className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
            <div className="grid grid-cols-7 border-b border-border bg-muted/50" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {d}
                </span>
              ))}
            </div>
            <div ref={gridRef} className="grid grid-cols-7">
              {days.map((day) => {
                const evs = on(day);
                const inMonth = day.startsWith(month);
                const isSel = day === selected;
                return (
                  <div key={day} className={cn('relative flex min-h-[56px] min-w-0 flex-col gap-1 border-b border-r border-border p-1 [&:nth-child(7n)]:border-r-0 md:min-h-[108px] md:p-2', !inMonth && 'bg-muted/40')}>
                    <button
                      type="button"
                      aria-pressed={isSel}
                      aria-label={`${longDate(day)}, ${evs.length ? `${evs.length} ${evs.length === 1 ? 'evento' : 'eventos'}` : 'sin eventos'}`}
                      onClick={() => select(day)}
                      className={cn(
                        'absolute inset-0 cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        isSel && 'bg-brand/8 ring-2 ring-inset ring-brand',
                      )}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none relative grid size-7 place-items-center self-center rounded-full text-[13px] font-semibold md:self-start',
                        !inMonth && 'text-muted-foreground',
                        day === today && 'bg-foreground text-background',
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <div className="pointer-events-none relative hidden min-w-0 gap-1 md:grid">
                      {evs.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setDialog({ event: ev, date: ev.date })}
                          title={`${timeLabel(ev)} · ${ev.title}`}
                          className="pointer-events-auto block w-full min-w-0 cursor-pointer truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11.5px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ borderLeftColor: EVENT_CATEGORIES[ev.category].color, background: `color-mix(in oklab, ${EVENT_CATEGORIES[ev.category].color} 14%, transparent)` }}
                        >
                          {!ev.all_day && <span className="tabular font-semibold text-muted-foreground">{ev.start_time} </span>}
                          {ev.title}
                        </button>
                      ))}
                      {evs.length > 3 && <span className="pl-1 text-[11px] text-muted-foreground">+{evs.length - 3} más</span>}
                    </div>
                    {evs.length > 0 && (
                      <span className="pointer-events-none relative flex justify-center gap-[3px] md:hidden" aria-hidden="true">
                        {evs.slice(0, 4).map((ev) => (
                          <i key={ev.id} className="size-1.5 rounded-full" style={{ background: EVENT_CATEGORIES[ev.category].color }} />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <Card aria-live="polite">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{capitalize(longDate(selected))}</h2>
              <Button variant="outline" size="sm" onClick={() => setDialog({ date: selected })}>
                <Plus /> Añadir
              </Button>
            </div>
            {list.length ? (
              <ul className="mt-4 grid gap-2.5">
                {list.map((ev) => (
                  <li key={ev.id} className="rounded-[18px] border border-border border-l-4 p-3.5" style={{ borderLeftColor: EVENT_CATEGORIES[ev.category].color }}>
                    <div className="tabular text-xs font-semibold text-muted-foreground">{timeLabel(ev)}</div>
                    <div className="mt-0.5 font-medium [overflow-wrap:anywhere]">{ev.title}</div>
                    <Badge className="mt-1.5" dot={false}>
                      {EVENT_CATEGORIES[ev.category].label}
                    </Badge>
                    {ev.notes && <p className="mt-1.5 whitespace-pre-line text-xs text-muted-foreground">{ev.notes}</p>}
                    <div className="mt-3 flex gap-1.5 max-md:[&>*]:flex-1">
                      <Button variant="outline" size="sm" onClick={() => setDialog({ event: ev, date: ev.date })}>
                        Editar
                      </Button>
                      <Button variant="ghost-destructive" size="sm" onClick={() => remove(ev)}>
                        Eliminar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No hay eventos este día.</p>
            )}
          </Card>
        </div>
      )}

      {dialog && (
        <EventDialog
          event={dialog.event}
          date={dialog.date}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
          onDelete={async (ev) => {
            if (await remove(ev)) setDialog(null);
          }}
        />
      )}
    </>
  );
}
