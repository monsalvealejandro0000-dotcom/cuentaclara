import * as React from 'react';
import { UserCheck, Users } from 'lucide-react';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuthed, useSession } from '@/lib/session';
import { useLoad } from '@/lib/use-load';
import { todayISO } from '@/lib/format';
import type { AccountantLink, ClientsData } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/confirm';
import { Field, FormError } from '@/components/common';
import { dayLabel } from '@/components/plan';
import { ConsentCheckbox } from '@/components/legal';

/* ------------------------------------------------------------------ */
/*  Configuración → «Mi contador» (fase 10, plan Contador).            */
/*  El cliente invita a su contador, con su autorización (Ley 1581 de   */
/*  2012), y puede quitarle el acceso cuando quiera. Gratis y Pro.      */
/* ------------------------------------------------------------------ */

export const AUTHORIZATION_TEXT =
  'Autorizo a esta persona a ver, en solo lectura, mis movimientos, facturas, declaraciones e informes de CuentaClara, para la gestión de mis impuestos. Puedo quitarle el acceso cuando quiera.';

const pad = (n: number) => String(n).padStart(2, '0');
/** Fecha y hora del servidor (UTC) en hora local: «hoy a las 10:42» o «16 de noviembre de 2026 a las 10:42». */
export function whenLocal(iso: string) {
  const d = new Date(iso);
  const day = todayISO(d);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return day === todayISO() ? `hoy a las ${time}` : `${dayLabel(day)} a las ${time}`;
}
/** Fecha del servidor (UTC) como día local: «16 de noviembre de 2026». */
export const dayLocal = (iso: string) => dayLabel(todayISO(new Date(iso)));

/** Dashboard del contador en el celular: acceso a sus clientes (la barra inferior ya tiene 5 accesos). */
export function ClientsShortcut() {
  const { plan } = useAuthed();
  return plan.tier === 'contador' ? <Shortcut /> : null;
}

function Shortcut() {
  const { data } = useLoad(() => api<ClientsData>('/clients'), []);
  if (!data) return null;
  const n = data.clients.length;
  const p = data.invitations.length;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-violet/35 bg-violet/10 px-4 py-3 md:hidden">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        Tus clientes ({n}){p ? ` · ${p} ${p === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}` : ''}
      </span>
      <ButtonLink variant="outline" size="sm" href="#/clientes" className="max-sm:w-full">
        Ver clientes
      </ButtonLink>
    </div>
  );
}

export function AccountantCard() {
  const { legal } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(() => api<{ link: AccountantLink | null }>('/accountant'), []);
  const [email, setEmail] = React.useState('');
  const [authorize, setAuthorize] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const link = data?.link ?? null;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await api('/accountant', { method: 'POST', body: { email, authorize } });
      toast('Invitación creada. Avísale a tu contador que entre a CuentaClara con ese correo.');
      setEmail('');
      setAuthorize(false);
      reload();
    } catch (err) {
      const f = errorFields(err);
      setErrors(f);
      setFormError(Object.keys(f).length ? null : errorMessage(err));
    }
    setBusy(false);
  }

  async function remove() {
    const ok = await confirm(
      link?.status === 'activo'
        ? {
            title: 'Quitar acceso a tu contador',
            message: `${link.name ?? link.email} dejará de ver tus datos al instante. Puedes volver a invitarlo cuando quieras.`,
            confirmLabel: 'Quitar acceso',
          }
        : { title: 'Cancelar invitación', message: 'La invitación dejará de estar disponible para tu contador.', confirmLabel: 'Cancelar invitación' },
    );
    if (!ok) return;
    try {
      await api('/accountant', { method: 'DELETE' });
      toast(link?.status === 'activo' ? 'Tu contador ya no puede ver tus datos' : 'Invitación cancelada');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    reload();
  }

  const canInvite = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && authorize && !busy;

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <UserCheck className="size-[18px] text-muted-foreground" aria-hidden="true" /> Mi contador
      </CardTitle>
      <CardDescription>Dale acceso de solo lectura a tu contador para que vea tus movimientos, facturas e informes. No puede cambiar nada.</CardDescription>

      {loading && !data ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : error && !data ? (
        <div className="mt-4">
          <FormError message={errorMessage(error)} />
          <Button variant="outline" className="mt-3" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : link && link.status !== 'rechazado' ? (
        <Inset className="mt-4 grid gap-3 px-4 py-3.5" aria-live="polite" data-testid="accountant-status">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm">
              {link.status === 'pendiente' ? (
                <>
                  Invitaste a <b className="font-semibold">{link.email}</b> el {dayLocal(link.invitedAt)}. Tu contador debe entrar a CuentaClara con ese correo y aceptar.
                </>
              ) : link.accountantActive === false ? (
                <>
                  <b className="font-semibold">{link.name ?? link.email}</b> no puede ver tus datos ahora: su plan Contador no está activo.
                </>
              ) : (
                <>
                  <b className="font-semibold">
                    {link.email}
                    {link.name ? ` (${link.name})` : ''}
                  </b>{' '}
                  puede ver tus datos desde el {dayLocal(link.acceptedAt!)}.
                </>
              )}
            </p>
            <Badge tone={link.status === 'pendiente' ? 'warning' : link.accountantActive === false ? 'neutral' : 'positive'}>
              {link.status === 'pendiente' ? 'Pendiente' : link.accountantActive === false ? 'Sin plan activo' : 'Activo'}
            </Badge>
          </div>
          {link.status === 'activo' && (
            <p className="text-xs text-muted-foreground">Último acceso: {link.lastAccessAt ? whenLocal(link.lastAccessAt) : 'todavía no ha entrado'}.</p>
          )}
          <div className="flex justify-end">
            <Button variant={link.status === 'activo' ? 'ghost-destructive' : 'outline'} onClick={remove}>
              {link.status === 'activo' ? 'Quitar acceso' : 'Cancelar invitación'}
            </Button>
          </div>
        </Inset>
      ) : (
        <form noValidate onSubmit={invite} className="mt-4 grid gap-4">
          {link?.status === 'rechazado' && (
            <p className="text-sm text-muted-foreground">
              <b className="font-semibold text-foreground">{link.email}</b> rechazó la invitación. Puedes invitar a otro correo.
            </p>
          )}
          <FormError message={formError} />
          <Field id="acc-email" label="Correo de tu contador" error={errors.email}>
            <Input type="email" name="email" autoComplete="off" maxLength={254} placeholder="contador@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {/* Autorización específica para compartir los datos con un tercero; queda en el registro de consentimientos. */}
          <ConsentCheckbox
            id="acc-authorize"
            checked={authorize}
            onChange={setAuthorize}
            label={legal?.labels.contador ?? AUTHORIZATION_TEXT}
            links={[{ doc: 'privacidad', text: 'Cómo se comparten tus datos' }]}
            error={errors.authorize}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!canInvite}>
              {busy ? 'Invitando…' : 'Invitar'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
