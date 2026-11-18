import * as React from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

type Toast = { id: number; message: string; type: 'ok' | 'error' };
type ToastFn = (message: string, type?: 'ok' | 'error') => void;

const ToastContext = React.createContext<ToastFn>(() => {});
export const useToast = () => React.useContext(ToastContext);

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const toast = React.useCallback<ToastFn>((message, type = 'ok') => {
    const id = ++seq;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 5000 : 3000);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex max-w-[380px] items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-medium shadow-lg backdrop-blur-md',
              t.type === 'error' ? 'border-negative/40 bg-card/95 text-foreground' : 'border-border bg-card/95 text-foreground',
            )}
          >
            {t.type === 'error' ? <CircleAlert className="size-4 shrink-0 text-negative-ink" /> : <CircleCheck className="size-4 shrink-0 text-positive-ink" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
