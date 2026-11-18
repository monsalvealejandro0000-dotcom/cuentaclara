import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-[-0.01em]',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        positive: 'border-positive/30 bg-positive/12 text-foreground',
        negative: 'border-negative/30 bg-negative/12 text-foreground',
        warning: 'border-warning/40 bg-warning/15 text-foreground',
        brand: 'border-brand/30 bg-brand/10 text-foreground',
        violet: 'border-violet/30 bg-violet/12 text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const dotColor: Record<string, string> = {
  neutral: 'bg-muted-foreground/60',
  positive: 'bg-positive',
  negative: 'bg-negative',
  warning: 'bg-warning',
  brand: 'bg-brand',
  violet: 'bg-violet',
};

/** El color va en el punto; el texto siempre en tinta normal (legible en claro y oscuro). */
function Badge({ className, tone = 'neutral', dot = true, children, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <i className={cn('size-1.5 rounded-full', dotColor[tone ?? 'neutral'])} aria-hidden="true" />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
