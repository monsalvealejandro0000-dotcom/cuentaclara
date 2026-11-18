import * as React from 'react';
import { api, ApiError, errorFields, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { LegalDocKey, MailDelivery, User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Field, FormError, useFocusFirstError } from '@/components/common';
import { Logo, ThemeSwitch } from '@/components/app-shell';
import { LegalConsentFields, LegalFooter, legalVersions, type LegalAccept } from '@/components/legal';
import { deliveryNote } from '@/components/security';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Igual que el servidor (server/validation.js): las contraseñas nuevas tienen al menos 10 caracteres. */
export const MIN_PASSWORD = 10;
export const PASSWORD_HINT = `Mínimo ${MIN_PASSWORD} caracteres, con letras y números. Mejor una frase que no uses en otros sitios.`;

/** Comprobación rápida en el navegador; el servidor además rechaza las más usadas y las que contienen tu correo o tu nombre. */
export function passwordError(pw: string) {
  if (pw.length < MIN_PASSWORD) return `Mínimo ${MIN_PASSWORD} caracteres`;
  if (!/\p{L}/u.test(pw) || !/\d/.test(pw)) return 'Debe incluir letras y números';
  return undefined;
}

type AuthResponse = { user: User; consent?: { pending: LegalDocKey[] }; delivery?: MailDelivery; backupCodesLeft?: number };
/** Con la verificación en dos pasos, la contraseña correcta devuelve un paso pendiente en lugar de la sesión (fase 13). */
type LoginResponse = AuthResponse | { twoFactor: { ticket: string; expiresInSec: number } };

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-8">
          <Logo />
          <h1 className="mt-7 text-[26px] font-semibold tracking-[-0.035em]">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>
        <ThemeSwitch className="mx-auto mt-4 w-40" />
        <LegalFooter className="mt-5" />
      </div>
    </div>
  );
}

export function LoginPage() {
  const { signIn, legal } = useSession();
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState({ email: '', password: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Fase 13: segundo paso (código de la app o de respaldo). El «ticket» solo vive en memoria, mientras se pide el código.
  const [ticket, setTicket] = React.useState<string | null>(null);
  const [backup, setBackup] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [lost, setLost] = React.useState(false);
  useFocusFirstError(formRef, errors);

  async function finish(res: AuthResponse) {
    if (res.backupCodesLeft !== undefined) {
      const n = res.backupCodesLeft;
      toast(`Usaste un código de respaldo. Te ${n === 1 ? 'queda 1' : `quedan ${n}`}.${n <= 3 ? ' Genera códigos nuevos en Configuración.' : ''}`);
    }
    await signIn(res.user, res.consent?.pending ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.email.trim()) errs.email = 'Escribe tu email';
    if (!f.password) errs.password = 'Escribe tu contraseña';
    setFormError(null);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: f });
      if ('twoFactor' in res) {
        setTicket(res.twoFactor.ticket);
        setF((s) => ({ ...s, password: '' }));
        setCode('');
        setBackup(false);
        setLost(false);
        setBusy(false);
        return;
      }
      await finish(res);
    } catch (err) {
      setErrors(errorFields(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.trim();
    if (!clean) return setErrors({ code: backup ? 'Escribe uno de tus códigos de respaldo' : 'Escribe el código de 6 dígitos' });
    setFormError(null);
    setErrors({});
    setBusy(true);
    try {
      await finish(await api<AuthResponse>('/auth/login/2fa', { method: 'POST', body: { ticket, code: clean } }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TWO_FACTOR_EXPIRED') {
        // Caducó o hubo demasiados intentos: vuelta a la contraseña.
        setTicket(null);
        setFormError(err.message);
      } else {
        const fields = errorFields(err);
        setErrors(fields);
        setFormError(Object.keys(fields).length ? null : errorMessage(err));
      }
      setBusy(false);
    }
  }

  const footer = (
    <>
      ¿No tienes cuenta?{' '}
      <a className="font-medium text-brand underline-offset-4 hover:underline" href="#/registro">
        Crear cuenta
      </a>
    </>
  );

  if (ticket) {
    return (
      <AuthCard
        title="Verificación en dos pasos"
        subtitle={
          backup
            ? 'Escribe uno de tus códigos de respaldo. Cada uno sirve una sola vez.'
            : 'Abre tu app de autenticación (Google Authenticator, Microsoft Authenticator…) y escribe el código de 6 dígitos de CuentaClara.'
        }
        footer={footer}
      >
        <form ref={formRef} noValidate onSubmit={submitCode} className="grid gap-4">
          <FormError message={formError} />
          <Field id="login-code" label={backup ? 'Código de respaldo' : 'Código'} error={errors.code}>
            <Input
              key={backup ? 'backup' : 'totp'}
              name="code"
              autoFocus
              autoComplete="one-time-code"
              inputMode={backup ? 'text' : 'numeric'}
              maxLength={backup ? 20 : 7}
              placeholder={backup ? 'k7m2p-x9qrt' : '123456'}
              className="font-mono text-lg tracking-[0.2em]"
              value={code}
              onChange={(e) => setCode(backup ? e.target.value : e.target.value.replace(/[^\d ]/g, ''))}
            />
          </Field>
          <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
            {busy ? 'Verificando…' : 'Verificar'}
          </Button>
          <div className="grid gap-2 text-sm">
            <button
              type="button"
              className="cursor-pointer justify-self-start font-medium text-brand underline-offset-4 hover:underline"
              onClick={() => {
                setBackup(!backup);
                setCode('');
                setErrors({});
              }}
            >
              {backup ? 'Usar el código de mi app' : 'Usar un código de respaldo'}
            </button>
            <button
              type="button"
              className="cursor-pointer justify-self-start text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setLost(!lost)}
              aria-expanded={lost}
            >
              ¿Perdiste el celular y los códigos?
            </button>
            {lost && (
              <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-muted-foreground">
                Escríbenos{' '}
                {legal?.contact ? (
                  <>
                    a <b className="text-foreground">{legal.contact.email}</b>{' '}
                  </>
                ) : null}
                desde el correo de tu cuenta. Comprobaremos que eres tú y quitaremos la verificación en dos pasos para que puedas entrar y activarla de nuevo.
              </p>
            )}
            <button
              type="button"
              className="cursor-pointer justify-self-start text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setTicket(null);
                setErrors({});
                setFormError(null);
              }}
            >
              Volver
            </button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Inicia sesión" subtitle="Tus ingresos, gastos e impuestos, al día." footer={footer}>
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <Field id="login-email" label="Email" error={errors.email}>
          <Input type="email" name="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field
          id="login-password"
          label="Contraseña"
          error={errors.password}
          hint={
            <a className="font-medium text-brand underline-offset-4 hover:underline" href="#/recuperar">
              ¿Olvidaste tu contraseña?
            </a>
          }
        >
          <Input type="password" name="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { signIn, legal } = useSession();
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState({ name: '', email: '', password: '', password2: '' });
  // Las dos casillas empiezan SIN marcar: aceptar tiene que ser un acto expreso de la persona.
  const [accept, setAccept] = React.useState<LegalAccept>({ terms: false, privacy: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  useFocusFirstError(formRef, errors);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = 'Escribe tu nombre';
    if (!EMAIL_RE.test(f.email.trim())) errs.email = 'Escribe un email válido';
    const pwError = passwordError(f.password);
    if (pwError) errs.password = pwError;
    if (f.password2 !== f.password) errs.password2 = 'Las contraseñas no coinciden';
    if (!accept.terms) errs.accept_terms = 'Para crear tu cuenta debes aceptar los Términos y condiciones';
    if (!accept.privacy) errs.accept_privacy = 'Para crear tu cuenta debes autorizar el tratamiento de tus datos';
    setFormError(null);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: {
          name: f.name,
          email: f.email,
          password: f.password,
          accept_terms: accept.terms,
          accept_privacy: accept.privacy,
          versions: legalVersions(legal, ['terminos', 'privacidad']),
        },
      });
      await signIn(res.user, res.consent?.pending ?? []);
      // Fase 13: la cuenta ya se puede usar; el aviso «Confirma tu correo» queda arriba hasta abrir el enlace.
      toast(`Te enviamos un enlace a ${res.user.email} para confirmar tu correo.${deliveryNote(res.delivery)}`);
    } catch (err) {
      setErrors(errorFields(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Crea tu cuenta"
      subtitle="Empieza vacía: solo verás los datos que tú registres."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <a className="font-medium text-brand underline-offset-4 hover:underline" href="#/login">
            Inicia sesión
          </a>
        </>
      }
    >
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <Field id="reg-name" label="Nombre" error={errors.name} hint="Para saludarte y para que tu contador te reconozca, si lo invitas.">
          <Input name="name" autoComplete="name" maxLength={100} value={f.name} onChange={set('name')} />
        </Field>
        <Field id="reg-email" label="Email" error={errors.email}>
          <Input type="email" name="email" autoComplete="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field id="reg-password" label="Contraseña" error={errors.password} hint={PASSWORD_HINT}>
          <Input type="password" name="password" autoComplete="new-password" value={f.password} onChange={set('password')} />
        </Field>
        <Field id="reg-password2" label="Repite la contraseña" error={errors.password2}>
          <Input type="password" name="password2" autoComplete="new-password" value={f.password2} onChange={set('password2')} />
        </Field>
        <LegalConsentFields idPrefix="reg" value={accept} onChange={setAccept} errors={errors} className="mt-1" />
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthCard>
  );
}
