import type { ReactNode } from 'react';
import { ArrowLeft, ShoppingCart, Sparkles } from 'lucide-react';
import { useAuthed } from '@/lib/session';
import { usePaymentConfig, usePayments } from '@/lib/payments';
import type { PaidTier } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common';
import { CONTADOR_FEATURES, FeatureList, FREE_FEATURES, PAYMENT_NOTE, planStatus, PRICES, useStartTrial } from '@/components/plan';
import { cn } from '@/lib/utils';

/**
 * Planes (#/planes): qué incluye cada uno.
 * Con data/cobro.json (fase 11) aparecen «Comprar» y «Renovar»; sin él, como antes: la app no cobra.
 */
export function PlansPage() {
  const { plan } = useAuthed();
  const startTrial = useStartTrial();
  const { config } = usePaymentConfig();
  const { data: payments } = usePayments();
  const pending = payments?.pending ?? null;
  const pro = plan.tier === 'pro';
  const contador = plan.tier === 'contador';
  const yourPlan = (
    <div className="grid gap-1.5">
      <Badge tone="positive" className="justify-self-start">
        Tu plan
      </Badge>
      <p className="text-xs text-muted-foreground">{planStatus(plan)}</p>
    </div>
  );

  /** «Comprar» / «Renovar», o el aviso si ya hay un pago en revisión. Nada si el cobro no está configurado. */
  const buy = (tier: PaidTier, label: 'Comprar' | 'Renovar') => {
    if (!config) return null;
    if (pending) {
      return pending.tier === tier ? (
        <div className="grid gap-1.5">
          <Badge tone="warning" className="justify-self-start">
            Pago en revisión
          </Badge>
          <a className="text-xs text-brand underline-offset-4 hover:underline" href="#/configuracion">
            Ver estado
          </a>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Tienes un pago en revisión.</p>
      )
    }
    return (
      <ButtonLink className="w-full" variant={label === 'Renovar' ? 'outline' : 'default'} href={`#/planes/pagar?plan=${tier}`}>
        <ShoppingCart /> {label}
      </ButtonLink>
    );
  };

  return (
    <>
      <PageHeader
        title="Planes"
        description="Compara lo que incluye cada plan."
        actions={
          <ButtonLink variant="ghost" href="#/configuracion">
            <ArrowLeft /> Volver a Configuración
          </ButtonLink>
        }
      />
      <div className="grid max-w-5xl gap-4 md:grid-cols-3">
        <PlanColumn name="Gratis" price="$0" current={plan.tier === 'gratis'} footer={plan.tier === 'gratis' ? <Badge tone="positive">Tu plan</Badge> : null}>
          <FeatureList items={FREE_FEATURES} />
        </PlanColumn>

        <PlanColumn
          name="Pro"
          price={PRICES.pro}
          perMonth
          current={pro}
          footer={
            contador ? (
              <Badge className="justify-self-start">Incluido en tu plan Contador</Badge>
            ) : (
              <div className="grid gap-3">
                {pro && yourPlan}
                {/* Renovar solo tiene sentido si el plan tiene fecha de fin. */}
                {pro ? plan.until && buy('pro', 'Renovar') : buy('pro', 'Comprar')}
                {!pro && plan.trialAvailable && (
                  <Button className="w-full" variant={config ? 'outline' : 'default'} onClick={() => startTrial(true)}>
                    <Sparkles /> Probar 30 días gratis
                  </Button>
                )}
                {!pro && !plan.trialAvailable && !config && (
                  <div className="grid gap-1.5">
                    <Badge className="justify-self-start">Prueba usada</Badge>
                    <p className="text-xs text-muted-foreground">{PAYMENT_NOTE}</p>
                  </div>
                )}
              </div>
            )
          }
        >
          <FeatureList
            items={[
              'Todo lo de Gratis',
              'Avisos de declaración',
              'Informe para el contador',
              <>
                Facturación electrónica <Badge tone="warning">Próximamente</Badge>
              </>,
            ]}
          />
        </PlanColumn>

        <PlanColumn
          name="Contador"
          price={PRICES.contador}
          perMonth
          current={contador}
          footer={
            <div className="grid gap-3">
              {contador && yourPlan}
              {contador ? plan.until && buy('contador', 'Renovar') : buy('contador', 'Comprar')}
              {!contador && !config && (
                <div className="grid gap-1.5">
                  <Badge className="justify-self-start">Lo activa el administrador</Badge>
                  <p className="text-xs text-muted-foreground">Para contadores que atienden a varios independientes.</p>
                </div>
              )}
            </div>
          }
        >
          <FeatureList items={['Todo lo de Pro', ...CONTADOR_FEATURES]} />
        </PlanColumn>
      </div>
      <p className="mt-5 max-w-5xl text-sm text-muted-foreground">
        {config
          ? 'Precios finales en pesos colombianos, con los impuestos que apliquen. Pagas por fuera de la app y el plan se activa cuando se confirma tu pago. Sin renovaciones automáticas.'
          : `Precios propuestos, en pesos colombianos. ${PAYMENT_NOTE}`}{' '}
        Bajar de plan nunca borra tus datos. Tienes 5 días hábiles para retractarte y recibir el 100 % (
        <a className="font-medium text-brand underline-offset-4 hover:underline" href="#/legal/reembolsos">
          Política de reembolsos
        </a>
        ).
      </p>
    </>
  );
}

function PlanColumn({ name, price, perMonth, current, footer, children }: { name: ReactNode; price: string; perMonth?: boolean; current?: boolean; footer: ReactNode; children: ReactNode }) {
  return (
    <Card className={cn('flex flex-col', current && 'ring-2 ring-positive/60')} aria-current={current ? 'true' : undefined}>
      <CardTitle className="flex items-center gap-2">{name}</CardTitle>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="tabular text-[26px] font-medium leading-none tracking-[-0.03em]">{price}</span>
        {perMonth && <span className="text-sm text-muted-foreground">al mes</span>}
      </p>
      <div className="mt-5 flex-1">{children}</div>
      <div className="mt-6 border-t border-border pt-4">{footer}</div>
    </Card>
  );
}
