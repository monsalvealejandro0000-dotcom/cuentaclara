import * as React from 'react';
import { CircleCheck, CircleAlert, Loader2 } from 'lucide-react';
import { api, ApiError, errorFields, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { navigate, replaceUrl } from '@/lib/router';
import type { MailDelivery } from '@/lib/types';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormError, useFocusFirstError } from '@/components/common';
import { LOCAL_MAIL_NOTE } from '@/components/security';
import { AuthCard, PASSWORD_HINT, passwordError } from '@/pages/auth';

/* ------------------------------------------------------------------ */
/*  Fase 13: pantallas que se abren desde los correos (o para pedir     */
/*  uno). El código del enlace va después del «#»: nunca llega al       */
/*  servidor en la dirección y se quita del historial al abrirla.       */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lee el código del enlace una sola vez y lo quita de la dirección (no queda en el historial). */
function useLinkToken(query: URLSearchParams, route: string) {
  const [token] = React.useState(() => query.get('t') ?? '');
  React.useEffect(() => {
    if (query.has('t')) replaceUrl(route);
  }, [query, route]);
  return token;
}

function Result({ ok, title, children, actions }: { ok: boolean; title: string; children?: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="grid gap-4" role={ok ? 'status' : 'alert'}>
      <p className="flex items-start gap-2 text-[15px] font-semibold">
        {ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-negative-ink" aria-hidden="true" />}
        {title}
      </p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
      <div className="grid gap-2">{actions}</div>
    </div>
  );
}

const back = (
  <>
    ¿Te acordaste?{' '}
    <a className="font-medium text-brand underline-offset-4 hover:underline" href="#/login">
      Inicia sesión
    </a>
  </>
);

/** #/recuperar — «¿Olvidaste tu contraseña?». La respuesta es la misma exista o no la cuenta. */
export function ForgotPasswordPage() {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState<{ email: string; delivery: MailDelivery } | null>(null);
  useFocusFirstError(formRef, { email: error });

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = (sent?.email ?? email).trim();
    if (!EMAIL_RE.test(value)) return setError('Escribe un correo válido');
    setError(undefined);
    setFormError(null);
    setBusy(true);
    try {
      const r = await api<{ delivery: MailDelivery }>('/auth/password/forgot', { method: 'POST', body: { email: value } });
      setSent({ email: value, delivery: r.delivery });
    } catch (err) {
      const fields = errorFields(err);
      if (fields.email) setError(fields.email);
      else setFormError(errorMessage(err));
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <AuthCard title="Revisa tu correo" subtitle="Te enviamos las instrucciones." footer={back}>
        <Result
          ok
          title="Listo"
          actions={
            <>
              <ButtonLink href="#/login" size="lg" className="w-full">
                Volver a iniciar sesión
              </ButtonLink>
              <Button variant="ghost" onClick={() => submit()} disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar otra vez'}
              </Button>
            </>
          }
        >
          <p>
            Si hay una cuenta con <b className="break-all text-foreground">{sent.email}</b>, te enviamos un enlace para crear una contraseña nueva. Vence en 30 minutos. Si no lo
            ves, mira en la carpeta de spam.
          </p>
          {sent.delivery === 'local' && <p className="mt-2">{LOCAL_MAIL_NOTE}</p>}
        </Result>
        <FormError message={formError} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="¿Olvidaste tu contraseña?" subtitle="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva." footer={back}>
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        <Field id="fp-email" label="Email" error={error}>
          <Input type="email" name="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar enlace'}
        </Button>
      </form>
    </AuthCard>
  );
}

/** #/restablecer?t=… — contraseña nueva con el enlace del correo. Se abre con o sin sesión. */
export function ResetPasswordPage({ query }: { query: URLSearchParams }) {
  const { user, signOut } = useSession();
  const token = useLinkToken(query, '/restablecer');
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, setState] = React.useState<'checking' | 'form' | 'invalid' | 'done'>(token ? 'checking' : 'invalid');
  const [email, setEmail] = React.useState('');
  const [f, setF] = React.useState({ password: '', password2: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  useFocusFirstError(formRef, errors);

  React.useEffect(() => {
    if (!token) return;
    let alive = true;
    api<{ email: string }>('/auth/password/reset/check', { method: 'POST', body: { token } })
      .then((r) => alive && (setEmail(r.email), setState('form')))
      .catch(() => alive && setState('invalid'));
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const pwError = passwordError(f.password);
    if (pwError) errs.password = pwError;
    if (f.password2 !== f.password) errs.password2 = 'Las contraseñas no coinciden';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api('/auth/password/reset', { method: 'POST', body: { token, password: f.password } });
      // El servidor cerró todas las sesiones, también la de este navegador.
      if (user) signOut(null);
      setState('done');
    } catch (err) {
      const fields = errorFields(err);
      if (Object.keys(fields).length) setErrors(fields);
      else if (err instanceof ApiError && err.code === 'TOKEN_INVALID') setState('invalid');
      else setFormError(errorMessage(err));
    }
    setBusy(false);
  }

  const footer = (
    <a className="font-medium text-brand underline-offset-4 hover:underline" href="#/login">
      Volver a iniciar sesión
    </a>
  );

  if (state === 'checking') {
    return (
      <AuthCard title="Crea una contraseña nueva" subtitle="Comprobando el enlace…" footer={footer}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Un momento…
        </p>
      </AuthCard>
    );
  }
  if (state === 'invalid') {
    return (
      <AuthCard title="Este enlace ya no sirve" subtitle="Los enlaces vencen a los 30 minutos y solo se pueden usar una vez." footer={footer}>
        <Result
          ok={false}
          title="Pide un enlace nuevo"
          actions={
            <ButtonLink href="#/recuperar" size="lg" className="w-full">
              Pedir otro enlace
            </ButtonLink>
          }
        >
          Si abriste el enlace dos veces o recargaste la página, también deja de servir: pide otro.
        </Result>
      </AuthCard>
    );
  }
  if (state === 'done') {
    return (
      <AuthCard title="Contraseña cambiada" subtitle="Ya puedes entrar con la nueva." footer={null}>
        <Result
          ok
          title="Tu contraseña cambió"
          actions={
            <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
              Iniciar sesión
            </Button>
          }
        >
          Por seguridad, cerramos tu sesión en todos tus dispositivos. Te enviamos un aviso a tu correo.
        </Result>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Crea una contraseña nueva" subtitle={`Para ${email}`} footer={footer}>
      <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
        <FormError message={formError} />
        {/* Campo oculto con el usuario: los gestores de contraseñas guardan la nueva con el correo correcto. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field id="rp-password" label="Nueva contraseña" error={errors.password} hint={PASSWORD_HINT}>
          <Input type="password" name="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field id="rp-password2" label="Repite la contraseña" error={errors.password2}>
          <Input type="password" name="password2" autoComplete="new-password" value={f.password2} onChange={(e) => setF({ ...f, password2: e.target.value })} />
        </Field>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </form>
    </AuthCard>
  );
}

type Confirmed = { status: 'confirmado' | 'ya_confirmado' | 'cambiado'; email: string };

/** #/confirmar-correo?t=… — se confirma sola al abrirla, con o sin sesión. */
export function ConfirmEmailPage({ query }: { query: URLSearchParams }) {
  const { user, refreshUser } = useSession();
  const token = useLinkToken(query, '/confirmar-correo');
  const [result, setResult] = React.useState<Confirmed | 'error' | null>(token ? null : 'error');
  const [message, setMessage] = React.useState<string | null>(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // una sola vez, también en desarrollo (React monta dos veces)
    api<Confirmed>('/auth/email/confirm', { method: 'POST', body: { token } })
      .then(async (r) => {
        setResult(r);
        await refreshUser();
      })
      .catch((err) => {
        setMessage(err instanceof ApiError && err.code === 'TOKEN_INVALID' ? null : errorMessage(err));
        setResult('error');
      });
  }, [token, refreshUser]);

  const go = user ? (
    <ButtonLink href="#/dashboard" size="lg" className="w-full">
      Ir a CuentaClara
    </ButtonLink>
  ) : (
    <ButtonLink href="#/login" size="lg" className="w-full">
      Iniciar sesión
    </ButtonLink>
  );

  if (!result) {
    return (
      <AuthCard title="Confirmando tu correo…" subtitle="Un momento." footer={null}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Comprobando el enlace…
        </p>
      </AuthCard>
    );
  }
  if (result === 'error') {
    return (
      <AuthCard title="Este enlace ya no sirve" subtitle="Venció, ya se usó o está incompleto." footer={null}>
        <Result ok={false} title={message ?? 'Pide un enlace nuevo'} actions={go}>
          Puedes pedir otro desde el aviso «Confirma tu correo» de CuentaClara o desde Configuración → Correo.
        </Result>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={result.status === 'cambiado' ? 'Correo cambiado' : 'Correo confirmado'} subtitle="Gracias." footer={null}>
      <Result
        ok
        title={
          result.status === 'cambiado'
            ? `Tu correo ahora es ${result.email}`
            : result.status === 'ya_confirmado'
              ? `Tu correo ${result.email} ya estaba confirmado`
              : `Tu correo ${result.email} quedó confirmado`
        }
        actions={go}
      >
        {result.status === 'cambiado' ? 'Desde ahora entras con este correo y te escribimos aquí.' : 'Ya puedes recuperar tu cuenta con él si olvidas la contraseña.'}
      </Result>
    </AuthCard>
  );
}
