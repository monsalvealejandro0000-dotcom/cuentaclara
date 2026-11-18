import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabla que en móvil se convierte en tarjetas: cada celda muestra su etiqueta (data-label).
 * Un único marcado para escritorio y móvil.
 */
function TableCard({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative overflow-x-auto rounded-[28px] border border-border bg-card shadow-sm max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none',
        className,
      )}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-sm max-md:block', className)} {...props} />;
}

function THead({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('max-md:hidden', className)} {...props} />;
}

function TBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('max-md:block max-md:space-y-3', className)} {...props} />;
}

function TR({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-t border-border transition-colors first:border-t-0 hover:bg-muted/40 max-md:block max-md:rounded-[22px] max-md:border max-md:bg-card max-md:p-4 max-md:shadow-sm max-md:first:border-t',
        className,
      )}
      {...props}
    />
  );
}

function TH({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('whitespace-nowrap px-4 pb-2.5 pt-4 text-left text-xs font-medium tracking-[-0.01em] text-muted-foreground first:pl-6 last:pr-6', className)}
      {...props}
    />
  );
}

type TDProps = React.ComponentProps<'td'> & { label?: string; variant?: 'default' | 'main' | 'actions' };

function TD({ className, label, variant = 'default', ...props }: TDProps) {
  return (
    <td
      data-label={label}
      className={cn(
        'px-4 py-3 align-top first:pl-6 last:pr-6',
        'max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-1 max-md:text-right max-md:first:pl-0 max-md:last:pr-0',
        'max-md:before:shrink-0 max-md:before:text-left max-md:before:text-xs max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]',
        variant === 'main' && 'max-md:block max-md:pb-2 max-md:text-left max-md:before:content-none',
        variant === 'actions' && 'max-md:mt-2 max-md:justify-end max-md:border-t max-md:border-border max-md:pt-3 max-md:before:content-none',
        className,
      )}
      {...props}
    />
  );
}

export { TableCard, Table, THead, TBody, TR, TH, TD };
