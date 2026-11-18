import * as React from 'react';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { LegalDocKey, User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormError, useFocusFirstError } from '@/components/common';
import { Logo, ThemeSwitch } from '@/components/app-shell';
import { LegalConsentFields, LegalFooter, legalVersions, type LegalAccept } from '@/components/legal';

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

type AuthResponse = { user: User; consent?: { pending: LegalDocKey[] } };

function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
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
  const { signIn } = useSession();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState({ email: '', password: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  useFocusFirstError(formRef, errors);

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
      const res = await api<AuthResponse>('/auth/login', { method: 'POST', body: f });
      await signIn(res.user, res.consent?.pending ?? []);
    } catch (err) {
      setErrors(errorFields(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Inicia sesión"
      subtitle="Tus ingresos, gastos e impuestos, al día."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <a className="font-medium text-brand underline-offset-4 hover:underline" href="#/registro">
            Crear cuenta
          </a>
        </>
      }
    >
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <Field id="login-email" label="Email" error={errors.email}>
          <Input type="email" name="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field id="login-password" label="Contraseña" error={errors.password}>
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
