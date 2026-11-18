import * as React from 'react';
import { cn } from '@/lib/utils';

/** Tarjeta con la misma forma que las del AnalyticsBento (28 px, borde translúcido). */
function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn('relative min-w-0 rounded-[28px] border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" className={cn('text-[17px] font-semibold tracking-[-0.02em]', className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('mt-1 text-[13px] tracking-[-0.01em] text-muted-foreground', className)} {...props} />;
}

/** Panel interior gris (como el fondo de los gráficos del bento). */
function Inset({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-[18px] border border-border bg-muted/40 dark:bg-muted/30', className)} {...props} />;
}

export { Card, CardTitle, CardDescription, Inset };
