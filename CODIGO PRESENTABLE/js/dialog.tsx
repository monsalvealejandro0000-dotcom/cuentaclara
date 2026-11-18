import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Foco inicial: con ratón/teclado, el primer campo; en pantallas táctiles, el propio diálogo
 * (no abre el teclado de golpe); sin campos, el elemento marcado con data-autofocus («Cancelar»).
 */
function focusInitial(dialog: HTMLDialogElement) {
  const field = dialog.querySelector<HTMLElement>(
    '[data-dialog-body] :is(input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, textarea)',
  );
  if (!field) {
    (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog).focus();
  } else if (window.matchMedia('(pointer: fine)').matches) {
    field.focus();
  } else {
    dialog.focus();
  }
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  size?: 'sm' | 'md';
  children: React.ReactNode;
};

/** Diálogo modal sobre <dialog> nativo (trampa de foco, Escape y capa superior incluidos). */
function Dialog({ open, onClose, title, description, size = 'md', children }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  React.useLayoutEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) {
      d.showModal();
      focusInitial(d);
    }
  }, [open]);
  if (!open) return null;
  return createPortal(
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[28px] border border-border bg-card p-0 text-card-foreground shadow-2xl outline-none',
        size === 'sm' ? 'w-[min(440px,calc(100%-2rem))]' : 'w-[min(600px,calc(100%-2rem))] max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0',
      )}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur sm:px-6">
        <div>
          <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em]">
            {title}
          </h2>
          {description && <div className="mt-1 text-[13px] text-muted-foreground">{description}</div>}
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-1 rounded-full" aria-label="Cerrar" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div data-dialog-body className="px-5 py-5 sm:px-6">
        {children}
      </div>
    </dialog>,
    document.body,
  );
}

/** Barra de acciones de un diálogo (fija abajo en móvil). */
function DialogActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-2 flex flex-wrap justify-end gap-2 max-sm:sticky max-sm:bottom-0 max-sm:-mx-5 max-sm:-mb-5 max-sm:border-t max-sm:border-border max-sm:bg-card max-sm:px-5 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] max-sm:pt-3 max-sm:[&>*]:flex-1',
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogActions };
