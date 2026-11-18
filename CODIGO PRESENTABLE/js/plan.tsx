import * as React from 'react';
import { Check, FileText, Sparkles } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { navigate } from '@/lib/router';
import { MONTHS } from '@/lib/format';
import type { Plan } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/confirm';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Planes (fase 9, docs/09-planes.md)                                 */
/*  La app no cobra: Pro se activa con la prueba gratis o lo activa     */
/*  el administrador. El servidor decide; aquí solo se muestra.         */
/* ------------------------------------------------------------------ */

/** Precios propuestos, en pesos colombianos. Solo se muestran: no hay cobro en línea. */
export const PRICES = { pro: '$14.900', contador: '$59.900' };

export const FREE_FEATURES = [
  'Ingresos y gastos',
  'Reserva del mes para impuestos',
  'IVA y renta estimados',
  'Cuentas de cobro y facturas para imprimir',
  'Calendario',
  'Analítica',
  'Exportar CSV',
];
export const PRO_FEATURES = ['Avisos de declaración', 'Informe para el contador'];
/** Plan Contador (fase 10): todo lo de Pro, más esto. */
export const CONTADOR_FEATURES = ['Panel de clientes', 'Clientes ilimitados, en solo lectura', 'Informe de cada cliente'];

/** Pro o Contador: tiene las funciones de Pro. */
export const hasPro = (plan: Plan) => plan.tier === 'pro' || plan.tier === 'contador';

export const PAYMENT_NOTE = 'El pago en línea aún no está disponible: llegará cuando CuentaClara esté publicada en internet.';

type ProFeature = 'informe' | 'avisos';
const FEATURE_TEXT: Record<ProFeature, { title: string; text: string }> = {
  informe: {
    title: 'Informe para el contador',
    text: 'Prepara en un clic el resumen del mes o del año para tu contador, listo para imprimir o guardar en PDF.',
  },
  avisos: {
    title: 'Avisos de declaración',
    text: 'Te avisa cuando se acerca tu declaración de IVA o de renta y te deja anotar el día exacto en el calendario.',
  },
};

/** "2026-12-16" → "16 de diciembre de 2026". */
export const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} de ${MONTHS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
/** `n`: días que quedan contando hoy (el último día vale 1). */
const daysText = (n: number) => (n <= 1 ? 'hoy es el último día' : `quedan ${n} días`);

export function ProBadge({ className }: { className?: string }) {
  return (
    <Badge tone="violet" className={className}>
      Pro
    </Badge>
  );
}

/** Activa la prueba gratis de Pro. Devuelve true si se activó. */
export function useStartTrial() {
  const { setPlan, refreshPlan } = useAuthed();
  const toast = useToast();
  const confirm = useConfirm();
  return async (askFirst: boolean) => {
    if (askFirst) {
      const ok = await confirm({
        title: 'Probar Pro 30 días gratis',
        message:
          'Tendrás los avisos de declaración y el informe para el contador durante 30 días. No se pide ningún pago y al terminar vuelves a Gratis sin perder nada. La prueba solo se puede usar una vez.',
        confirmLabel: 'Empezar la prueba',
        danger: false,
      });
      if (!ok) return false;
    }
    try {
      const { plan } = await api<{ plan: Plan }>('/plan/trial', { method: 'POST' });
      setPlan(plan);
      toast(`Tienes Pro hasta el ${dayLabel(plan.until!)}`);
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error');
      await refreshPlan();
      return false;
    }
  };
}

/** Qué es la función Pro y cómo conseguirla (en el diálogo o dentro de una página bloqueada). */
function ProOffer({ feature, onUnlocked, onClose }: { feature: ProFeature; onUnlocked?: () => void; onClose?: () => void }) {
  const { plan } = useAuthed();
  const startTrial = useStartTrial();
  const [busy, setBusy] = React.useState(false);
  const f = FEATURE_TEXT[feature];
  // En el diálogo, la barra de acciones del diálogo; dentro de una página, una fila normal.
  const Actions = onClose ? DialogActions : InlineActions;
  return (
    <>
      <p className="text-sm">
        <b className="font-semibold">{f.title}.</b> {f.text}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {plan.trialAvailable
          ? 'Puedes probar Pro gratis durante 30 días, una vez por cuenta. No se pide ningún pago y al terminar vuelves a Gratis sin perder nada.'
          : `${plan.trialEndedOn ? `Tu prueba gratis terminó el ${dayLabel(plan.trialEndedOn)}. ` : 'Ya usaste la prueba gratis. '}${PAYMENT_NOTE}`}
      </p>
      <Actions className="mt-5">
        {onClose && (
          <Button variant="ghost" data-autofocus onClick={onClose}>
            Ahora no
          </Button>
        )}
        <ButtonLink variant="outline" href="#/planes" onClick={onClose}>
          Ver planes
        </ButtonLink>
        {plan.trialAvailable && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await startTrial(false);
              setBusy(false);
              if (ok) {
                onClose?.();
                onUnlocked?.();
              }
            }}
          >
            <Sparkles /> {busy ? 'Activando…' : 'Probar Pro 30 días gratis'}
          </Button>
        )}
      </Actions>
    </>
  );
}

function InlineActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap gap-2 max-sm:[&>*]:flex-1', className)} {...props} />;
}

/** Página o tarjeta de una función Pro vista por un usuario Gratis. */
export function ProLocked({ feature, onUnlocked }: { feature: ProFeature; onUnlocked?: () => void }) {
  return (
    <Card className="max-w-2xl">
      <CardTitle className="flex items-center gap-2">
        Esto es del plan Pro <ProBadge />
      </CardTitle>
      <div className="mt-3">
        <ProOffer feature={feature} onUnlocked={onUnlocked} />
      </div>
    </Card>
  );
}

const ProGateContext = React.createContext<(feature: ProFeature, onUnlocked?: () => void) => void>(() => {});

/** Diálogo «Esto es del plan Pro», disponible en todas las pantallas con sesión. */
export function ProGateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ feature: ProFeature; onUnlocked?: () => void } | null>(null);
  const open = React.useCallback((feature: ProFeature, onUnlocked?: () => void) => setState({ feature, onUnlocked }), []);
  return (
    <ProGateContext.Provider value={open}>
      {children}
      {state && (
        <Dialog open onClose={() => setState(null)} title="Esto es del plan Pro" size="sm">
          <ProOffer feature={state.feature} onUnlocked={state.onUnlocked} onClose={() => setState(null)} />
        </Dialog>
      )}
    </ProGateContext.Provider>
  );
}

/** `run('informe', accion)`: con Pro ejecuta la acción; sin Pro abre el diálogo (y la ejecuta si activa la prueba). */
export function useProAction() {
  const { plan } = useAuthed();
  const open = React.useContext(ProGateContext);
  return (feature: ProFeature, action: () => void) => (hasPro(plan) ? action() : open(feature, action));
}

/** Botón «Informe para el contador» (Dashboard y Movimientos). */
export function ReportButton({ href, size, className }: { href: string; size?: 'sm' | 'default'; className?: string }) {
  const { plan } = useAuthed();
  const run = useProAction();
  return (
    <Button variant="outline" size={size} className={className} onClick={() => run('informe', () => navigate(href))}>
      <FileText /> Informe para el contador
      {!hasPro(plan) && <ProBadge />}
    </Button>
  );
}

export function planName(plan: Plan) {
  if (plan.tier === 'contador') return 'Contador';
  return plan.tier === 'gratis' ? 'Gratis' : plan.source === 'prueba' ? 'Pro de prueba' : 'Pro';
}

/** Frase con el estado del plan (Configuración y Planes). */
export function planStatus(plan: Plan) {
  if (hasPro(plan)) {
    if (plan.source === 'prueba') return `Termina el ${dayLabel(plan.until!)} (${daysText(plan.daysLeft ?? 0)}).`;
    return plan.until ? `Activado por el administrador hasta el ${dayLabel(plan.until)}.` : 'Activado por el administrador, sin fecha de fin.';
  }
  if (plan.trialAvailable) return 'Puedes probar Pro gratis durante 30 días.';
  if (plan.trialEndedOn) return `Tu prueba de Pro terminó el ${dayLabel(plan.trialEndedOn)}. No se borró ningún dato.`;
  return 'Ya usaste la prueba gratis de Pro.';
}

export function FeatureList({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn('grid gap-2 text-sm', className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-positive-ink" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Configuración → «Tu plan». */
export function PlanCard() {
  const { plan } = useAuthed();
  const startTrial = useStartTrial();
  const pro = hasPro(plan);
  const contador = plan.tier === 'contador';
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-[18px] text-muted-foreground" aria-hidden="true" /> Tu plan
          </CardTitle>
          <CardDescription>Qué incluye tu cuenta de CuentaClara.</CardDescription>
        </div>
        {contador ? <Badge tone="violet">Contador</Badge> : pro ? <ProBadge /> : <Badge>Gratis</Badge>}
      </div>
      <Inset className="mt-4 px-4 py-3.5" aria-live="polite">
        <div className="text-lg font-semibold tracking-[-0.02em]" data-testid="plan-name">
          {planName(plan)}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{planStatus(plan)}</p>
      </Inset>
      <FeatureList className="mt-4 sm:grid-cols-2" items={[...(contador ? CONTADOR_FEATURES : []), ...(pro ? PRO_FEATURES : []), ...FREE_FEATURES]} />
      <p className="mt-4 text-xs text-muted-foreground">{PAYMENT_NOTE}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2 max-sm:[&>*]:flex-1">
        <ButtonLink variant="outline" href="#/planes">
          Ver planes
        </ButtonLink>
        {plan.trialAvailable && (
          <Button onClick={() => startTrial(true)}>
            <Sparkles /> Probar Pro 30 días gratis
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Aviso en el Dashboard cuando a la prueba le quedan 3 días o menos. */
export function TrialEndingBanner() {
  const { plan } = useAuthed();
  if (plan.tier !== 'pro' || plan.source !== 'prueba' || plan.daysLeft === null || plan.daysLeft > 3) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-violet/35 bg-violet/10 px-4 py-3 text-sm font-medium">
      <span className="flex items-center gap-2">
        <i className="size-2 shrink-0 rounded-full bg-violet" aria-hidden="true" />
        Tu prueba de Pro termina el {dayLabel(plan.until!)} ({daysText(plan.daysLeft)}). Después vuelves a Gratis sin perder ningún dato.
      </span>
      <ButtonLink variant="outline" size="sm" href="#/planes">
        Ver planes
      </ButtonLink>
    </div>
  );
}
