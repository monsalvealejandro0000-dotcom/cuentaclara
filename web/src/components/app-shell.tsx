import * as React from 'react';
import { ArrowLeftRight, CalendarDays, FileText, LayoutDashboard, LogOut, Monitor, Moon, Settings, Sun, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { useTheme, type ThemePref } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { LegalFooter } from '@/components/legal';

export const NAV = [
  { path: '/dashboard', label: 'Dashboard', short: 'Inicio', icon: LayoutDashboard },
  { path: '/movimientos', label: 'Movimientos', short: 'Movimientos', icon: ArrowLeftRight },
  { path: '/facturas', label: 'Facturas', short: 'Facturas', icon: FileText },
  { path: '/calendario', label: 'Calendario', short: 'Calendario', icon: CalendarDays },
  { path: '/configuracion', label: 'Configuración', short: 'Ajustes', icon: Settings },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="fill-foreground" />
        <path d="M8 21c3-1 4-8 8-8s4 5 8-4" fill="none" stroke="var(--positive)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="24" cy="9" r="2.4" fill="var(--positive)" />
      </svg>
      CuentaClara
    </span>
  );
}

export function ThemeSwitch({ className }: { className?: string }) {
  const [pref, setPref] = useTheme();
  const opts: { value: ThemePref; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'system', label: 'Sistema', icon: Monitor },
    { value: 'dark', label: 'Oscuro', icon: Moon },
  ];
  return (
    <div role="radiogroup" aria-label="Tema" className={cn('grid grid-cols-3 gap-[2px] rounded-xl bg-muted p-[3px]', className)}>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => setPref(o.value)}
          className={cn(
            'flex h-8 cursor-pointer items-center justify-center rounded-[9px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-11 [&_svg]:size-4',
            pref === o.value ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <o.icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** Plan Contador (fase 10): «Clientes» en la barra lateral, debajo de Dashboard. En el celular va en una tarjeta del Dashboard. */
const CLIENTS_NAV = { path: '/clientes', label: 'Clientes', short: 'Clientes', icon: Users };

export function AppShell({ path, children }: { path: string; children: React.ReactNode }) {
  const { user, plan, signOut } = useAuthed();
  const isActive = (p: string) => path === p || path.startsWith(`${p}/`);
  const sideNav = plan.tier === 'contador' ? [NAV[0], CLIENTS_NAV, ...NAV.slice(1)] : NAV;
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* aunque falle la red, se cierra la sesión en el navegador */
    }
    signOut();
  };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[256px_minmax(0,1fr)] print:block">
      <aside className="no-print hidden md:block">
        <div className="sticky top-3 m-3 flex h-[calc(100dvh-1.5rem)] flex-col rounded-[28px] border border-border bg-card p-3 shadow-sm">
          <a href="#/dashboard" className="rounded-2xl px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </a>
          <nav aria-label="Principal" className="mt-4 grid gap-1">
            {sideNav.map((n) => (
              <a
                key={n.path}
                href={`#${n.path}`}
                aria-current={isActive(n.path) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]',
                  isActive(n.path) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <n.icon aria-hidden="true" />
                {n.label}
                {isActive(n.path) && <i className="ml-auto size-1.5 rounded-full bg-positive" aria-hidden="true" />}
              </a>
            ))}
          </nav>
          <div className="mt-auto grid gap-3 px-1 pb-1">
            <ThemeSwitch />
            <div className="flex items-center gap-2 rounded-2xl border border-border p-2 pl-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main id="main" className="mx-auto w-full max-w-[1240px] min-w-0 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-12 md:pt-7">
        {children}
        <LegalFooter className="mt-12 border-t border-border pt-5" pqr />
      </main>

      <nav
        aria-label="Principal"
        className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-1 border-t border-border bg-card/90 px-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-lg md:hidden"
      >
        {NAV.map((n) => (
          <a
            key={n.path}
            href={`#${n.path}`}
            aria-current={isActive(n.path) ? 'page' : undefined}
            className={cn(
              'flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[10.5px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5',
              isActive(n.path) ? 'bg-muted text-foreground' : 'text-muted-foreground',
            )}
          >
            <n.icon aria-hidden="true" />
            <span className="max-w-full truncate">{n.short}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
