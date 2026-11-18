import * as React from 'react';
import { api, ApiError, errorMessage, setUnauthorizedHandler } from './api';
import { navigate } from './router';
import { setCurrency } from './format';
import { useToast } from '@/components/ui/toast';
import type { Meta, Plan, Settings, User } from './types';

type Session = {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  user: User | null;
  settings: Settings | null;
  meta: Meta | null;
  plan: Plan | null;
};

type SessionApi = Session & {
  signIn: (user: User) => Promise<void>;
  signOut: () => void;
  setSettings: (s: Settings) => void;
  setPlan: (p: Plan) => void;
  /** Vuelve a pedir el plan al servidor (p. ej. si una función Pro respondió 403). */
  refreshPlan: () => Promise<void>;
  retry: () => void;
};

const SessionContext = React.createContext<SessionApi | null>(null);

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSession fuera de SessionProvider');
  return ctx;
}

/** Usuario con sesión iniciada (solo en pantallas protegidas). */
export function useAuthed() {
  const s = useSession();
  return { ...s, user: s.user!, settings: s.settings!, meta: s.meta!, plan: s.plan! };
}

async function loadUserData() {
  const [s, meta, p] = await Promise.all([api<{ settings: Settings }>('/settings'), api<Meta>('/meta'), api<{ plan: Plan }>('/plan')]);
  setCurrency(s.settings.currency);
  return { settings: s.settings, meta, plan: p.plan };
}

const SIGNED_OUT = { user: null, settings: null, meta: null, plan: null };

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [session, setSession] = React.useState<Session>({ status: 'loading', ...SIGNED_OUT });
  const userRef = React.useRef<User | null>(null);
  userRef.current = session.user;

  const boot = React.useCallback(async () => {
    setSession((s) => ({ ...s, status: 'loading' }));
    try {
      const me = await api<{ user: User }>('/auth/me');
      const data = await loadUserData();
      setSession({ status: 'ready', user: me.user, ...data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSession({ status: 'ready', ...SIGNED_OUT });
      else setSession({ status: 'error', error: errorMessage(err), ...SIGNED_OUT });
    }
  }, []);

  React.useEffect(() => {
    boot();
  }, [boot]);

  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!userRef.current) return;
      userRef.current = null;
      setSession((s) => ({ ...s, user: null, settings: null, plan: null }));
      toast('Tu sesión ha caducado. Vuelve a iniciar sesión.', 'error');
      navigate('/login');
    });
  }, [toast]);

  const value = React.useMemo<SessionApi>(
    () => ({
      ...session,
      signIn: async (user) => {
        const data = await loadUserData();
        setSession({ status: 'ready', user, ...data });
        navigate('/dashboard');
      },
      signOut: () => {
        userRef.current = null;
        setCurrency('COP');
        setSession((s) => ({ ...s, user: null, settings: null, plan: null }));
        navigate('/login');
      },
      setSettings: (settings) => {
        setCurrency(settings.currency);
        setSession((s) => ({ ...s, settings }));
      },
      setPlan: (plan) => setSession((s) => ({ ...s, plan })),
      refreshPlan: async () => {
        try {
          const { plan } = await api<{ plan: Plan }>('/plan');
          setSession((s) => (s.user ? { ...s, plan } : s));
        } catch {
          /* se mantiene el plan conocido; el servidor sigue decidiendo en cada petición */
        }
      },
      retry: boot,
    }),
    [session, boot],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
