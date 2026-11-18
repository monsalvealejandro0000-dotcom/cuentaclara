import type { ReactNode } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useAuthed } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common';
import { CONTADOR_FEATURES, FeatureList, FREE_FEATURES, PAYMENT_NOTE, planStatus, PRICES, useStartTrial } from '@/components/plan';
import { cn } from '@/lib/utils';

/** Planes (#/planes): qué incluye cada uno. Precios propuestos; la app no cobra en línea. */
export function PlansPage() {
  const { plan } = useAuthed();
  const startTrial = useStartTrial();
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
            pro ? (
              yourPlan
            ) : contador ? (
              <Badge className="justify-self-start">Incluido en tu plan Contador</Badge>
            ) : plan.trialAvailable ? (
              <Button className="w-full" onClick={() => startTrial(true)}>
                <Sparkles /> Probar 30 días gratis
              </Button>
            ) : (
              <div className="grid gap-1.5">
                <Badge className="justify-self-start">Prueba usada</Badge>
                <p className="text-xs text-muted-foreground">{PAYMENT_NOTE}</p>
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
            contador ? (
              yourPlan
            ) : (
              <div className="grid gap-1.5">
                <Badge className="justify-self-start">Lo activa el administrador</Badge>
                <p className="text-xs text-muted-foreground">Para contadores que atienden a varios independientes.</p>
              </div>
            )
          }
        >
          <FeatureList items={['Todo lo de Pro', ...CONTADOR_FEATURES]} />
        </PlanColumn>
      </div>
      <p className="mt-5 max-w-5xl text-sm text-muted-foreground">
        Precios propuestos, en pesos colombianos. {PAYMENT_NOTE} Bajar de plan nunca borra tus datos.
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
