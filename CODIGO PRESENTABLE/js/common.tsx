import * as React from 'react';
import { ChevronLeft, ChevronRight, CircleAlert, Loader2 } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ApiError, errorMessage } from '@/lib/api';
import { addMonths, capitalize, currentMonth, monthLabel } from '@/lib/format';

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1">{actions}</div>}
    </header>
  );
}

export function MonthNav({ month, base }: { month: string; base: string }) {
  const sep = base.includes('?') ? '&' : '?';
  return (
    <div className="mb-5 flex items-center gap-2" role="group" aria-label="Cambiar de mes">
      <ButtonLink variant="outline" size="icon" className="rounded-full" href={`#${base}${sep}mes=${addMonths(month, -1)}`} aria-label="Mes anterior">
        <ChevronLeft />
      </ButtonLink>
      <h2 className="min-w-[150px] text-center text-[17px] font-semibold tracking-[-0.02em] max-sm:flex-1" aria-live="polite">
        {capitalize(monthLabel(month))}
      </h2>
      <ButtonLink variant="outline" size="icon" className="rounded-full" href={`#${base}${sep}mes=${addMonths(month, 1)}`} aria-label="Mes siguiente">
        <ChevronRight />
      </ButtonLink>
      {month !== currentMonth() && (
        <ButtonLink variant="ghost" size="sm" href={`#${base}`}>
          Hoy
        </ButtonLink>
      )}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div role="alert" className="rounded-[28px] border border-negative/30 bg-card p-6 sm:p-8">
      <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
        <CircleAlert className="size-5 text-negative-ink" aria-hidden="true" />
        {notFound ? 'No encontrado' : 'No se pudieron cargar los datos'}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{errorMessage(error)}</p>
      <div className="mt-5">
        {notFound ? (
          <Button variant="outline" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.hash = '#/dashboard'))}>
            Volver
          </Button>
        ) : (
          onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Reintentar
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{children}</p>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function Banner({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-warning/40 bg-warning/12 px-4 py-3 text-sm font-medium">
      <span className="flex items-center gap-2">
        <i className="size-2 rounded-full bg-warning" aria-hidden="true" />
        {children}
      </span>
      {action}
    </div>
  );
}

/** Campo de formulario: etiqueta, control, ayuda y error accesibles. */
export function Field({ id, label, error, hint, className, children }: { id: string; label: React.ReactNode; error?: string; hint?: React.ReactNode; className?: string; children: React.ReactElement<any> }) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-semibold text-negative-ink">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-center gap-2 rounded-xl border border-negative/35 bg-negative/10 px-3 py-2.5 text-sm font-medium">
      <CircleAlert className="size-4 shrink-0 text-negative-ink" aria-hidden="true" />
      {message}
    </div>
  );
}

/** Lleva el foco al primer campo con error tras un envío fallido. */
export function useFocusFirstError(formRef: React.RefObject<HTMLFormElement | null>, errors: Record<string, string | undefined>) {
  React.useEffect(() => {
    if (Object.values(errors).some(Boolean)) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors, formRef]);
}

/** Fila etiqueta / valor (desgloses). */
export function Row({ label, value, strong, className }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 border-t border-border py-2.5 text-sm first:border-t-0', className)}>
      <span className={cn('tracking-[-0.01em]', strong ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</span>
      <span className={cn('tabular whitespace-nowrap text-right', strong && 'font-semibold')}>{value}</span>
    </div>
  );
}
