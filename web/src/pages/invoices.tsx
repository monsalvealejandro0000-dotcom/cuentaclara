import * as React from 'react';
import { ArrowLeft, Plus, Printer } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { useLoad } from '@/lib/use-load';
import { navigate, replaceUrl } from '@/lib/router';
import { formatDate, money, pct, todayISO } from '@/lib/format';
import type { Invoice } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Label, NativeSelect } from '@/components/ui/input';
import { TableCard, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/confirm';
import { Banner, EmptyState, ErrorState, Loading, PageHeader } from '@/components/common';
import { InvoiceDialog } from '@/components/invoice-dialog';
import { useScope } from '@/lib/scope';

const isOverdue = (i: Invoice) => i.status === 'pendiente' && !!i.due_date && i.due_date < todayISO();

function StatusBadge({ invoice }: { invoice: Invoice }) {
  if (invoice.status === 'cobrada') return <Badge tone="positive">Cobrada {formatDate(invoice.paid_date)}</Badge>;
  return isOverdue(invoice) ? <Badge tone="negative">Vencida</Badge> : <Badge tone="warning">Pendiente</Badge>;
}

function useInvoiceActions(reload: () => void) {
  const toast = useToast();
  const confirm = useConfirm();
  return {
    async toggle(inv: Invoice) {
      const status = inv.status === 'pendiente' ? 'cobrada' : 'pendiente';
      try {
        await api(`/invoices/${inv.id}/status`, { method: 'PUT', body: { status } });
        toast(status === 'cobrada' ? `Factura ${inv.number} marcada como cobrada` : `Factura ${inv.number} marcada como pendiente`);
        reload();
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
    },
    async remove(inv: Invoice) {
      const ok = await confirm({
        title: `Eliminar factura ${inv.number}`,
        message: `También se eliminará su ingreso de ${money(inv.amounts.base)} en Movimientos y el Dashboard se recalculará. Esta acción no se puede deshacer.`,
      });
      if (!ok) return false;
      try {
        await api(`/invoices/${inv.id}`, { method: 'DELETE' });
        toast(`Factura ${inv.number} eliminada`);
        return true;
      } catch (err) {
        toast(errorMessage(err), 'error');
        return false;
      }
    },
  };
}

export function InvoicesPage({ query }: { query: URLSearchParams }) {
  const { settings } = useAuthed();
  // Modo cliente (plan Contador): las facturas del cliente, en solo lectura.
  const scope = useScope();
  const thisYear = todayISO().slice(0, 4);
  const [f, setF] = React.useState(() => {
    const anio = query.get('anio');
    const estado = query.get('estado');
    return {
      anio: anio === 'todos' ? 'todos' : /^\d{4}$/.test(anio || '') ? anio! : thisYear,
      estado: estado === 'pendiente' || estado === 'cobrada' ? estado : '',
    };
  });
  const [dialog, setDialog] = React.useState<{ invoice?: Invoice } | null>(null);

  React.useEffect(() => {
    const p = new URLSearchParams({ anio: f.anio });
    if (f.estado) p.set('estado', f.estado);
    replaceUrl(`${scope.path('facturas')}?${p}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const apiQuery = new URLSearchParams();
  if (f.anio !== 'todos') apiQuery.set('year', f.anio);
  if (f.estado) apiQuery.set('status', f.estado);
  const { data, error, loading, reload } = useLoad(
    () =>
      api<{ invoices: Invoice[]; totals: { count: number; base_cents: number; total_cents: number; pending_cents: number }; years: number[] }>(
        `${scope.apiBase}/invoices?${apiQuery}`,
      ),
    [apiQuery.toString(), scope.apiBase],
  );
  const actions = useInvoiceActions(reload);
  const years = [...new Set([thisYear, ...(data?.years ?? []).map(String), ...(f.anio !== 'todos' ? [f.anio] : [])])].sort().reverse();
  const invoices = data?.invoices ?? [];

  return (
    <>
      <PageHeader
        title="Facturas"
        description={scope.readOnly ? `Facturas y cuentas de cobro de ${scope.client!.name}.` : 'Cada factura crea automáticamente su ingreso en Movimientos.'}
        actions={
          scope.readOnly ? undefined : (
            <Button onClick={() => setDialog({})}>
              <Plus /> Nueva factura
            </Button>
          )
        }
      />
      {!scope.readOnly && !(settings.business_name && settings.nif) && (
        <Banner action={<ButtonLink variant="outline" size="sm" href="#/configuracion">Completar datos tributarios</ButtonLink>}>Tus facturas aún no muestran tu nombre y NIT o cédula.</Banner>
      )}

      <form aria-label="Filtrar facturas" onSubmit={(e) => e.preventDefault()} className="mb-4 grid grid-cols-2 gap-3 rounded-[28px] border border-border bg-card p-4 shadow-sm sm:max-w-md sm:p-5">
        <div className="grid gap-1.5">
          <Label htmlFor="i-anio">Año</Label>
          <NativeSelect id="i-anio" value={f.anio} onChange={(e) => setF({ ...f, anio: e.target.value })}>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
            <option value="todos">Todos los años</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="i-estado">Estado</Label>
          <NativeSelect id="i-estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as typeof f.estado })}>
            <option value="">Todas</option>
            <option value="pendiente">Pendientes de cobro</option>
            <option value="cobrada">Cobradas</option>
          </NativeSelect>
        </div>
      </form>

      {data && (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 px-1 text-sm" aria-live="polite">
          <span className="text-muted-foreground">
            Facturado (base) <b className="tabular font-semibold text-foreground">{money(data.totals.base_cents)}</b>
          </span>
          <span className="text-muted-foreground">
            Total facturas <b className="tabular font-semibold text-foreground">{money(data.totals.total_cents)}</b>
          </span>
          <span className="text-muted-foreground">
            Pendiente de cobro <b className="tabular font-semibold text-foreground">{money(data.totals.pending_cents)}</b>
          </span>
          <span className="text-muted-foreground">
            {data.totals.count} {data.totals.count === 1 ? 'factura' : 'facturas'}
          </span>
        </div>
      )}

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !invoices.length ? (
        scope.readOnly ? (
          <EmptyState title={f.estado ? 'No hay facturas con este estado' : 'Este cliente no tiene facturas en este periodo'} />
        ) : (
          <EmptyState
            title={f.estado ? 'No hay facturas con este estado' : 'Aún no has emitido facturas en este periodo'}
            actions={
              <Button onClick={() => setDialog({})}>
                <Plus /> Nueva factura
              </Button>
            }
          >
            Al crear una factura se numera automáticamente ({thisYear}-001, 002…) y su ingreso aparece en Movimientos y en el Dashboard.
          </EmptyState>
        )
      ) : (
        <TableCard>
          <Table>
            <THead>
              <tr>
                <TH>Número</TH>
                <TH>Fecha</TH>
                <TH>Cliente</TH>
                <TH className="text-right">Base</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH>
                  <span className="sr-only">Acciones</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {invoices.map((inv) => (
                <TR key={inv.id}>
                  <TD label="Número" variant="main">
                    <a href={`#${scope.path('facturas')}/${inv.id}`} className="tabular font-semibold underline-offset-4 hover:underline">
                      {inv.number}
                    </a>
                  </TD>
                  <TD label="Fecha" className="tabular">
                    {formatDate(inv.issue_date)}
                  </TD>
                  <TD label="Cliente">{inv.client_name}</TD>
                  <TD label="Base" className="tabular whitespace-nowrap text-right">
                    {money(inv.amounts.base)}
                  </TD>
                  <TD label="Total" className="tabular whitespace-nowrap text-right font-semibold">
                    {money(inv.amounts.total)}
                  </TD>
                  <TD label="Estado">
                    <div className="flex flex-col items-end gap-1 md:items-start">
                      <StatusBadge invoice={inv} />
                      {inv.status === 'pendiente' && inv.due_date && <span className="text-xs text-muted-foreground">Vence {formatDate(inv.due_date)}</span>}
                    </div>
                  </TD>
                  <TD variant="actions">
                    <div className="flex flex-wrap justify-end gap-1.5 max-md:w-full max-md:[&>*]:flex-1">
                      <ButtonLink variant="outline" size="sm" href={`#${scope.path('facturas')}/${inv.id}`}>
                        Ver
                      </ButtonLink>
                      {!scope.readOnly && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => actions.toggle(inv)}>
                            {inv.status === 'pendiente' ? 'Marcar cobrada' : 'Marcar pendiente'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setDialog({ invoice: inv })}>
                            Editar
                          </Button>
                          <Button variant="ghost-destructive" size="sm" onClick={async () => (await actions.remove(inv)) && reload()}>
                            Eliminar
                          </Button>
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableCard>
      )}

      {dialog && (
        <InvoiceDialog
          invoice={dialog.invoice}
          onClose={() => setDialog(null)}
          onSaved={(inv) => {
            setDialog(null);
            if (dialog.invoice) reload();
            else navigate(`/facturas/${inv.id}`);
          }}
        />
      )}
    </>
  );
}

export function InvoiceDetailPage({ id }: { id: string }) {
  // Modo cliente (plan Contador): la factura del cliente, con sus datos de emisor, en solo lectura.
  const scope = useScope();
  const { settings, user } = scope.owner;
  const { data, error, loading, reload } = useLoad(() => api<{ invoice: Invoice }>(`${scope.apiBase}/invoices/${encodeURIComponent(id)}`), [id, scope.apiBase]);
  const actions = useInvoiceActions(reload);
  const [editing, setEditing] = React.useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const inv = data.invoice;
  const a = inv.amounts;
  const complete = settings.business_name && settings.nif;

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink variant="ghost" href={`#${scope.path('facturas')}?anio=${inv.year}`}>
          <ArrowLeft /> Facturas
        </ButtonLink>
        <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          {!scope.readOnly && (
            <>
              <Button variant="outline" onClick={() => actions.toggle(inv)}>
                {inv.status === 'pendiente' ? 'Marcar cobrada' : 'Marcar pendiente'}
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Editar
              </Button>
              <Button variant="ghost-destructive" onClick={async () => (await actions.remove(inv)) && navigate(`/facturas?anio=${inv.year}`)}>
                Eliminar
              </Button>
            </>
          )}
          <Button onClick={() => window.print()}>
            <Printer /> Imprimir / PDF
          </Button>
        </div>
      </div>
      {!complete && (
        <div className="no-print">
          {scope.readOnly ? (
            <Banner>Este cliente no ha completado sus datos tributarios: el documento no es válido sin su nombre y NIT o cédula.</Banner>
          ) : (
            <Banner action={<ButtonLink variant="outline" size="sm" href="#/configuracion">Completar datos</ButtonLink>}>Faltan tus datos tributarios: el documento no es válido sin tu nombre y NIT o cédula.</Banner>
          )}
        </div>
      )}
      <p className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Estado: <StatusBadge invoice={inv} /> · Ingreso vinculado en{' '}
        <a className="text-brand underline-offset-4 hover:underline" href={`#${scope.path('movimientos')}?mes=${inv.issue_date.slice(0, 7)}`}>
          Movimientos
        </a>
      </p>

      <article aria-label={`Factura ${inv.number}`} className="print-area max-w-[860px] rounded-[28px] border border-border bg-white p-6 text-neutral-950 shadow-sm sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-neutral-950 pb-5">
          <div>
            <h1 className="text-[28px] font-semibold uppercase tracking-[0.06em]">{settings.vat_responsible ? 'Factura' : 'Cuenta de cobro'}</h1>
            <p className="tabular mt-1 text-lg font-semibold">Nº {inv.number}</p>
          </div>
          <dl className="grid gap-1 text-sm sm:text-right">
            <div className="flex gap-2 sm:justify-end">
              <dt className="text-neutral-500">Fecha de emisión</dt>
              <dd className="tabular font-semibold">{formatDate(inv.issue_date)}</dd>
            </div>
            {inv.due_date && (
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-neutral-500">Vencimiento</dt>
                <dd className="tabular font-semibold">{formatDate(inv.due_date)}</dd>
              </div>
            )}
          </dl>
        </header>
        <div className="my-6 grid gap-6 sm:grid-cols-2">
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Emisor</h2>
            <p className="font-semibold">{settings.business_name || user.name}</p>
            <p>{settings.nif ? `NIT o C.C.: ${settings.nif}` : <span className="font-semibold text-orange-700">NIT o cédula sin indicar</span>}</p>
            <p>{settings.vat_responsible ? 'Responsable de IVA' : 'No responsable de IVA'}</p>
            {settings.address && <p className="whitespace-pre-line">{settings.address}</p>}
            <p>{user.email}</p>
          </section>
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Cliente</h2>
            <p className="font-semibold">{inv.client_name}</p>
            {inv.client_nif && <p>NIT o C.C.: {inv.client_nif}</p>}
            {inv.client_address && <p className="whitespace-pre-line">{inv.client_address}</p>}
          </section>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-xs uppercase tracking-[0.05em] text-neutral-500">
              <th className="py-2 text-left font-medium">Concepto</th>
              <th className="py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-200">
              <td className="whitespace-pre-line py-3 pr-4">{inv.concept}</td>
              <td className="tabular py-3 text-right">{money(a.base)}</td>
            </tr>
          </tbody>
        </table>
        <dl className="ml-auto mt-4 grid max-w-[360px] text-sm">
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-neutral-600">Base gravable</dt>
            <dd className="tabular">{money(a.base)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-neutral-600">IVA ({pct(inv.vat_rate)})</dt>
            <dd className="tabular">{money(a.vat)}</dd>
          </div>
          {inv.irpf_rate > 0 && (
            <div className="flex justify-between gap-4 py-1.5">
              <dt className="text-neutral-600">Retención en la fuente ({pct(inv.irpf_rate)})</dt>
              <dd className="tabular">−{money(a.irpf)}</dd>
            </div>
          )}
          <div className="mt-1.5 flex justify-between gap-4 border-t-2 border-neutral-950 pt-2.5 text-base font-semibold">
            <dt>Total a pagar</dt>
            <dd className="tabular">{money(a.total)}</dd>
          </div>
        </dl>
        {inv.notes && <p className="mt-6 whitespace-pre-line border-t border-neutral-200 pt-3 text-sm text-neutral-600">{inv.notes}</p>}
        <p className="mt-6 text-xs text-neutral-500">
          Documento de control. Si eres responsable de IVA u obligado a facturar, debes expedir además la factura electrónica de venta validada por la DIAN.
        </p>
      </article>

      {editing && (
        <InvoiceDialog
          invoice={inv}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </>
  );
}
