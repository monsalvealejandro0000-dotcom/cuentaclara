import * as React from 'react';
import { ApiError } from './api';

/** Carga datos del servidor. Nunca muestra datos de ejemplo: o hay datos reales, o carga, o error. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = React.useState<{ data: T | null; error: ApiError | Error | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const seq = React.useRef(0);
  const run = React.useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (id !== seq.current) return;
      if (err instanceof ApiError && err.status === 401) return; // la sesión ya redirige al login
      setState((s) => ({ ...s, error: err as Error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  React.useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: () => run(true) };
}
