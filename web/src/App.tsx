import * as React from 'react';
import { useRoute, navigate } from '@/lib/router';
import { useSession } from '@/lib/session';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/common';
import { LoginPage, RegisterPage } from '@/pages/auth';
import { DashboardPage } from '@/pages/dashboard';
import { MovementsPage } from '@/pages/movements';
import { InvoiceDetailPage, InvoicesPage } from '@/pages/invoices';
import { CalendarPage } from '@/pages/calendar';
import { SettingsPage } from '@/pages/settings';
import { PlansPage } from '@/pages/plans';
import { PayPage } from '@/pages/pay';
import { ReportPage } from '@/pages/report';
import { ProGateProvider } from '@/components/plan';
import { ClientsPage, ClientView } from '@/pages/clients';
import { setCurrency } from '@/lib/format';
import { LegalPage } from '@/pages/legal';
import { ConsentGate } from '@/pages/consent-gate';
import { PqrPage } from '@/pages/pqr';
import { ConfirmEmailPage, ForgotPasswordPage, ResetPasswordPage } from '@/pages/account-links';
import type { LegalDocKey } from '@/lib/types';

/**
 * `public`: solo sin sesión (login, registro). `open`: con o sin sesión, fuera de la app (documentos legales).
 */
type Route = { re: RegExp; title: string; public?: boolean; open?: boolean; render: (p: { query: URLSearchParams; params: string[] }) => React.ReactNode };

const ROUTES: Route[] = [
  { re: /^\/login\/?$/, title: 'Iniciar sesión', public: true, render: () => <LoginPage /> },
  { re: /^\/registro\/?$/, title: 'Crear cuenta', public: true, render: () => <RegisterPage /> },
  // Fase 13: recuperar la contraseña (sin sesión) y enlaces de los correos (con o sin sesión).
  { re: /^\/recuperar\/?$/, title: 'Recuperar contraseña', public: true, render: () => <ForgotPasswordPage /> },
  { re: /^\/restablecer\/?$/, title: 'Nueva contraseña', open: true, render: ({ query }) => <ResetPasswordPage query={query} /> },
  { re: /^\/confirmar-correo\/?$/, title: 'Confirmar correo', open: true, render: ({ query }) => <ConfirmEmailPage query={query} /> },
  // Fase 12: documentos legales (públicos) y peticiones, quejas y reclamos.
  { re: /^\/legal\/(terminos|privacidad|cookies|reembolsos)\/?$/, title: 'Información legal', open: true, render: ({ params }) => <LegalPage doc={params[0] as LegalDocKey} /> },
  { re: /^\/pqr\/?$/, title: 'Peticiones, quejas y reclamos', render: () => <PqrPage /> },
  { re: /^\/dashboard\/?$/, title: 'Dashboard', render: ({ query }) => <DashboardPage query={query} /> },
  { re: /^\/movimientos\/?$/, title: 'Movimientos', render: ({ query }) => <MovementsPage query={query} /> },
  { re: /^\/facturas\/?$/, title: 'Facturas', render: ({ query }) => <InvoicesPage query={query} /> },
  { re: /^\/facturas\/([^/]+)\/?$/, title: 'Factura', render: ({ params }) => <InvoiceDetailPage id={params[0]} /> },
  { re: /^\/calendario\/?$/, title: 'Calendario', render: ({ query }) => <CalendarPage query={query} /> },
  { re: /^\/configuracion\/?$/, title: 'Configuración', render: () => <SettingsPage /> },
  { re: /^\/planes\/?$/, title: 'Planes', render: () => <PlansPage /> },
  { re: /^\/planes\/pagar\/?$/, title: 'Pagar plan', render: ({ query }) => <PayPage query={query} /> },
  { re: /^\/informe\/?$/, title: 'Informe para el contador', render: ({ query }) => <ReportPage query={query} /> },
  // Plan Contador (fase 10): panel de clientes y modo cliente en solo lectura.
  { re: /^\/clientes\/?$/, title: 'Clientes', render: () => <ClientsPage /> },
  { re: /^\/clientes\/(\d+)\/?$/, title: 'Cliente', render: ({ params, query }) => <ClientView id={params[0]} tab="resumen" query={query} /> },
  { re: /^\/clientes\/(\d+)\/movimientos\/?$/, title: 'Cliente · Movimientos', render: ({ params, query }) => <ClientView id={params[0]} tab="movimientos" query={query} /> },
  { re: /^\/clientes\/(\d+)\/facturas\/?$/, title: 'Cliente · Facturas', render: ({ params, query }) => <ClientView id={params[0]} tab="facturas" query={query} /> },
  {
    re: /^\/clientes\/(\d+)\/facturas\/([^/]+)\/?$/,
    title: 'Cliente · Factura',
    render: ({ params, query }) => <ClientView id={params[0]} tab="factura" invoiceId={params[1]} query={query} />,
  },
  { re: /^\/clientes\/(\d+)\/informe\/?$/, title: 'Cliente · Informe', render: ({ params, query }) => <ClientView id={params[0]} tab="informe" query={query} /> },
];

export function App() {
  const { status, error, user, settings, retry, consentPending } = useSession();
  const { path, query, key } = useRoute();
  const match = ROUTES.map((r) => ({ r, m: r.re.exec(path) })).find((x) => x.m);
  const redirect =
    status !== 'ready' || match?.r.open
      ? null
      : !match
        ? user
          ? '/dashboard'
          : '/login'
        : !match.r.public && !user
          ? '/login'
          : match.r.public && user
            ? '/dashboard'
            : null;

  React.useEffect(() => {
    if (redirect) navigate(redirect);
  }, [redirect]);

  const gated = Boolean(user && consentPending.length);
  React.useEffect(() => {
    if (match?.r.open && path.startsWith('/legal/')) return; // el documento legal pone su propio título
    if (gated && path !== '/pqr' && !match?.r.open) document.title = 'Antes de seguir · CuentaClara';
    else if (match) document.title = `${match.r.title} · CuentaClara`;
  }, [match, gated, path]);

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);

  if (status === 'loading') return <Loading />;
  if (status === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div role="alert" className="max-w-md rounded-[28px] border border-negative/30 bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">No se pudo conectar con el servidor</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4" onClick={retry}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }
  if (redirect || !match) return null;
  // Documentos legales: se leen con o sin sesión, también antes de aceptarlos.
  if (match.r.open) return <React.Fragment key={key}>{match.r.render({ query, params: match.m!.slice(1) })}</React.Fragment>;
  // Sin aceptar la versión vigente de los términos y la política de privacidad solo se ve la pantalla de aceptación
  // (y las PQR, por si la persona quiere reclamar).
  if (user && consentPending.length) return path === '/pqr' ? <PqrPage key={key} /> : <ConsentGate />;
  // El modo cliente usa la moneda del cliente; en el resto de pantallas, siempre la tuya.
  if (settings && !path.startsWith('/clientes/')) setCurrency(settings.currency);
  const page = match.r.render({ query, params: match.m!.slice(1) });
  if (match.r.public) return <React.Fragment key={key}>{page}</React.Fragment>;
  return (
    <AppShell path={path}>
      <ProGateProvider>
        <React.Fragment key={key}>{page}</React.Fragment>
      </ProGateProvider>
    </AppShell>
  );
}
