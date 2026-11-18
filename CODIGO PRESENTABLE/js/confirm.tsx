import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';

type ConfirmOptions = { title: string; message: string; confirmLabel?: string; danger?: boolean };
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn>(async () => false);
export const useConfirm = () => React.useContext(ConfirmContext);

/** Diálogo de confirmación por promesa: `if (await confirm({...}))`. El foco empieza en «Cancelar». */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = React.useCallback<ConfirmFn>((o) => new Promise((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onClose={() => close(false)} title={state?.title ?? ''} size="sm">
        <p className="text-sm text-muted-foreground">{state?.message}</p>
        <DialogActions className="mt-5">
          <Button variant="outline" data-autofocus onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={state?.danger === false ? 'default' : 'destructive'} onClick={() => close(true)}>
            {state?.confirmLabel ?? 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
