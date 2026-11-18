import * as React from 'react';
import { ArrowLeft, Eye, FileText } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { sampleAmount, setCurrency } from '@/lib/format';
import { ClientScopeProvider } from '@/lib/scope';
import type { ClientProfile, ClientsData } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TableCard, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/confirm';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/common';
import { CONTADOR_FEATURES, FeatureList, PAYMENT_NOTE } from '@/components/plan';
import { dayLocal } from '@/components/accountant';
import { declarationShort, usePlanRefreshOn } from '@/components/reminders';
import { DashboardPage } from '@/pages/dashboard';
import { MovementsPage } from '@/pages/movements';
import { InvoiceDetailPage, InvoicesPage } from '@/pages/invoices';
import { ReportPage } from '@/pages/report';
import { cn } from '@/lib/utils';
import { VerifyEmailFirst } from '@/components/security';

/* ------------------------------------------------------------------ */
/*  Plan Contador (fase 10, docs/10-plan-contador.md)                  */
/*  Panel de clientes (#/clientes) y modo cliente (#/clientes/:id/…):  */
/*  las mismas pantallas del cliente, con sus datos, en solo lectura.  */
/* ------------------------------------------------------------------ */

const isPlanError = (err: unknown) => err instanceof ApiError && err.code === 'PLAN_REQUIRED';
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function ContadorLocked() {
  return (
    <Card className="max-w-2xl">
      <CardTitle className="flex items-center gap-2">
        Esto es del plan Contador <Badge tone="violet">Contador</Badge>
      </CardTitle>
      <p className="mt-3 text-sm">Atiende a tus clientes desde CuentaClara: ves sus movimientos, facturas, declaraciones e informes, en solo lectura.</p>
      <FeatureList className="mt-3" items={['Todo lo de Pro', ...CONTADOR_FEATURES]} />
      <p className="mt-3 text-sm text-muted-foreground">
        Lo activa el administrador. {PAYMENT_NOTE} Si ya tenías clientes, siguen vinculados y los verás de nuevo cuando tengas el plan.
      </p>
      <ButtonLink variant="outline" className="mt-4" href="#/planes">
        Ver planes
      </ButtonLink>
    </Card>
  );
}

export function ClientsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(() => api<ClientsData>('/clients'), []);
  const [q, setQ] = React.useState('');
  usePlanRefreshOn(error);

  async function act(path: string, method: string, done: string) {
    try {
      await api(path, { method });
      toast(done);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    reload();
  }

  async function stop(id: number, name: string) {
    const ok = await confirm({
      title: 'Dejar de atender',
      message: `Dejarás de ver los datos de ${name}. En su Configuración verá que ya no tiene contador.`,
      confirmLabel: 'Dejar de atender',
    });
    if (ok) await act(`/clients/${id}`, 'DELETE', `Ya no atiendes a ${name}`);
  }

  const query = normalize(q.trim());
  const clients = (data?.clients ?? []).filter((c) => !query || normalize(`${c.name} ${c.nif} ${c.email}`).includes(query));

  return (
    <>
      <PageHeader title="Clientes" description="Tus clientes y sus próximas declaraciones. Todo en solo lectura." />
      {loading && !data ? (
        <Loading />
      ) : isPlanError(error) ? (
        <ContadorLocked />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data ? (
        <div className="grid gap-4">
          {data.invitationsHidden && (
            <Card>
              <CardTitle>Invitaciones de tus clientes</CardTitle>
              <VerifyEmailFirst>
                Confirma tu correo para ver las invitaciones de tus clientes. Así nadie puede hacerse pasar por ti registrándose con tu correo.
              </VerifyEmailFirst>
            </Card>
          )}
          {data.invitations.length > 0 && (
            <Card>
              <CardTitle>Invitaciones pendientes</CardTitle>
              <CardDescription>Al aceptar, verás sus datos en solo lectura. El cliente puede quitarte el acceso cuando quiera.</CardDescription>
              <ul className="mt-3 grid gap-2">
                {data.invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-border px-4 py-3" data-testid="invitation">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.email} · te invitó el {dayLocal(i.invitedAt)}
                      </p>
                    </div>
                    <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
                      <Button variant="outline" size="sm" onClick={() => act(`/clients/invitations/${i.id}/reject`, 'POST', 'Invitación rechazada')}>
                        Rechazar
                      </Button>
                      <Button size="sm" onClick={() => act(`/clients/invitations/${i.id}/accept`, 'POST', `${i.name} ya es tu cliente`)}>
                        Aceptar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.clients.length === 0 ? (
            <EmptyState title="Aún no tienes clientes">
              Pídeles que te inviten desde Configuración → Mi contador con tu correo: <b className="font-semibold text-foreground">{data.email}</b>
            </EmptyState>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="grid w-full gap-1.5 sm:max-w-sm">
                  <label htmlFor="cl-q" className="text-[13px] font-medium">
                    Buscar
                  </label>
                  <Input id="cl-q" type="search" placeholder="Nombre, razón social o NIT" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {data.clients.length} {data.clients.length === 1 ? 'cliente' : 'clientes'}
                </p>
              </div>
              {clients.length === 0 ? (
                <EmptyState title="Ningún cliente coincide con la búsqueda" />
              ) : (
                <TableCard>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Cliente</TH>
                        <TH>Próxima declaración</TH>
                        <TH className="text-right">Reserva del mes</TH>
                        <TH>Avisos</TH>
                        <TH>
                          <span className="sr-only">Acciones</span>
                        </TH>
                      </tr>
                    </THead>
                    <TBody>
                      {clients.map((c) => (
                        <TR key={c.id} data-testid="client-row">
                          <TD label="Cliente" variant="main">
                            <p className="font-medium">{c.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {c.nif ? `NIT o C.C. ${c.nif}` : 'Sin NIT'} · {c.email}
                            </p>
                          </TD>
                          <TD label="Próxima declaración">{c.next ? declarationShort(c.next) : <span className="text-muted-foreground">Ninguna próxima</span>}</TD>
                          <TD label="Reserva del mes" className="tabular whitespace-nowrap text-right">
                            {/* En la moneda del cliente (puede no ser la tuya). */}
                            {sampleAmount(c.currency, c.reserve / 100)}
                          </TD>
                          <TD label="Avisos">{c.activeReminders ? <Badge tone="warning">{c.activeReminders}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                          <TD variant="actions">
                            <div className="flex flex-wrap justify-end gap-1.5 max-md:w-full max-md:[&>*]:flex-1">
                              <ButtonLink variant="outline" size="sm" href={`#/clientes/${c.id}`}>
                                <Eye /> Ver
                              </ButtonLink>
                              <ButtonLink variant="outline" size="sm" href={`#/clientes/${c.id}/informe`}>
                                <FileText /> Informe
                              </ButtonLink>
                              <Button variant="ghost-destructive" size="sm" onClick={() => stop(c.id, c.name)}>
                                Dejar de atender
                              </Button>
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableCard>
              )}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

type ClientTab = 'resumen' | 'movimientos' | 'facturas' | 'factura' | 'informe';
const TABS: { tab: ClientTab; label: string; path: string }[] = [
  { tab: 'resumen', label: 'Resumen', path: '' },
  { tab: 'movimientos', label: 'Movimientos', path: '/movimientos' },
  { tab: 'facturas', label: 'Facturas', path: '/facturas' },
  { tab: 'informe', label: 'Informe', path: '/informe' },
];

/** Modo cliente: franja «Solo lectura», pestañas y la pantalla del cliente. */
export function ClientView({ id, tab, query, invoiceId }: { id: string; tab: ClientTab; query: URLSearchParams; invoiceId?: string }) {
  const { data, error, loading } = useLoad(() => api<{ client: ClientProfile }>(`/clients/${id}`), [id]);
  usePlanRefreshOn(error);

  if (loading && !data) return <Loading />;
  if (isPlanError(error)) return <ContadorLocked />;
  if (error || !data) {
    return (
      <Card className="max-w-xl">
        <CardTitle>No puedes ver este cliente</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">{error ? errorMessage(error) : ''}</p>
        <ButtonLink variant="outline" className="mt-4" href="#/clientes">
          <ArrowLeft /> Volver a Clientes
        </ButtonLink>
      </Card>
    );
  }

  const client = data.client;
  // Los importes del cliente con su moneda (App vuelve a la tuya al salir del modo cliente).
  setCurrency(client.currency);
  const active = tab === 'factura' ? 'facturas' : tab;
  const page =
    tab === 'resumen' ? (
      <DashboardPage query={query} />
    ) : tab === 'movimientos' ? (
      <MovementsPage query={query} />
    ) : tab === 'facturas' ? (
      <InvoicesPage query={query} />
    ) : tab === 'factura' ? (
      <InvoiceDetailPage id={invoiceId!} />
    ) : (
      <ReportPage query={query} />
    );

  return (
    <>
      <div
        role="status"
        className="no-print sticky top-3 z-30 mb-3 flex items-center justify-between gap-3 rounded-[18px] border border-violet/45 bg-card/95 px-4 py-3 shadow-sm backdrop-blur"
        data-testid="client-banner"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <i className="size-2 shrink-0 rounded-full bg-violet" aria-hidden="true" />
          <span className="min-w-0">
            Estás viendo a <b className="font-semibold">{client.name}</b>
            {client.nif ? ` (NIT ${client.nif})` : ''} · <b className="font-semibold">Solo lectura</b>
          </span>
        </span>
        <ButtonLink variant="outline" size="sm" href="#/clientes">
          <ArrowLeft /> Salir
        </ButtonLink>
      </div>
      <nav aria-label={`Secciones de ${client.name}`} className="no-print mb-5 grid grid-cols-4 gap-[2px] rounded-xl bg-muted p-[3px]">
        {TABS.map((t) => (
          <a
            key={t.tab}
            href={`#/clientes/${client.id}${t.path}`}
            aria-current={active === t.tab ? 'page' : undefined}
            className={cn(
              'flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-[9px] px-1 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-10 sm:px-3 sm:text-sm',
              active === t.tab ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </a>
        ))}
      </nav>
      <ClientScopeProvider client={client}>{page}</ClientScopeProvider>
    </>
  );
}
