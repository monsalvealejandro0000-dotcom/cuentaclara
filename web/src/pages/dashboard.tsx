import * as React from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { useLoad } from '@/lib/use-load';
import { navigate } from '@/lib/router';
import { capitalize, changePct, currencyDisplay, currentMonth, formatDate, isMonth, money, moneyWhole, MONTHS, MONTHS_SHORT, monthLabel, signedMoney } from '@/lib/format';
import { marginalText, monthOfYear, pesos, RENTA_METHOD_LABELS, vatPeriodLabel } from '@/lib/tax';
import type { Analytics, Summary } from '@/lib/types';
import { AnalyticsBento, type AnalyticsBentoProps } from '@/components/ui/analytics-bento';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Banner, EmptyState, ErrorState, Loading, MonthNav, PageHeader, Row } from '@/components/common';
import { MovementDialog, type MovementDialogState } from '@/components/movement-dialog';
import { PlanEndingBanner, ReportButton } from '@/components/plan';
import { ClientDeclarations, DashboardReminders } from '@/components/reminders';
import { ClientsShortcut } from '@/components/accountant';
import { useScope } from '@/lib/scope';

/** Grupos del treemap de gastos, con los colores del bento. */
const EXPENSE_GROUPS: { id: string; name: string; color: string; ink?: 'dark' | 'light'; categories: string[] }[] = [
  { id: 'estructura', name: 'Estructura', color: '#8B3DFF', ink: 'light', categories: ['Seguridad social (salud y pensión)', 'Arriendo', 'Servicios públicos', 'Contador y asesoría'] },
  { id: 'herramientas', name: 'Herramientas', color: '#7CFF5B', ink: 'dark', categories: ['Software y suscripciones', 'Material y equipos'] },
  { id: 'crecimiento', name: 'Crecimiento', color: '#FFB800', ink: 'dark', categories: ['Marketing', 'Formación'] },
  { id: 'movilidad', name: 'Movilidad', color: '#FF5A1F', ink: 'dark', categories: ['Transporte y viáticos'] },
  { id: 'otros', name: 'Otros', color: 'color-mix(in oklab, var(--color-muted-foreground) 45%, var(--color-muted))', categories: ['Otros gastos'] },
];
const groupOf = (category: string) => EXPENSE_GROUPS.find((g) => g.categories.includes(category))?.id ?? 'otros';
/** Centésimas → unidades de la moneda (el bento trabaja en unidades). */
const toEuros = (cents: number) => cents / 100;

/** Traduce los datos reales del servidor al formato del AnalyticsBento. */
function bentoProps(summary: Summary, a: Analytics): Omit<AnalyticsBentoProps, 'className'> {
  const s = summary.monthSummary;
  const m = Number(a.month.slice(5));
  const [pMonth, pQuarter, pYear] = a.periods;
  const hasPrevYear = a.seasonality.length > 1;
  const prevText = { month: 'el mes pasado', quarter: 'el trimestre anterior', year: `en ${a.year - 1} (mismo periodo)` };

  return {
    revenue: {
      label: 'Ingresos del mes',
      value: toEuros(s.income),
      delta: changePct(s.income, a.revenue[10].income),
      note: (
        <>
          Beneficio <span className="text-foreground/80">{money(s.profit)}</span>
        </>
      ),
      caption: 'Últimos 12 meses',
      series: a.revenue.map((p) => ({ label: capitalize(monthLabel(p.month)), value: toEuros(p.income) })),
    },
    sessions: {
      label: `Beneficio ${a.year} hasta ${MONTHS[m - 1]}`,
      value: toEuros(pYear.profit),
      delta: changePct(pYear.profit, pYear.previous.profit),
      note: 'Ingresos arriba, gastos abajo, por mes',
      money: true,
      axis: MONTHS_SHORT.map(capitalize),
      desktop: [a.monthly.current.map((p) => toEuros(p.income)), ...(hasPrevYear ? [a.monthly.previous.map((p) => toEuros(p.income))] : [])],
      mobile: [a.monthly.current.map((p) => toEuros(p.expenses)), ...(hasPrevYear ? [a.monthly.previous.map((p) => toEuros(p.expenses))] : [])],
      labels: { desktop: 'Ingresos', mobile: 'Gastos', prior: String(a.year - 1), current: String(a.year) },
    },
    categories: {
      title: 'Gastos por categoría',
      inverse: true,
      groups: EXPENSE_GROUPS.map(({ id, name, color, ink }) => ({ id, name, color, ink })),
      periods: a.periods.map((p) => ({
        label: p.key === 'month' ? capitalize(MONTHS[m - 1]) : p.key === 'quarter' ? `T${Math.ceil(m / 3)}` : `Año ${a.year}`,
        total: toEuros(p.expenses),
        delta: changePct(p.expenses, p.previous.expenses),
        compare: `vs ${moneyWhole(toEuros(p.previous.expenses))} ${prevText[p.key]}`,
      })),
      items: a.expenseCategories.map((c) => ({ name: c.name, group: groupOf(c.name), values: c.values.map(toEuros) })),
      table: {
        columns: ['', capitalize(MONTHS[m - 1]), `T${Math.ceil(m / 3)}`, `Año ${a.year}`],
        rows: [
          { label: 'Ingresos', values: [pMonth, pQuarter, pYear].map((p) => money(p.income)) },
          { label: 'Gastos', values: [pMonth, pQuarter, pYear].map((p) => money(p.expenses)) },
          { label: 'Beneficio', values: [pMonth, pQuarter, pYear].map((p) => money(p.profit)) },
        ],
      },
    },
    seasonality: {
      title: 'Estacionalidad de ingresos',
      axis: MONTHS_SHORT.map(capitalize),
      years: a.seasonality.map((y, i) => {
        const best = y.values.reduce((bi, v, j) => (v > y.values[bi] ? j : bi), 0);
        const isCurrent = i === 0;
        const months = isCurrent ? m : 12;
        const total = isCurrent ? pYear.income : y.total;
        return {
          label: String(y.year),
          values: y.values.map(toEuros),
          stats: [
            {
              label: 'Media mensual',
              value: toEuros(total / months),
              delta: isCurrent && hasPrevYear ? changePct(pYear.income, pYear.previous.income) : '—',
              note: `${months} meses`,
            },
            {
              label: isCurrent ? `Hasta ${MONTHS[m - 1]}` : 'Total del año',
              value: toEuros(total),
              delta: isCurrent && hasPrevYear ? changePct(pYear.income, pYear.previous.income) : '—',
              note: `${y.incomeCount} ingresos en el año`,
            },
          ],
          rows: [
            { label: 'Mejor mes', value: y.values[best] > 0 ? `${capitalize(MONTHS[best])} · ${money(y.values[best])}` : '—' },
            { label: `Beneficio ${y.year}`, value: money(y.profit) },
            { label: 'Reserva de impuestos del año', value: money(y.totalReserve) },
          ],
        };
      }),
    },
  };
}

/** Saludo con el cargo y el primer nombre: "alejandro monsalve" + "CEO" → "CEO Alejandro". El cargo va tal cual. */
export function greetingName(name: string, title = '') {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return [title.trim(), first.charAt(0).toUpperCase() + first.slice(1)].filter(Boolean).join(' ');
}

export function DashboardPage({ query }: { query: URLSearchParams }) {
  const { user, settings } = useAuthed();
  // Modo cliente (plan Contador): los datos del cliente, en solo lectura.
  const scope = useScope();
  const month = isMonth(query.get('mes')) ? query.get('mes')! : currentMonth();
  const { data, error, loading, reload } = useLoad(
    () => Promise.all([api<Summary>(`${scope.apiBase}/summary?month=${month}`), api<Analytics>(`${scope.apiBase}/analytics?month=${month}`)]),
    [month, scope.apiBase],
  );
  const [dialog, setDialog] = React.useState<MovementDialogState | null>(null);
  const add = (type: 'ingreso' | 'gasto') => setDialog({ type, date: month === currentMonth() ? undefined : `${month}-01` });
  const report = <ReportButton href={`${scope.path('informe')}?mes=${month}`} />;

  return (
    <>
      {scope.readOnly ? (
        <PageHeader title="Resumen" description={`Así va la actividad de ${scope.client!.name}.`} actions={report} />
      ) : (
        <PageHeader
          title="Dashboard"
          description={
            <>
              <strong className="mt-1 block text-[22px] font-bold leading-tight tracking-[-0.03em] text-foreground dark:text-white sm:text-[26px]" data-testid="greeting-name">
                Hola {greetingName(user.name, settings.title)}
              </strong>
              <span className="mt-0.5 block">Así va tu actividad.</span>
            </>
          }
          actions={
            <>
              <Button variant="income" onClick={() => add('ingreso')}>
                <Plus /> Ingreso
              </Button>
              <Button variant="expense" onClick={() => add('gasto')}>
                <Plus /> Gasto
              </Button>
              {report}
            </>
          }
        />
      )}
      {scope.readOnly ? (
        <ClientDeclarations />
      ) : (
        <>
          <PlanEndingBanner />
          <ClientsShortcut />
          <DashboardReminders />
        </>
      )}
      <MonthNav month={month} base={scope.path('dashboard')} />
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data ? (
        <DashboardContent summary={data[0]} analytics={data[1]} onAdd={add} />
      ) : null}
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

function DashboardContent({ summary, analytics, onAdd }: { summary: Summary; analytics: Analytics; onAdd: (t: 'ingreso' | 'gasto') => void }) {
  const { meta } = useAuthed();
  const scope = useScope();
  const s = summary.monthSummary;
  const r = summary.renta;
  const vp = summary.currentVatPeriod;
  const tax = summary.tax;
  const month = Number(summary.month.slice(5));
  const props = React.useMemo(() => bentoProps(summary, analytics), [summary, analytics]);

  return (
    <>
      {!summary.settingsComplete &&
        (scope.readOnly ? (
          <Banner>Este cliente aún no completó sus datos tributarios (nombre y NIT o cédula).</Banner>
        ) : (
          <Banner action={<ButtonLink variant="outline" size="sm" href="#/configuracion">Ir a Configuración</ButtonLink>}>
            Completa tus datos tributarios (nombre y NIT o cédula) para que aparezcan en tus facturas.
          </Banner>
        ))}
      {tax.currency !== 'COP' && summary.hasMovements && (
        <Banner action={scope.readOnly ? undefined : <ButtonLink variant="outline" size="sm" href="#/configuracion">Cambiar moneda</ButtonLink>}>
          {scope.readOnly ? 'Su' : 'Tu'} moneda es {tax.currency}: la renta se calcula con la UVT, en pesos colombianos, así que su estimación no es válida.
        </Banner>
      )}

      {!summary.hasMovements && scope.readOnly ? (
        <EmptyState title="Este cliente aún no tiene movimientos" />
      ) : !summary.hasMovements ? (
        <EmptyState
          title="Aún no tienes movimientos"
          actions={
            <>
              <Button variant="income" onClick={() => onAdd('ingreso')}>
                <Plus /> Añadir ingreso
              </Button>
              <Button variant="expense" onClick={() => onAdd('gasto')}>
                <Plus /> Añadir gasto
              </Button>
              <ButtonLink variant="outline" href="#/facturas">
                Emitir factura
              </ButtonLink>
            </>
          }
        >
          Registra tu primer ingreso o gasto (o emite una factura) y aquí verás tu beneficio, cuánto apartar para impuestos y tus gráficos.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {/* Impuestos: lo primero que hay que saber */}
          <div className="grid grid-cols-12 gap-4">
            <Card className="col-span-12 lg:col-span-5">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <i className="size-2 rounded-full bg-warning" aria-hidden="true" /> A reservar para impuestos este mes
              </div>
              <div className="tabular mt-2.5 text-[38px] font-medium leading-none sm:text-[44px]">{money(s.totalReserve)}</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Inset className="px-3.5 py-3">
                  <div className="text-xs text-muted-foreground">IVA</div>
                  <div className="tabular mt-1 text-lg font-medium">{tax.vatResponsible || s.vatReserve ? money(s.vatReserve) : 'No aplica'}</div>
                </Inset>
                <Inset className="px-3.5 py-3">
                  <div className="text-xs text-muted-foreground">Renta</div>
                  <div className="tabular mt-1 text-lg font-medium">{money(s.rentaReserve)}</div>
                </Inset>
              </div>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Disponible tras impuestos</span>
                <span className="tabular font-semibold">{money(s.availableAfterTaxes)}</span>
              </div>
            </Card>

            <Card className="col-span-12 sm:col-span-7 lg:col-span-4">
              <CardTitle>Tus declaraciones</CardTitle>
              <CardDescription>El día exacto depende del último dígito de tu NIT.</CardDescription>
              <div className="mt-3">
                <Row
                  label={
                    <>
                      IVA {vatPeriodLabel(vp)}
                      <span className="block text-xs">
                        {tax.vatResponsible
                          ? `Formulario 300 · en ${monthOfYear(vp.filingMonth)}`
                          : vp.vatNet > 0
                            ? 'Cobraste IVA sin ser responsable'
                            : 'No eres responsable de IVA'}
                      </span>
                    </>
                  }
                  value={!tax.vatResponsible && !vp.vatNet ? '—' : vp.vatNet < 0 ? `${money(-vp.vatNet)} a favor` : money(vp.vatNet)}
                />
                <Row
                  label={
                    <>
                      Renta {summary.year} hasta {MONTHS[month - 1]}
                      <span className="block text-xs">Formulario 210 · ago–oct de {summary.year + 1}</span>
                    </>
                  }
                  value={r.balance < 0 ? `${money(-r.balance)} a favor` : money(r.balance)}
                />
                <Row label="Total estimado" value={money(Math.max(0, vp.vatNet) + r.reserve)} strong />
              </div>
            </Card>

            <Card className="col-span-12 flex flex-col sm:col-span-5 lg:col-span-3">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <i className="size-2 rounded-full bg-brand" aria-hidden="true" /> Pendiente de cobro
              </div>
              <div className="tabular mt-2.5 text-[30px] font-medium leading-none">{money(summary.pendingInvoices.total_cents)}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                {summary.pendingInvoices.count} {summary.pendingInvoices.count === 1 ? 'factura sin cobrar' : 'facturas sin cobrar'}
              </p>
              <ButtonLink variant="outline" size="sm" className="mt-auto self-start max-sm:mt-4" href={`#${scope.path('facturas')}?estado=pendiente&anio=todos`}>
                Ver pendientes <ArrowUpRight />
              </ButtonLink>
            </Card>
          </div>

          {/* El componente AnalyticsBento con datos reales */}
          <AnalyticsBento
            {...props}
            {...currencyDisplay()}
            formatMoney={moneyWhole}
            fractionDigits={0}
            labels={{ revenue: 'Ingresos', share: 'Peso', sales: 'Ingresos', year: 'Año', empty: 'Sin gastos en este periodo' }}
            colors={{ desktop: ['#22D3EE', '#12b863'], mobile: ['#FFB800', '#FF5A1F'] }}
            fontFamily="var(--font-sans)"
            monoFamily="var(--font-mono)"
            credit={false}
          />

          <div className="grid grid-cols-12 gap-4">
            <Card className="col-span-12 lg:col-span-7">
              <CardTitle>¿Cómo se calcula la reserva?</CardTitle>
              <CardDescription>
                Estimación orientativa con tus movimientos: el IVA, de {monthLabel(summary.month)}; la renta, de lo que llevas de {summary.year}.
              </CardDescription>
              <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">IVA del mes</div>
                  {tax.vatResponsible ? (
                    <>
                      <Row label="IVA generado (cobrado)" value={money(s.vatOutput)} />
                      <Row label="IVA descontable" value={`−${money(s.vatInput)}`} />
                      <Row label="IVA a reservar" value={money(s.vatReserve)} strong />
                    </>
                  ) : (
                    <>
                      <p className="py-2.5 text-sm text-muted-foreground">No eres responsable de IVA: no lo cobras y el IVA de tus compras es parte del costo.</p>
                      {s.vatOutput > 0 && <Row label="IVA que cobraste (debes pagarlo)" value={money(s.vatReserve)} strong />}
                    </>
                  )}
                </div>
                <div className="max-sm:mt-4">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Renta {summary.year} hasta {MONTHS[month - 1]}</div>
                  <Row label="Ingresos" value={money(r.income)} />
                  {r.method === 'costos' ? (
                    <Row label="Costos y gastos deducibles" value={`−${money(r.deductibleExpenses)}`} />
                  ) : (
                    <>
                      {r.socialSecurity > 0 && <Row label="Aportes a salud y pensión" value={`−${money(r.socialSecurity)}`} />}
                      <Row label={`Renta exenta (${meta.tax.exemptRate} %)`} value={`−${money(r.exempt)}`} />
                    </>
                  )}
                  <Row label="Base gravable" value={money(r.base)} />
                  <Row label={<>Impuesto · {marginalText(r.marginalRate)}</>} value={money(r.tax)} />
                  <Row label="Retenciones que te practicaron" value={`−${money(r.withholdings)}`} />
                  <Row label={r.balance < 0 ? 'Saldo a favor estimado' : 'Renta a pagar estimada'} value={money(Math.abs(r.balance))} strong />
                  <p className="pt-1 text-xs text-muted-foreground">
                    Camino más favorable: {RENTA_METHOD_LABELS[r.method]}. Este mes reservas {money(s.rentaReserve)}.
                  </p>
                </div>
              </div>
              <Inset className="mt-4 px-4 py-1">
                <Row label="Saldo de caja del mes" value={money(s.cashBalance)} />
                <Row label="Disponible tras impuestos" value={money(s.availableAfterTaxes)} strong />
              </Inset>
              {tax.vatResponsible && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">IVA por periodo</caption>
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Periodo de IVA</th>
                        <th className="pb-2 text-right font-medium">A pagar</th>
                        <th className="pb-2 text-right font-medium">Se declara en</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.vatPeriods.map((p) => (
                        <tr key={p.period} className={p.period === vp.period ? 'border-t border-border bg-muted/50 font-semibold' : 'border-t border-border'}>
                          <td className="py-2.5">{vatPeriodLabel(p)}</td>
                          <td className="tabular py-2.5 text-right">{p.vatNet < 0 ? `${money(-p.vatNet)} a favor` : money(p.vatNet)}</td>
                          <td className="py-2.5 text-right">{capitalize(monthOfYear(p.filingMonth))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Reglas de Colombia con la UVT de {tax.uvt.year} ({pesos(tax.uvt.pesos)})
                {!tax.uvt.official && ` (la de ${summary.year} aún no está publicada)`}. No incluye ICA, anticipo de renta, deducciones por dependientes ni
                otras rentas exentas: revísalo con tu contador.{' '}
                {!scope.readOnly && (
                  <a className="text-brand underline-offset-4 hover:underline" href="#/configuracion">
                    Cambiar tus datos de IVA y retención
                  </a>
                )}
              </p>
            </Card>

            <Card className="col-span-12 lg:col-span-5">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Últimos movimientos</CardTitle>
                <a className="text-sm text-brand underline-offset-4 hover:underline" href={`#${scope.path('movimientos')}`}>
                  Ver todos
                </a>
              </div>
              <ul className="mt-3">
                {summary.recent.map((mv) => (
                  <li key={mv.id} className="border-t border-border first:border-t-0">
                    <button
                      type="button"
                      onClick={() => navigate(`${scope.path('movimientos')}?mes=${mv.date.slice(0, 7)}`)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <i className={`size-2 shrink-0 rounded-full ${mv.type === 'ingreso' ? 'bg-positive' : 'bg-negative'}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{mv.concept}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(mv.date)} · {mv.category}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-sm font-medium">{signedMoney(mv.amounts.total, mv.type)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
