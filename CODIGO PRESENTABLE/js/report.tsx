import * as React from 'react';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { navigate, replaceUrl } from '@/lib/router';
import { capitalize, currentMonth, downloadFile, formatDate, isMonth, money, monthLabel, MONTHS, signedMoney } from '@/lib/format';
import { marginalText, monthOfYear, RENTA_METHOD_LABELS, vatPeriodLabel } from '@/lib/tax';
import type { Report } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { SegmentedRadio } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/common';
import { ProLocked } from '@/components/plan';
import { usePlanRefreshOn } from '@/components/reminders';
import { toCsv } from '@/pages/movements';
import { useScope } from '@/lib/scope';
import { cn } from '@/lib/utils';

type Period = { kind: 'mes' | 'anio'; mes: string; anio: string };

function readPeriod(query: URLSearchParams): Period {
  const anio = /^\d{4}$/.test(query.get('anio') || '') ? query.get('anio')! : '';
  const mes = isMonth(query.get('mes')) ? query.get('mes')! : currentMonth();
  return { kind: anio ? 'anio' : 'mes', mes, anio: anio || mes.slice(0, 4) };
}

/** Informe para el contador (Pro): `#/informe?mes=AAAA-MM` o `#/informe?anio=AAAA`. */
export function ReportPage({ query }: { query: URLSearchParams }) {
  const [p, setP] = React.useState(() => readPeriod(query));
  const key = p.kind === 'anio' ? p.anio : p.mes;
  // Modo cliente (plan Contador): el informe del cliente.
  const scope = useScope();
  const apiPath = `${scope.apiBase}${p.kind === 'anio' ? `/report?year=${p.anio}` : `/report?month=${p.mes}`}`;

  React.useEffect(() => {
    replaceUrl(`${scope.path('informe')}?${p.kind === 'anio' ? `anio=${p.anio}` : `mes=${p.mes}`}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const { data, error, loading, reload } = useLoad(() => api<Report>(apiPath), [apiPath]);
  usePlanRefreshOn(error);
  // En el modo cliente, un 403 significa que el contador perdió su plan: se muestra como error, no como oferta de Pro.
  const locked = !scope.readOnly && error instanceof ApiError && error.code === 'PLAN_REQUIRED';
  const back = () => (scope.readOnly ? navigate(scope.path('dashboard')) : window.history.length > 1 ? window.history.back() : navigate('/dashboard'));

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Informe para el contador"
          description="Todo lo que tu contador necesita del periodo, listo para imprimir o guardar en PDF."
          actions={
            <Button variant="ghost" onClick={back}>
              <ArrowLeft /> Volver
            </Button>
          }
        />
      </div>

      {locked ? (
        <ProLocked feature="informe" onUnlocked={reload} />
      ) : (
        <>
          <div className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-[28px] border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="grid gap-1.5 max-sm:w-full">
              <span className="text-[13px] font-medium leading-none tracking-[-0.01em] text-foreground/90" aria-hidden="true">
                Periodo
              </span>
              <SegmentedRadio
                name="report-period"
                label="Periodo"
                className="sm:w-[220px]"
                value={p.kind}
                onChange={(kind) => setP({ ...p, kind })}
                options={[
                  { value: 'mes', label: 'Un mes' },
                  { value: 'anio', label: 'Año completo' },
                ]}
              />
            </div>
            {p.kind === 'mes' ? (
              <div className="grid gap-1.5 max-sm:w-full">
                <Label htmlFor="r-mes">Mes</Label>
                <Input id="r-mes" type="month" min="2000-01" max="2100-12" className="sm:w-[210px]" value={p.mes} onChange={(e) => isMonth(e.target.value) && setP({ ...p, mes: e.target.value })} />
              </div>
            ) : (
              <div className="grid gap-1.5 max-sm:w-full">
                <Label htmlFor="r-anio">Año</Label>
                <Input
                  id="r-anio"
                  type="number"
                  inputMode="numeric"
                  min={2000}
                  max={2100}
                  className="sm:w-[120px]"
                  value={p.anio}
                  onChange={(e) => /^\d{4}$/.test(e.target.value) && setP({ ...p, anio: e.target.value })}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1 sm:ml-auto">
              <Button variant="outline" disabled={!data?.movements.length} onClick={() => data && downloadFile(`movimientos-${key}.csv`, toCsv(data.movements), 'text/csv;charset=utf-8')}>
                <Download /> Descargar CSV
              </Button>
              <Button disabled={!data?.movements.length} onClick={() => window.print()}>
                <Printer /> Imprimir / Guardar PDF
              </Button>
            </div>
          </div>

          {loading && !data ? (
            <Loading />
          ) : error && !data ? (
            <ErrorState error={error} onRetry={reload} />
          ) : data && !data.movements.length && !data.invoices.length ? (
            <EmptyState title="No hay movimientos en este periodo">Elige otro mes o año, o registra tus ingresos y gastos.</EmptyState>
          ) : data ? (
            <ReportDocument r={data} />
          ) : null}
        </>
      )}
    </>
  );
}

function ReportDocument({ r }: { r: Report }) {
  const t = r.totals;
  const renta = r.renta;
  const month = r.period.kind === 'month' ? Number(r.period.month!.slice(5)) : 12;
  const title = r.period.kind === 'month' ? capitalize(monthLabel(r.period.month!)) : `Año ${r.period.year}`;
  const vp = r.vatPeriods;

  return (
    <article aria-label={`Informe para el contador · ${title}`} className="print-area max-w-[960px] rounded-[28px] border border-border bg-white p-6 text-neutral-950 shadow-sm sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-neutral-950 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Informe para el contador</p>
          <h2 className="mt-1 text-[26px] font-semibold tracking-[-0.03em]">{title}</h2>
          <p className="tabular text-sm text-neutral-600">
            Del {formatDate(r.period.from)} al {formatDate(r.period.to)}
          </p>
        </div>
        <div className="grid gap-0.5 text-sm sm:text-right">
          <p className="font-semibold">{r.issuer.name}</p>
          <p>{r.issuer.nif ? `NIT o C.C.: ${r.issuer.nif}` : <span className="font-semibold text-orange-700">NIT o cédula sin indicar</span>}</p>
          <p>{r.issuer.vatResponsible ? `Responsable de IVA (declaración ${r.issuer.vatPeriod})` : 'No responsable de IVA'}</p>
          <p className="text-neutral-500">Generado el {formatDate(r.generatedOn)} con CuentaClara</p>
        </div>
      </header>

      {r.issuer.currency !== 'COP' && (
        <p className="mt-5 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          Importes en {r.issuer.currency}. La renta se calcula con la UVT, en pesos colombianos: con otra moneda su estimación no es válida.
        </p>
      )}

      <Section title="Resumen">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Ingresos" value={money(t.income)} />
          <Stat label="Gastos" value={money(t.expenses)} />
          <Stat label="Beneficio" value={money(t.profit)} />
          <Stat label="Retenciones que te practicaron" value={money(t.withholdings)} />
        </div>
      </Section>

      <Section title="IVA">
        {r.issuer.vatResponsible ? (
          <>
            {r.period.kind === 'month' && (
              <Lines
                className="mb-4"
                rows={[
                  ['IVA generado (cobrado) en el mes', money(t.vatOutput)],
                  ['IVA descontable del mes', `−${money(t.vatInput)}`],
                  [t.vatNet < 0 ? 'Saldo a favor del mes' : 'IVA del mes', money(Math.abs(t.vatNet)), true],
                ]}
              />
            )}
            <DocTable
              caption={r.period.kind === 'month' ? 'Periodo de IVA al que pertenece el mes' : 'IVA por periodo'}
              head={['Periodo', 'Generado', 'Descontable', 'Saldo', 'Se declara en']}
              numeric={[1, 2, 3]}
              rows={vp.map((p) => [
                vatPeriodLabel(p),
                money(p.vatOutput),
                `−${money(p.vatInput)}`,
                p.vatNet < 0 ? `${money(-p.vatNet)} a favor` : money(p.vatNet),
                capitalize(monthOfYear(p.filingMonth)),
              ])}
            />
            <p className="mt-2 text-xs text-neutral-500">Formulario 300. El día exacto depende del último dígito del NIT.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-600">No eres responsable de IVA: no lo cobras y el IVA de tus compras forma parte del costo.</p>
            {t.vatOutput > 0 && <Lines className="mt-3" rows={[['IVA que cobraste (debes pagarlo)', money(t.vatOutput), true]]} />}
          </>
        )}
      </Section>

      <Section title={`Renta ${renta.year} ${month === 12 ? '(año completo)' : `hasta ${MONTHS[month - 1]}`} · estimación`}>
        <Lines
          rows={[
            ['Ingresos', money(renta.income)],
            ...(renta.method === 'costos'
              ? [['Costos y gastos deducibles', `−${money(renta.deductibleExpenses)}`] as Line]
              : [
                  ...(renta.socialSecurity > 0 ? [['Aportes a salud y pensión', `−${money(renta.socialSecurity)}`] as Line] : []),
                  ['Renta exenta (25 %)', `−${money(renta.exempt)}`] as Line,
                ]),
            ['Base gravable', money(renta.base)],
            [`Impuesto · ${marginalText(renta.marginalRate)}`, money(renta.tax)],
            ['Retenciones que te practicaron', `−${money(renta.withholdings)}`],
            [renta.balance < 0 ? 'Saldo a favor estimado' : 'Renta a pagar estimada', money(Math.abs(renta.balance)), true],
          ]}
        />
        <p className="mt-2 text-xs text-neutral-500">
          Camino más favorable: {RENTA_METHOD_LABELS[renta.method]}. Tabla del art. 241 del Estatuto Tributario con la UVT de {renta.uvt.year}
          {!renta.uvt.official && ' (aún no publicada: se usa la última conocida)'}. Formulario 210, se declara de agosto a octubre de {renta.year + 1}.
        </p>
      </Section>

      <Section title="Gastos por categoría">
        {r.expenseCategories.length ? (
          <DocTable
            head={['Categoría', 'Movimientos', 'Total']}
            numeric={[1, 2]}
            rows={r.expenseCategories.map((c) => [c.name, String(c.count), money(c.total)])}
            foot={['Total', String(r.expenseCategories.reduce((n, c) => n + c.count, 0)), money(t.expenses)]}
          />
        ) : (
          <p className="text-sm text-neutral-600">Sin gastos en este periodo.</p>
        )}
      </Section>

      <Section title="Facturas y cuentas de cobro emitidas">
        {r.invoices.length ? (
          <DocTable
            head={['Número', 'Fecha', 'Cliente', 'Total', 'Estado']}
            numeric={[3]}
            rows={r.invoices.map((i) => [
              i.number,
              formatDate(i.issue_date),
              i.client_name,
              money(i.amounts.total),
              i.status === 'cobrada' ? `Cobrada${i.paid_date ? ` el ${formatDate(i.paid_date)}` : ''}` : 'Pendiente',
            ])}
          />
        ) : (
          <p className="text-sm text-neutral-600">No emitiste facturas ni cuentas de cobro en este periodo.</p>
        )}
      </Section>

      <Section title={`Movimientos (${r.movements.length})`}>
        <DocTable
          head={['Fecha', 'Concepto', 'Categoría', 'Base', 'IVA', 'Retención', 'Total']}
          numeric={[3, 4, 5, 6]}
          rows={r.movements.map((m) => [
            formatDate(m.date),
            `${m.type === 'ingreso' ? 'Ingreso' : 'Gasto'} · ${m.concept}${m.type === 'gasto' && !m.deductible ? ' · no deducible' : ''}`,
            m.category,
            money(m.amounts.base),
            money(m.amounts.vat),
            m.amounts.irpf ? `−${money(m.amounts.irpf)}` : '—',
            signedMoney(m.amounts.total, m.type),
          ])}
        />
      </Section>

      <p className="mt-8 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        Estimación hecha con tus movimientos. No es una declaración: revísala con tu contador. No incluye ICA, anticipo de renta, deducciones por
        dependientes ni otras rentas exentas.
      </p>
    </article>
  );
}

type Line = [string, string, boolean?];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-3.5 py-3 break-inside-avoid">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="tabular mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Lines({ rows, className }: { rows: Line[]; className?: string }) {
  return (
    <dl className={cn('grid max-w-[520px] text-sm', className)}>
      {rows.map(([label, value, strong]) => (
        <div key={label} className={cn('flex justify-between gap-4 border-t border-neutral-200 py-2 first:border-t-0', strong && 'font-semibold')}>
          <dt className={strong ? '' : 'text-neutral-600'}>{label}</dt>
          <dd className="tabular whitespace-nowrap text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tabla del documento (en papel no se parte una fila entre dos páginas). */
function DocTable({ head, rows, foot, numeric = [], caption }: { head: string[]; rows: string[][]; foot?: string[]; numeric?: number[]; caption?: string }) {
  const align = (i: number) => (numeric.includes(i) ? 'text-right tabular whitespace-nowrap' : 'text-left');
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="mb-2 text-left text-xs text-neutral-500">{caption}</caption>}
        <thead>
          <tr className="border-b border-neutral-300 text-xs uppercase tracking-[0.05em] text-neutral-500">
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn('py-2 pr-3 font-medium last:pr-0', align(i))}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="break-inside-avoid border-b border-neutral-200">
              {row.map((cell, i) => (
                <td key={i} className={cn('py-2 pr-3 align-top last:pr-0', align(i))}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-neutral-950 font-semibold">
              {foot.map((cell, i) => (
                <td key={i} className={cn('py-2 pr-3 last:pr-0', align(i))}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
