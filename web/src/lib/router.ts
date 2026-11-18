import * as React from 'react';

/** Router mínimo por hash (#/movimientos?mes=2026-11): recargar o «atrás» mantienen la pantalla. */
export function useRoute() {
  const [hash, setHash] = React.useState(() => window.location.hash);
  React.useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const raw = hash.replace(/^#/, '') || '/dashboard';
  const [path, qs = ''] = raw.split('?');
  return { path, query: new URLSearchParams(qs), key: hash };
}

export function navigate(path: string) {
  const target = `#${path}`;
  if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = target;
}

/** Cambia la URL sin volver a pintar la pantalla (para filtros). */
export function replaceUrl(path: string) {
  window.history.replaceState(null, '', `#${path}`);
}
