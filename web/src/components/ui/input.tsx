import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full min-w-0 rounded-xl border border-input bg-card px-3 shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/15';

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(fieldBase, 'h-10 py-2 max-md:h-11', className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldBase, 'min-h-16 resize-y py-2.5', className)} {...props} />;
}

/** <select> nativo con estilo shadcn (accesible y sin dependencias). */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select data-slot="select" className={cn(fieldBase, 'h-10 cursor-pointer appearance-none py-2 pr-9 max-md:h-11')} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label data-slot="label" className={cn('text-[13px] font-medium leading-none tracking-[-0.01em] text-foreground/90', className)} {...props} />;
}

export { Input, Textarea, NativeSelect, Label };
