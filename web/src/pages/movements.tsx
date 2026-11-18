import * as React from 'react';
import { Download, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { useLoad } from '@/lib/use-load';
import { replaceUrl } from '@/lib/router';
import { currencyCode, currentMonth, decimalSeparator, downloadFile, formatDate, isMonth, money, monthRange, pct, signedMoney } from '@/lib/format';
import type { Movement, Totals } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input, NativeSelect, Label } from '@/components/ui/input';
import { TableCard, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/confirm';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/common';
import { MovementDialog, type MovementDialogState } from '@/components/movement-dialog';
import { ReportButton } from '@/components/plan';
import { useScope } from '@/lib/scope';

type Filters = { period: 'mes' | 'anio'; mes: string; anio: string; tipo: '' | 'ingreso' | 'gasto'; cat: string; q: string };

function readFilters(query: URLSearchParams): Filters {
  const anio = /^\d{4}$/.test(query.get('anio') || '') ? query.get('anio')! : '';
  const tipo = query.get('tipo');
  return {
    period: anio ? 'anio' : 'mes',
    mes: isMonth(query.get('mes')) ? query.get('mes')! : currentMonth(),
    anio: anio || currentMonth().slice(0, 4),
    tipo: tipo === 'ingreso' || tipo === 'gasto' ? tipo : '',
    cat: query.get('cat') || '',
    q: query.get('q') || '',
  };
}

export function toCsv(rows: Movement[]) {
  // Mismo separador decimal que la moneda elegida; si es la coma, las columnas van separadas por ';' (Excel en español).
  const dec = decimalSeparator();
  const sep = dec === ',' ? ';' : ',';
  const num = (c: number) => (c / 100).toFixed(2).replace('.', dec);
  const rate = (r: number) => String(r).replace('.', dec);
  const text = (v: string | null) => {
    const s = String(v ?? '');
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // evita fórmulas al abrir en Excel
    return new RegExp(`[${sep}"\\n\\r]`).test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Moneda', 'Base', 'IVA %', 'IVA', 'Retención %', 'Retención', 'Total', 'Deducible', 'Factura', 'Notas'];
  const lines = rows.map((m) => [
    m.date, m.type, text(m.concept), text(m.category), currencyCode(), num(m.amounts.base), rate(m.vat_rate), num(m.amounts.vat),
    rate(m.irpf_rate), num(m.amounts.irpf), num(m.amounts.total), m.deductible ? 'sí' : 'no', text(m.invoice_number), text(m.notes),
  ]);
  return `﻿${[head, ...lines].map((r) => r.join(sep)).join('\r\n')}`;
}

export function MovementsPage({ query }: { query: URLSearchParams }) {
  const { meta } = useAuthed();
  // Modo cliente (plan Contador): los movimientos del cliente, en solo lectura.
  const scope = useScope();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = React.useState(() => readFilters(query));
  const [search, setSearch] = React.useState(f.q);
  const [dialog, setDialog] = React.useState<MovementDialogState | null>(null);

  // Debounce de la búsqueda
  React.useEffect(() => {
    const t = setTimeout(() => setF((s) => (s.q === search.trim() ? s : { ...s, q: search.trim() })), 250);
    return () => clearTimeout(t);
  }, [search]);

  // La URL refleja los filtros (recargar mantiene la vista)
  React.useEffect(() => {
    const p = new URLSearchParams();
    if (f.period === 'anio') p.set('anio', f.anio);
    else p.set('mes', f.mes);
    if (f.tipo) p.set('tipo', f.tipo);
    if (f.cat) p.set('cat', f.cat);
    if (f.q) p.set('q', f.q);
    replaceUrl(`${scope.path('movimientos')}?${p}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const apiQuery = React.useMemo(() => {
    const range = f.period === 'anio' ? { from: `${f.anio}-01-01`, to: `${f.anio}-12-31` } : monthRange(f.mes);
    const p = new URLSearchParams(range);
    if (f.tipo) p.set('type', f.tipo);
    if (f.cat) p.set('category', f.cat);
    if (f.q) p.set('q', f.q);
    return p.toString();
  }, [f]);

  const { data, error, loading, reload } = useLoad(
    () => api<{ movements: Movement[]; totals: Totals }>(`${scope.apiBase}/movements?${apiQuery}`),
    [apiQuery, scope.apiBase],
  );
  const rows = data?.movements ?? [];
  const t = data?.totals;
  const filtered = Boolean(f.tipo || f.cat || f.q);

  const add = (type: 'ingreso' | 'gasto') => setDialog({ type, date: f.period === 'mes' && f.mes !== currentMonth() ? `${f.mes}-01` : undefined });

  async function remove(m: Movement) {
    const ok = await confirm({ title: 'Eliminar movimiento', message: `Se eliminará «${m.concept}» (${money(m.amounts.total)}). Esta acción no se puede deshacer.` });
    if (!ok) return;
    try {
      await api(`/movements/${m.id}`, { method: 'DELETE' });
      toast('Movimiento eliminado');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    reload();
  }

  return (
    <>
      <PageHeader
        title="Movimientos"
        description={scope.readOnly ? `Libro de ingresos y gastos de ${scope.client!.name}.` : 'Tu libro de ingresos y gastos. El Dashboard se calcula a partir de aquí.'}
        actions={
          scope.readOnly ? undefined : (
            <>
              <Button variant="income" onClick={() => add('ingreso')}>
                <Plus /> Ingreso
              </Button>
              <Button variant="expense" onClick={() => add('gasto')}>
                <Plus /> Gasto
              </Button>
            </>
          )
        }
      />

      <form role="search" aria-label="Filtrar movimientos" onSubmit={(e) => e.preventDefault()} className="mb-4 grid grid-cols-2 gap-3 rounded-[28px] border border-border bg-card p-4 shadow-sm sm:p-5 lg:grid-cols-[150px_170px_150px_1fr_1.4fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="f-period">Periodo</Label>
          <NativeSelect id="f-period" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value as Filters['period'] })}>
            <option value="mes">Un mes</option>
            <option value="anio">Año completo</option>
          </NativeSelect>
        </div>
        {f.period === 'mes' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="f-mes">Mes</Label>
            <Input id="f-mes" type="month" min="2000-01" max="2100-12" value={f.mes} onChange={(e) => isMonth(e.target.value) && setF({ ...f, mes: e.target.value })} />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="f-anio">Año</Label>
            <Input id="f-anio" type="number" inputMode="numeric" min={2000} max={2100} value={f.anio} onChange={(e) => /^\d{4}$/.test(e.target.value) && setF({ ...f, anio: e.target.value })} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="f-tipo">Tipo</Label>
          <NativeSelect id="f-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Filters['tipo'] })}>
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="gasto">Gastos</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-cat">Categoría</Label>
          <NativeSelect id="f-cat" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
            <option value="">Todas</option>
            <optgroup label="Ingresos">
              {meta.categories.ingreso.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </optgroup>
            <optgroup label="Gastos">
              {meta.categories.gasto.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </optgroup>
          </NativeSelect>
        </div>
        <div className="col-span-2 grid gap-1.5 lg:col-span-1">
          <Label htmlFor="f-q">Buscar</Label>
          <Input id="f-q" type="search" maxLength={100} placeholder="Concepto o notas" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </form>

      {t && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-1" aria-live="polite">
          <Stat label="Ingresos" value={money(t.income)} dot="bg-positive" />
          <Stat label="Gastos" value={money(t.expenses)} dot="bg-negative" />
          <Stat label="Beneficio" value={money(t.profit)} />
          <span className="text-sm text-muted-foreground">
            {t.count} {t.count === 1 ? 'movimiento' : 'movimientos'}
          </span>
          <Button variant="outline" size="sm" className="ml-auto" disabled={!rows.length} onClick={() => downloadFile(`movimientos-${f.period === 'anio' ? f.anio : f.mes}.csv`, toCsv(rows), 'text/csv;charset=utf-8')}>
            <Download /> Exportar CSV
          </Button>
          <ReportButton size="sm" href={`${scope.path('informe')}?${f.period === 'anio' ? `anio=${f.anio}` : `mes=${f.mes}`}`} />
        </div>
      )}

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !rows.length ? (
        <EmptyState
          title={filtered ? 'Ningún movimiento coincide con los filtros' : 'No hay movimientos en este periodo'}
          actions={
            scope.readOnly ? undefined : (
              <>
                <Button variant="income" onClick={() => add('ingreso')}>
                  <Plus /> Ingreso
                </Button>
                <Button variant="expense" onClick={() => add('gasto')}>
                  <Plus /> Gasto
                </Button>
              </>
            )
          }
        >
          {filtered
            ? 'Prueba a quitar algún filtro o a cambiar el periodo.'
            : scope.readOnly
              ? 'Prueba con otro mes o con el año completo.'
              : 'Registra un ingreso o un gasto y verás aquí el detalle y los totales.'}
        </EmptyState>
      ) : (
        <TableCard>
          <Table>
            <THead>
              <tr>
                <TH>Fecha</TH>
                <TH>Concepto</TH>
                <TH className="text-right">Base</TH>
                <TH className="text-right">IVA</TH>
                <TH className="text-right">Retención</TH>
                <TH className="text-right">Total</TH>
                <TH>
                  <span className="sr-only">Acciones</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((m) => (
                <TR key={m.id}>
                  <TD label="Fecha" className="tabular whitespace-nowrap">
                    {formatDate(m.date)}
                  </TD>
                  <TD label="Concepto" variant="main">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={m.type === 'ingreso' ? 'positive' : 'negative'}>{m.type === 'ingreso' ? 'Ingreso' : 'Gasto'}</Badge>
                      <span className="font-medium">{m.concept}</span>
                      {m.invoice_id && (
                        <a href={`#${scope.path('facturas')}/${m.invoice_id}`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Badge tone="brand">Factura {m.invoice_number}</Badge>
                        </a>
                      )}
                      {m.type === 'gasto' && !m.deductible && <Badge>No deducible</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{m.category}</p>
                    {m.notes && <p className="mt-0.5 text-xs text-muted-foreground/80">{m.notes}</p>}
                  </TD>
                  <TD label="Base" className="tabular whitespace-nowrap text-right">
                    {money(m.amounts.base)}
                  </TD>
                  <TD label={`IVA (${pct(m.vat_rate)})`} className="tabular whitespace-nowrap text-right">
                    {money(m.amounts.vat)}
                  </TD>
                  <TD label="Retención" className="tabular whitespace-nowrap text-right">
                    {m.amounts.irpf ? `−${money(m.amounts.irpf)}` : '—'}
                  </TD>
                  <TD label="Total" className="tabular whitespace-nowrap text-right font-semibold">
                    <span className={m.type === 'ingreso' ? 'text-positive-ink' : 'text-negative-ink'}>{signedMoney(m.amounts.total, m.type)}</span>
                  </TD>
                  {scope.readOnly && !m.invoice_id ? (
                    <TD className="max-md:hidden" />
                  ) : (
                  <TD variant="actions">
                    <div className="flex justify-end gap-1.5 max-md:w-full">
                      {m.invoice_id ? (
                        <ButtonLink variant="outline" size="sm" href={`#${scope.path('facturas')}/${m.invoice_id}`} title={scope.readOnly ? undefined : 'Este ingreso se edita desde su factura'}>
                          Ver factura
                        </ButtonLink>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setDialog({ movement: m })}>
                            Editar
                          </Button>
                          <Button variant="ghost-destructive" size="sm" onClick={() => remove(m)}>
                            Eliminar
                          </Button>
                        </>
                      )}
                    </div>
                  </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableCard>
      )}

      {dialog && (
        <MovementDialog
          {...dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <span className="flex items-baseline gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {dot && <i className={`size-2 rounded-full ${dot}`} aria-hidden="true" />}
        {label}
      </span>
      <b className="tabular font-semibold">{value}</b>
    </span>
  );
}
