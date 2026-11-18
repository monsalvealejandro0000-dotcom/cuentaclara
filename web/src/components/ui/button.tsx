import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium tracking-[-0.01em] outline-none transition-[color,background-color,border-color,box-shadow,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/88',
        outline: 'border border-border bg-card shadow-xs hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        'ghost-destructive': 'text-negative-ink hover:bg-negative/10',
        income: 'border border-positive/45 bg-positive/12 text-foreground hover:bg-positive/22',
        expense: 'border border-negative/45 bg-negative/12 text-foreground hover:bg-negative/22',
        link: 'h-auto px-0 text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 max-md:h-11',
        sm: 'h-8 rounded-lg px-3 text-[13px] max-md:h-11 max-md:px-3.5',
        lg: 'h-11 px-6',
        icon: 'size-10 max-md:size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/** Enlace con aspecto de botón (navegación por hash). */
function ButtonLink({ className, variant, size, ...props }: React.ComponentProps<'a'> & VariantProps<typeof buttonVariants>) {
  return <a data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, ButtonLink, buttonVariants };
