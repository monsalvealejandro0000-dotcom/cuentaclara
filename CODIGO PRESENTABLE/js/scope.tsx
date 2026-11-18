import * as React from 'react';
import { useAuthed } from './session';
import type { ClientProfile, Settings, User } from './types';

/* ------------------------------------------------------------------ */
/*  Ámbito de las pantallas (fase 10, plan Contador).                  */
/*  Fuera del modo cliente, todo es como siempre: tu cuenta, tus datos. */
/*  Dentro (#/clientes/:id/…), las mismas pantallas leen los datos del  */
/*  cliente por /api/clients/:id/… y en solo lectura.                   */
/* ------------------------------------------------------------------ */

type Page = 'dashboard' | 'movimientos' | 'facturas' | 'informe';

const ClientContext = React.createContext<ClientProfile | null>(null);

export function ClientScopeProvider({ client, children }: { client: ClientProfile; children: React.ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export type Scope = {
  /** true en el modo cliente: sin crear, editar ni borrar. */
  readOnly: boolean;
  /** Prefijo de la API: '' (tu cuenta) o '/clients/:id'. */
  apiBase: string;
  /** Ruta de una pantalla en este ámbito: path('movimientos') → '/movimientos' o '/clientes/7/movimientos'. */
  path: (page: Page) => string;
  /** Dueño de los datos que se ven (para la cabecera de las facturas). */
  owner: { user: User; settings: Settings };
  client: ClientProfile | null;
};

export function useScope(): Scope {
  const client = React.useContext(ClientContext);
  const { user, settings } = useAuthed();
  if (!client) {
    return { readOnly: false, apiBase: '', path: (p) => `/${p}`, owner: { user, settings }, client: null };
  }
  const base = `/clientes/${client.id}`;
  return {
    readOnly: true,
    apiBase: `/clients/${client.id}`,
    path: (p) => (p === 'dashboard' ? base : `${base}/${p}`),
    owner: {
      user: { id: client.id, name: client.user_name, email: client.email },
      settings: {
        business_name: client.business_name,
        nif: client.nif,
        address: client.address,
        vat_responsible: client.vat_responsible,
        vat_period: client.vat_period,
        currency: client.currency,
        default_vat_rate: 0,
        default_irpf_rate: 0,
        title: '',
        updated_at: '',
      },
    },
    client,
  };
}
