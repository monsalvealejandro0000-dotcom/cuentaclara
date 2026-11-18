import * as React from 'react';
import { ChevronDown, Download, KeyRound, Mail, MailCheck, ShieldCheck, Smartphone } from 'lucide-react';
import { api, ApiError, errorFields, errorMessage } from '@/lib/api';
import { useAuthed, useSession } from '@/lib/session';
import { downloadFile } from '@/lib/format';
import { encodeQr, qrPath } from '@/lib/qr';
import type { MailDelivery, SecurityInfo, User } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Field, FormError, useFocusFirstError } from '@/components/common';
import { dayLocal, whenLocal } from '@/components/accountant';
import { browserName } from '@/components/privacy-card';
import { CopyButton } from '@/pages/pay';

/* ------------------------------------------------------------------ */
/*  Fase 13 (docs/13-correo-y-segundo-factor.md): confirmar y cambiar  */
/*  el correo, verificación en dos pasos y actividad de seguridad.     */
/* ------------------------------------------------------------------ */

/** Frase extra cuando la app no envía correos de verdad (sin data/correo.json). */
export const LOCAL_MAIL_NOTE = 'Modo local: el enlace aparece en la ventana negra del servidor.';
export const deliveryNote = (d?: MailDelivery) => (d === 'local' ? ` ${LOCAL_MAIL_NOTE}` : '');

/** Reenvía el enlace para confirmar el correo. Si ya estaba confirmado (p. ej. en el celular), actualiza la cuenta. */
export function useResendVerification() {
  const { refreshUser } = useSession();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const resend = async () => {
    setBusy(true);
    try {
      const r = await api<{ delivery: MailDelivery }>('/account/email/resend', { method: 'POST' });
      toast(`Te enviamos otro enlace. Revisa también la carpeta de spam.${deliveryNote(r.delivery)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_VERIFIED') {
        await refreshUser();
        toast('Tu correo ya está confirmado');
      } else toast(errorMessage(err), 'error');
    }
    setBusy(false);
  };
  return { resend, busy };
}

/** Aviso arriba de todas las pantallas mientras el correo no esté confirmado. */
export function VerifyEmailBanner() {
  const { user, refreshUser } = useAuthed();
  const { resend, busy } = useResendVerification();
  const [changing, setChanging] = React.useState(false);
  const verified = user.emailVerified;

  // Si confirma el correo en otro dispositivo, el aviso desaparece al volver a esta pestaña.
  React.useEffect(() => {
    if (verified) return;
    const onVisible = () => document.visibilityState === 'visible' && refreshUser();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [verified, refreshUser]);

  if (verified) return null;
  return (
    <>
      <div role="status" className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-warning/40 bg-warning/12 px-4 py-3 text-sm">
        <span className="flex min-w-0 items-start gap-2">
          <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <b className="font-semibold">Confirma tu correo</b> <span className="break-all">{user.email}</span>. Te enviamos un enlace; vence en 24 horas.
          </span>
        </span>
        <span className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          <Button variant="outline" size="sm" onClick={resend} disabled={busy}>
            {busy ? 'Enviando…' : 'Reenviar'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
            Cambiar correo
          </Button>
        </span>
      </div>
      {changing && <ChangeEmailDialog onClose={() => setChanging(false)} />}
    </>
  );
}

/** Mensaje en lugar de una función que exige el correo confirmado (contador, pagos, verificación en dos pasos). */
export function VerifyEmailFirst({ children }: { children: React.ReactNode }) {
  const { resend, busy } = useResendVerification();
  return (
    <Inset className="mt-4 grid gap-3 px-4 py-3.5 text-sm">
      <p className="flex items-start gap-2">
        <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{children}</span>
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={resend} disabled={busy}>
          {busy ? 'Enviando…' : 'Reenviar el enlace'}
        </Button>
      </div>
    </Inset>
  );
}

/** Cambiar el correo: con la contraseña; cambia cuando se abre el enlace que llega al correo nuevo. */
export function ChangeEmailDialog({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState({ new_email: '', password: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  useFocusFirstError(formRef, errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.new_email.trim())) errs.new_email = 'Escribe un correo válido';
    if (!f.password) errs.password = 'Escribe tu contraseña';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await api<{ pendingEmail: string; delivery: MailDelivery }>('/account/email', { method: 'POST', body: f });
      toast(`Te enviamos un enlace a ${r.pendingEmail}. Tu correo cambiará cuando lo abras.${deliveryNote(r.delivery)}`);
      onDone?.();
      onClose();
    } catch (err) {
      const fields = errorFields(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Cambiar correo" size="sm" description="Te enviaremos un enlace al correo nuevo. Hasta que lo abras, sigues usando el actual.">
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <Field id="ce-email" label="Correo nuevo" error={errors.new_email}>
          <Input type="email" name="new_email" autoComplete="email" maxLength={254} value={f.new_email} onChange={(e) => setF({ ...f, new_email: e.target.value })} />
        </Field>
        <Field id="ce-password" label="Tu contraseña" error={errors.password}>
          <Input type="password" name="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <DialogActions>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar enlace'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

type Loaded = { data: SecurityInfo | null; error: Error | null; loading: boolean; reload: () => void };

/** Configuración → Correo. */
export function EmailCard({ security }: { security: Loaded }) {
  const { user } = useAuthed();
  const toast = useToast();
  const { resend, busy } = useResendVerification();
  const [changing, setChanging] = React.useState(false);
  const pending = security.data?.pendingEmail ?? null;

  async function cancelPending() {
    try {
      await api('/account/email/pending', { method: 'DELETE' });
      toast('Cambio de correo cancelado');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    security.reload();
  }

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <MailCheck className="size-[18px] text-muted-foreground" aria-hidden="true" /> Correo
      </CardTitle>
      <CardDescription>Es tu usuario para entrar y por donde te avisamos de cambios de seguridad o recuperas tu contraseña.</CardDescription>
      <Inset className="mt-4 grid gap-3 px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 break-all text-sm font-medium">{user.email}</span>
          <Badge tone={user.emailVerified ? 'positive' : 'warning'}>{user.emailVerified ? 'Confirmado' : 'Sin confirmar'}</Badge>
        </div>
        {pending && (
          <p className="text-sm text-muted-foreground">
            Cambio pendiente a <b className="break-all font-semibold text-foreground">{pending}</b>: abre el enlace que te enviamos a ese correo.{' '}
            <button type="button" className="cursor-pointer font-medium text-brand underline-offset-4 hover:underline" onClick={cancelPending}>
              Cancelar el cambio
            </button>
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {!user.emailVerified && (
            <Button variant="outline" onClick={resend} disabled={busy}>
              {busy ? 'Enviando…' : 'Reenviar enlace'}
            </Button>
          )}
          <Button variant="outline" onClick={() => setChanging(true)}>
            Cambiar correo
          </Button>
        </div>
      </Inset>
      {changing && <ChangeEmailDialog onClose={() => setChanging(false)} onDone={security.reload} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ verificación en dos pasos */

/** Código QR dibujado en el navegador: oscuro sobre blanco también en el tema oscuro, para que las cámaras lo lean. */
export function QrImage({ value, className }: { value: string; className?: string }) {
  const { d, viewBox } = React.useMemo(() => qrPath(encodeQr(value)), [value]);
  return (
    <svg viewBox={viewBox} role="img" aria-label="Código QR para tu app de autenticación" className={className} shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}

/** Los códigos de respaldo, que se muestran una sola vez. */
export function BackupCodesView({ codes, email, onDone, doneLabel = 'Listo' }: { codes: string[]; email: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = React.useState(false);
  const text = `Códigos de respaldo de CuentaClara (${email})\nCada código sirve UNA vez para entrar sin tu celular. Guárdalos en un lugar seguro.\n\n${codes.join('\n')}\n`;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Cada código sirve <b className="text-foreground">una vez</b> para entrar si no tienes tu celular. Guárdalos en un lugar seguro (un gestor de contraseñas o impresos):{' '}
        <b className="text-foreground">no los volverás a ver</b>.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-[18px] border border-border bg-muted/40 p-4 font-mono text-[15px] tracking-wide" aria-label="Códigos de respaldo">
        {codes.map((c) => (
          <li key={c} className="text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={codes.join('\n')} what="los códigos de respaldo" />
        <Button variant="outline" size="sm" onClick={() => downloadFile('cuentaclara-codigos-de-respaldo.txt', text, 'text/plain;charset=utf-8')}>
          <Download /> Descargar .txt
        </Button>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer accent-positive" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Guardé mis códigos en un lugar seguro.
      </label>
      <DialogActions>
        <Button onClick={onDone} disabled={!saved}>
          {doneLabel}
        </Button>
      </DialogActions>
    </div>
  );
}

/** Configuración → Verificación en dos pasos. */
export function TwoFactorCard({ security }: { security: Loaded }) {
  const { user } = useAuthed();
  const [dialog, setDialog] = React.useState<null | 'activar' | 'desactivar' | 'codigos'>(null);
  const tf = security.data?.twoFactor;
  const enabled = tf?.enabled ?? user.twoFactor;

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <Smartphone className="size-[18px] text-muted-foreground" aria-hidden="true" /> Verificación en dos pasos
      </CardTitle>
      <CardDescription>
        Además de tu contraseña, al entrar te pediremos un código de 6 dígitos de una app de tu celular. Si alguien descubre tu contraseña, no podrá entrar.
      </CardDescription>
      {security.error && !security.data ? (
        <div className="mt-4">
          <FormError message={errorMessage(security.error)} />
        </div>
      ) : enabled ? (
        <Inset className="mt-4 grid gap-3 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{tf?.since ? `Activada desde el ${dayLocal(tf.since)}.` : 'Activada.'}</span>
            <Badge tone="positive">Activada</Badge>
          </div>
          {tf && (
            <p className={tf.backupCodesLeft <= 3 ? 'text-sm font-medium text-negative-ink' : 'text-sm text-muted-foreground'}>
              Te {tf.backupCodesLeft === 1 ? 'queda 1 código' : `quedan ${tf.backupCodesLeft} códigos`} de respaldo.
              {tf.backupCodesLeft <= 3 && ' Genera códigos nuevos para no quedarte sin forma de entrar.'}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog('codigos')}>
              <KeyRound /> Generar códigos nuevos
            </Button>
            <Button variant="ghost-destructive" onClick={() => setDialog('desactivar')}>
              Desactivar
            </Button>
          </div>
        </Inset>
      ) : (
        <div className="mt-4 grid gap-2">
          {!user.emailVerified && <p className="text-sm text-muted-foreground">Primero confirma tu correo: lo necesitas para recuperar tu cuenta si pierdes el celular.</p>}
          <div>
            <Button onClick={() => setDialog('activar')} disabled={!user.emailVerified}>
              <ShieldCheck /> Activar
            </Button>
          </div>
        </div>
      )}
      {dialog === 'activar' && <EnableTwoFactorDialog onClose={() => (setDialog(null), security.reload())} />}
      {dialog === 'desactivar' && <PasswordAndCodeDialog mode="desactivar" onClose={() => (setDialog(null), security.reload())} />}
      {dialog === 'codigos' && <PasswordAndCodeDialog mode="codigos" onClose={() => (setDialog(null), security.reload())} />}
    </Card>
  );
}

function EnableTwoFactorDialog({ onClose }: { onClose: () => void }) {
  const { user, setUser } = useAuthed();
  const toast = useToast();
  const [step, setStep] = React.useState<'password' | 'scan' | 'codes'>('password');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [setup, setSetup] = React.useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return setError('Escribe tu contraseña');
    setBusy(true);
    setError(undefined);
    try {
      setSetup(await api<{ secret: string; uri: string }>('/account/2fa/setup', { method: 'POST', body: { password } }));
      setPassword('');
      setStep('scan');
    } catch (err) {
      setError(errorFields(err).password ?? errorMessage(err));
    }
    setBusy(false);
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) return setError('Escribe los 6 dígitos que muestra tu app');
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ backupCodes: string[] }>('/account/2fa/enable', { method: 'POST', body: { code } });
      setCodes(r.backupCodes);
      setUser({ ...user, twoFactor: true } satisfies User);
      setStep('codes');
    } catch (err) {
      setError(errorFields(err).code ?? errorMessage(err));
    }
    setBusy(false);
  }

  const title = step === 'codes' ? 'Guarda tus códigos de respaldo' : 'Activar la verificación en dos pasos';
  return (
    <Dialog open onClose={onClose} title={title} description={step === 'codes' ? undefined : `Paso ${step === 'password' ? 1 : 2} de 3`}>
      {step === 'password' && (
        <form noValidate onSubmit={start} className="grid gap-4">
          <p className="text-sm text-muted-foreground">Confirma que eres tú.</p>
          <Field id="tf-password" label="Tu contraseña" error={error}>
            <Input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <DialogActions>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Comprobando…' : 'Continuar'}
            </Button>
          </DialogActions>
        </form>
      )}
      {step === 'scan' && setup && (
        <form noValidate onSubmit={enable} className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Instala una app de autenticación en tu celular (Google Authenticator, Microsoft Authenticator, 2FAS…), toca «Agregar» y escanea este código.
          </p>
          <div className="grid justify-items-center gap-3">
            <QrImage value={setup.uri} className="size-[208px] rounded-xl border border-border" />
            <a href={setup.uri} className="text-sm font-medium text-brand underline-offset-4 hover:underline md:hidden">
              Abrir en mi app de autenticación
            </a>
          </div>
          <div className="grid gap-2 rounded-[18px] border border-border bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">¿No puedes escanearlo? En la app elige «Ingresar una clave» y escribe esta:</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="break-all font-mono text-[15px] tracking-wide">{setup.secret}</code>
              <CopyButton text={setup.secret.replace(/\s/g, '')} what="la clave" />
            </div>
            <p className="text-xs text-muted-foreground">Cuenta: {user.email} · Tipo: basada en el tiempo.</p>
          </div>
          <Field id="tf-code" label="Código de 6 dígitos que muestra la app" error={error}>
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              className="max-w-[180px] font-mono text-lg tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
            />
          </Field>
          <DialogActions>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Activando…' : 'Activar'}
            </Button>
          </DialogActions>
        </form>
      )}
      {step === 'codes' && (
        <BackupCodesView
          codes={codes}
          email={user.email}
          onDone={() => {
            toast('Verificación en dos pasos activada. Cerramos tus sesiones en otros dispositivos.');
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}

/** Desactivar o generar códigos nuevos: contraseña y un código (de la app o de respaldo). */
function PasswordAndCodeDialog({ mode, onClose }: { mode: 'desactivar' | 'codigos'; onClose: () => void }) {
  const { user, setUser } = useAuthed();
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState({ password: '', code: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  useFocusFirstError(formRef, errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.password) errs.password = 'Escribe tu contraseña';
    if (!f.code.trim()) errs.code = 'Escribe un código de tu app o de respaldo';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (mode === 'desactivar') {
        await api('/account/2fa/disable', { method: 'POST', body: f });
        setUser({ ...user, twoFactor: false });
        toast('Verificación en dos pasos desactivada');
        onClose();
      } else {
        const r = await api<{ backupCodes: string[] }>('/account/2fa/backup-codes', { method: 'POST', body: f });
        setCodes(r.backupCodes);
      }
    } catch (err) {
      const fields = errorFields(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
    }
    setBusy(false);
  }

  if (codes) {
    return (
      <Dialog open onClose={onClose} title="Tus códigos de respaldo nuevos">
        <BackupCodesView codes={codes} email={user.email} onDone={() => (toast('Códigos nuevos guardados. Los anteriores ya no sirven.'), onClose())} />
      </Dialog>
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={mode === 'desactivar' ? 'Desactivar la verificación en dos pasos' : 'Generar códigos de respaldo nuevos'}
      description={mode === 'desactivar' ? 'Al entrar solo te pediremos la contraseña. Tu cuenta quedará menos protegida.' : 'Los códigos anteriores dejarán de servir.'}
    >
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <Field id="pc-password" label="Tu contraseña" error={errors.password}>
          <Input type="password" name="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field id="pc-code" label="Código de tu app (o uno de respaldo)" error={errors.code}>
          <Input name="code" autoComplete="one-time-code" maxLength={20} className="font-mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        </Field>
        <DialogActions>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant={mode === 'desactivar' ? 'destructive' : 'default'} disabled={busy}>
            {busy ? 'Comprobando…' : mode === 'desactivar' ? 'Desactivar' : 'Generar códigos'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ actividad */

/** Configuración → Actividad de seguridad: «¿fuiste tú?». */
export function SecurityActivityCard({ security }: { security: Loaded }) {
  const [open, setOpen] = React.useState(false);
  const events = security.data?.events ?? [];
  const shown = open ? events : events.slice(0, 5);
  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <ShieldCheck className="size-[18px] text-muted-foreground" aria-hidden="true" /> Actividad de seguridad
      </CardTitle>
      <CardDescription>Cambios de contraseña, correo y verificación en dos pasos de los últimos 12 meses. Si ves algo que no hiciste, cambia tu contraseña.</CardDescription>
      {security.loading && !security.data ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : !events.length ? (
        <p className="mt-4 text-sm text-muted-foreground">Todavía no hay cambios de seguridad.</p>
      ) : (
        <>
          <ul className="mt-4 grid gap-2">
            {shown.map((e) => (
              <li key={e.id} className="rounded-[18px] border border-border px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{e.label}</span>
                  <span className="text-xs text-muted-foreground">{whenLocal(e.at)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.detail && <span className="break-all">{e.detail} · </span>}
                  {e.ip === 'administrador' ? 'Por el administrador' : `${browserName(e.userAgent)} · IP ${e.ip || 'desconocida'}`}
                </p>
              </li>
            ))}
          </ul>
          {events.length > 5 && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpen(!open)} aria-expanded={open}>
              <ChevronDown className={open ? 'rotate-180' : ''} /> {open ? 'Ver menos' : `Ver todo (${events.length})`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
