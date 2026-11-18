import { api, ApiError } from './api';
import { useLoad } from './use-load';
import { addDays } from './format';
import type { PaidTier, Payment, PaymentConfig, Plan } from './types';

/* Cobro manual de los planes (fase 11, docs/11-cobro-manual.md). */

export const TIER_NAME: Record<PaidTier, string> = { pro: 'Pro', contador: 'Contador' };
export const DAYS_PER_MONTH = 30;

/** Datos para pagar (data/cobro.json). `config` es null si el cobro no está configurado. */
export function usePaymentConfig() {
  const { data, loading } = useLoad(
    () =>
      api<PaymentConfig>('/payments/config').catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_PAYMENT_CONFIG') return null;
        throw err;
      }),
    [],
  );
  return { config: data ?? null, loading };
}

/** Avisos de pago del usuario y el pendiente, si hay. */
export function usePayments() {
  return useLoad(() => api<{ payments: Payment[]; pending: Payment | null }>('/payments'), []);
}

/** Mismo cálculo que el servidor: hasta cuándo dura el plan si se aprueba ahora este pago. null = sin fecha de fin. */
export function untilAfterPayment(plan: Plan, tier: PaidTier, months: number) {
  const days = months * DAYS_PER_MONTH;
  if (plan.tier === tier) return plan.until ? addDays(plan.until, days) : null;
  return addDays(plan.today, days - 1);
}
