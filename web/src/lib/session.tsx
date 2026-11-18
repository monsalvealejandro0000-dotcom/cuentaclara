import * as React from 'react';
import { api, ApiError, errorMessage, setConsentRequiredHandler, setUnauthorizedHandler } from './api';
import { navigate } from './router';
import { setCurrency } from './format';
import { useToast } from '@/components/ui/toast';
import type { LegalDocKey, LegalInfo, Meta, Plan, Settings, User } from './types';

type Session = {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  user: User | null;
  settings: Settings | null;
  meta: Meta | null;
  plan: Plan | null;
  /** Documentos legales vigentes y textos de las casillas (se cargan siempre, también sin sesión). */
  legal: LegalInfo | null;
  /** Documentos cuya versión vigente aún no ha aceptado (fase 12): mientras haya alguno, solo se ve la pantalla de aceptación. */
  consentPending: LegalDocKey[];
};

type SessionApi = Session & {
  signIn: (user: User, consentPending?: LegalDocKey[]) => Promise<void>;
  /** Cierra la sesión en el navegador y va a `to` (por defecto, Iniciar sesión; null = no cambia de pantalla). */
  signOut: (to?: string | null) => void;
  /** Fase 13: datos de la cuenta que cambian sin volver a entrar (correo confirmado, verificación en dos pasos). */
  setUser: (user: User) => void;
  /** Vuelve a pedir la cuenta al servidor (p. ej. al volver a la pestaña tras confirmar el correo en el celular). */
  refreshUser: () => Promise<void>;
  /** Tras aceptar las versiones vigentes: carga los datos y entra a la app. */
  consentAccepted: () => Promise<void>;
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
  return { ...s, user: s.user!, settings: s.settings!, meta: s.meta!, plan: s.plan!, legal: s.legal! };
}

async function loadUserData() {
  const [s, meta, p] = await Promise.all([api<{ settings: Settings }>('/settings'), api<Meta>('/meta'), api<{ plan: Plan }>('/plan')]);
  setCurrency(s.settings.currency);
  return { settings: s.settings, meta, plan: p.plan };
}

const SIGNED_OUT = { user: null, settings: null, meta: null, plan: null, consentPending: [] as LegalDocKey[] };
const NO_DATA = { settings: null, meta: null, plan: null };

type Me = { user: User; consent: { pending: LegalDocKey[] } };

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [session, setSession] = React.useState<Session>({ status: 'loading', legal: null, ...SIGNED_OUT });
  const userRef = React.useRef<User | null>(null);
  userRef.current = session.user;

  const boot = React.useCallback(async () => {
    setSession((s) => ({ ...s, status: 'loading' }));
    let legal: LegalInfo | null = null;
    try {
      legal = await api<LegalInfo>('/legal');
      const me = await api<Me>('/auth/me');
      if (me.consent.pending.length) {
        setSession({ status: 'ready', legal, user: me.user, ...NO_DATA, consentPending: me.consent.pending });
        return;
      }
      const data = await loadUserData();
      setSession({ status: 'ready', legal, user: me.user, ...data, consentPending: [] });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && legal) setSession({ status: 'ready', legal, ...SIGNED_OUT });
      else setSession({ status: 'error', error: errorMessage(err), legal, ...SIGNED_OUT });
    }
  }, []);

  React.useEffect(() => {
    boot();
  }, [boot]);

  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!userRef.current) return;
      userRef.current = null;
      setSession((s) => ({ ...s, ...SIGNED_OUT }));
      toast('Tu sesión ha caducado. Vuelve a iniciar sesión.', 'error');
      navigate('/login');
    });
    // Los documentos cambiaron mientras la app estaba abierta: se vuelve a pedir la sesión y aparece la pantalla de aceptación.
    setConsentRequiredHandler(() => {
      if (userRef.current) boot();
    });
  }, [toast, boot]);

  const value = React.useMemo<SessionApi>(
    () => ({
      ...session,
      signIn: async (user, consentPending = []) => {
        if (consentPending.length) {
          setSession((s) => ({ ...s, status: 'ready', user, ...NO_DATA, consentPending }));
          return;
        }
        const data = await loadUserData();
        setSession((s) => ({ ...s, status: 'ready', user, ...data, consentPending: [] }));
        navigate('/dashboard');
      },
      signOut: (to = '/login') => {
        userRef.current = null;
        setCurrency('COP');
        setSession((s) => ({ ...s, ...SIGNED_OUT }));
        if (to) navigate(to);
      },
      setUser: (user) => setSession((s) => (s.user ? { ...s, user } : s)),
      refreshUser: async () => {
        if (!userRef.current) return;
        try {
          const me = await api<Me>('/auth/me');
          setSession((s) => (s.user ? { ...s, user: me.user } : s));
        } catch {
          /* sin conexión: se queda lo conocido */
        }
      },
      consentAccepted: async () => {
        const data = await loadUserData();
        setSession((s) => ({ ...s, ...data, consentPending: [] }));
        navigate('/dashboard');
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
