import * as React from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'cuentaclara-theme';
const EVENT = 'cuentaclara-theme-change';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

/** Tema claro/oscuro: sigue al sistema salvo que el usuario elija uno (se recuerda en este navegador). */
export function useTheme() {
  const [pref, setPref] = React.useState<ThemePref>(read);
  // Varios selectores de tema en pantalla a la vez se mantienen sincronizados.
  React.useEffect(() => {
    const on = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  React.useEffect(() => {
    apply(pref);
    if (pref !== 'system') return;
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => apply('system');
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [pref]);
  const set = React.useCallback((p: ThemePref) => {
    try {
      if (p === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* sin almacenamiento: solo para esta visita */
    }
    window.dispatchEvent(new CustomEvent<ThemePref>(EVENT, { detail: p }));
  }, []);
  return [pref, set] as const;
}

// Aplicar antes del primer pintado para evitar un parpadeo de tema.
apply(read());
