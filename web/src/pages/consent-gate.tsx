import * as React from 'react';
import { LogOut } from 'lucide-react';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Field, FormError } from '@/components/common';
import { Logo, ThemeSwitch } from '@/components/app-shell';
import { DOC_SHORT, LegalConsentFields, LegalFooter, legalHref, legalVersions, type LegalAccept } from '@/components/legal';
import { dayLabel } from '@/components/plan';

/**
 * Pantalla de aceptación (fase 12). Aparece al entrar si la cuenta no ha aceptado la versión vigente de los
 * términos o de la política de privacidad: cuentas creadas antes de publicarlos o tras un cambio.
 * Hasta aceptar no se ve ningún dato. También se puede cerrar sesión o eliminar la cuenta.
 */
export function ConsentGate() {
  const { user, legal, consentPending, consentAccepted, signOut } = useSession();
  const toast = useToast();
  const [accept, setAccept] = React.useState<LegalAccept>({ terms: false, privacy: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!accept.terms) errs.accept_terms = 'Para seguir debes aceptar los Términos y condiciones';
    if (!accept.privacy) errs.accept_privacy = 'Para seguir debes autorizar el tratamiento de tus datos';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api('/consents', { method: 'POST', body: { accept_terms: true, accept_privacy: true, versions: legalVersions(legal, ['terminos', 'privacidad']) } });
      await consentAccepted();
      toast('Gracias. Ya puedes seguir usando CuentaClara.');
    } catch (err) {
      setErrors(errorFields(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* se cierra igualmente en el navegador */
    }
    signOut();
  }

  const docs = legal?.docs.filter((d) => consentPending.includes(d.key)) ?? [];

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-8">
          <Logo />
          <h1 className="mt-7 text-[26px] font-semibold tracking-[-0.035em]">Antes de seguir</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hola{user ? `, ${user.name}` : ''}. Publicamos o actualizamos los documentos que rigen el uso de CuentaClara. Léelos y acéptalos para seguir. Tus datos están intactos.
          </p>
          <ul className="mt-4 grid gap-2">
            {docs.map((d) => (
              <li key={d.key} className="flex flex-wrap items-baseline justify-between gap-2 rounded-[18px] border border-border bg-muted/40 px-4 py-3 text-sm">
                <span className="font-medium">{DOC_SHORT[d.key]}</span>
                <span className="text-xs text-muted-foreground">
                  versión del {dayLabel(d.effective)} ·{' '}
                  <a className="font-medium text-brand underline-offset-4 hover:underline" href={legalHref(d.key)} target="_blank" rel="noopener">
                    Leer
                  </a>
                </span>
              </li>
            ))}
          </ul>
          <form noValidate onSubmit={submit} className="mt-6 grid gap-4">
            <FormError message={formError} />
            <LegalConsentFields idPrefix="gate" value={accept} onChange={setAccept} errors={errors} />
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Guardando…' : 'Aceptar y continuar'}
            </Button>
          </form>
          <div className="mt-6 border-t border-border pt-5">
            {!leaving ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" onClick={logout}>
                  <LogOut /> Cerrar sesión
                </Button>
                <Button variant="ghost" onClick={() => setLeaving(true)}>
                  No estoy de acuerdo
                </Button>
              </div>
            ) : (
              <DeleteInstead onCancel={() => setLeaving(false)} onDeleted={signOut} />
            )}
            {legal?.contact && <p className="mt-4 text-xs text-muted-foreground">¿Dudas? Escríbenos a {legal.contact.email}.</p>}
          </div>
        </div>
        <LegalFooter className="mt-5" />
        <ThemeSwitch className="mx-auto mt-4 w-40" />
      </div>
    </div>
  );
}

/** Si no acepta: puede cerrar sesión (sus datos siguen guardados) o eliminar su cuenta con todos sus datos. */
function DeleteInstead({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return setError('Escribe tu contraseña');
    setBusy(true);
    try {
      await api('/account', { method: 'DELETE', body: { password } });
      toast('Tu cuenta y todos sus datos se han eliminado');
      onDeleted();
    } catch (err) {
      setError(errorFields(err).password ?? errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Si no aceptas, puedes <b className="text-foreground">cerrar sesión</b> (tus datos siguen guardados y podrás aceptar más adelante) o{' '}
        <b className="text-foreground">eliminar tu cuenta</b> con todos sus datos. Si tienes un plan pagado vigente, antes pide el reembolso proporcional en{' '}
        <a className="font-medium text-brand underline-offset-4 hover:underline" href="#/pqr">
          Peticiones, quejas y reclamos
        </a>
        .
      </p>
      <Field id="gate-del-password" label="Contraseña, para eliminar tu cuenta" error={error}>
        <Input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Volver
        </Button>
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy ? 'Eliminando…' : 'Eliminar mi cuenta y mis datos'}
        </Button>
      </div>
    </form>
  );
}
