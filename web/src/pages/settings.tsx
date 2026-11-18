import * as React from 'react';
import { LogOut } from 'lucide-react';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import type { Settings, VatPeriodicity } from '@/lib/types';
import { pesos, uvtText, VAT_LABELS, VAT_PERIOD_LABELS, WITHHOLDING_LABELS } from '@/lib/tax';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { SegmentedRadio } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { Field, FormError, PageHeader, useFocusFirstError } from '@/components/common';
import { RateOptions } from '@/components/movement-dialog';
import { ThemeSwitch } from '@/components/app-shell';
import { CurrencyCard } from '@/components/currency-card';
import { PlanCard } from '@/components/plan';
import { RemindersCard } from '@/components/reminders';
import { AccountantCard } from '@/components/accountant';
import { greetingName } from '@/pages/dashboard';
import { PASSWORD_HINT, passwordError } from '@/pages/auth';
import { PrivacyCard } from '@/components/privacy-card';
import { EmailCard, SecurityActivityCard, TwoFactorCard } from '@/components/security';
import { useLoad } from '@/lib/use-load';
import type { SecurityInfo } from '@/lib/types';

export function SettingsPage() {
  const { user, settings, meta, setSettings, signOut } = useAuthed();
  const toast = useToast();
  const { uvt } = meta.tax;
  // Fase 13: correo, verificación en dos pasos y actividad de seguridad.
  const security = useLoad(() => api<SecurityInfo>('/account/security'), [user.email, user.emailVerified, user.twoFactor]);

  // --- Datos fiscales e impuestos (Colombia)
  const fiscalRef = React.useRef<HTMLFormElement>(null);
  const [f, setF] = React.useState(() => ({
    business_name: settings.business_name,
    nif: settings.nif,
    address: settings.address,
    default_vat_rate: settings.default_vat_rate,
    default_irpf_rate: settings.default_irpf_rate,
    vat_responsible: settings.vat_responsible,
    vat_period: settings.vat_period,
  }));
  const [fErrors, setFErrors] = React.useState<Record<string, string>>({});
  const [fError, setFError] = React.useState<string | null>(null);
  const [fBusy, setFBusy] = React.useState(false);
  useFocusFirstError(fiscalRef, fErrors);

  // Quien no es responsable no cobra IVA: su IVA por defecto pasa a 0 % (y vuelve al 19 % si lo es).
  const setResponsible = (yes: boolean) =>
    setF((s) => ({
      ...s,
      vat_responsible: yes,
      default_vat_rate: !yes ? 0 : s.default_vat_rate === 0 ? 19 : s.default_vat_rate,
    }));

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setFError(null);
    setFErrors({});
    setFBusy(true);
    try {
      const res = await api<{ settings: Settings }>('/settings', {
        method: 'PUT',
        body: { ...f, default_vat_rate: Number(f.default_vat_rate), default_irpf_rate: Number(f.default_irpf_rate) },
      });
      setSettings(res.settings);
      setF((s) => ({ ...s, nif: res.settings.nif }));
      toast('Configuración guardada');
    } catch (err) {
      setFErrors(errorFields(err));
      setFError(errorMessage(err));
    }
    setFBusy(false);
  }

  // --- Contraseña
  const pwRef = React.useRef<HTMLFormElement>(null);
  const [pw, setPw] = React.useState({ current_password: '', new_password: '', new_password2: '' });
  const [pwErrors, setPwErrors] = React.useState<Record<string, string>>({});
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);
  useFocusFirstError(pwRef, pwErrors);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!pw.current_password) errs.current_password = 'Escribe tu contraseña actual';
    const newError = passwordError(pw.new_password);
    if (newError) errs.new_password = newError;
    if (pw.new_password2 !== pw.new_password) errs.new_password2 = 'Las contraseñas no coinciden';
    setPwError(null);
    setPwErrors(errs);
    if (Object.keys(errs).length) return;
    setPwBusy(true);
    try {
      await api('/account/password', { method: 'PUT', body: { current_password: pw.current_password, new_password: pw.new_password } });
      setPw({ current_password: '', new_password: '', new_password2: '' });
      toast('Contraseña cambiada. Te enviamos un aviso a tu correo.');
      security.reload();
    } catch (err) {
      setPwErrors(errorFields(err));
      setPwError(errorMessage(err));
    }
    setPwBusy(false);
  }

  const [deleting, setDeleting] = React.useState(false);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* se cierra igualmente en el navegador */
    }
    signOut();
  }

  return (
    <>
      <PageHeader title="Configuración" description="Tus datos tributarios y cómo se calculan tus impuestos en Colombia." />
      <div className="grid max-w-3xl gap-4">
        <PlanCard />

        <Card>
          <form ref={fiscalRef} noValidate onSubmit={saveSettings} className="grid gap-4">
            <div>
              <CardTitle>Datos tributarios</CardTitle>
              <CardDescription>Solo para que aparezcan como emisor en tus facturas y cuentas de cobro. Si no emites facturas desde la app, puedes dejarlos vacíos.</CardDescription>
            </div>
            <FormError message={fError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="s-name" label={<>Nombre o razón social <span className="text-muted-foreground">(opcional)</span></>} error={fErrors.business_name}>
                <Input name="business_name" maxLength={200} autoComplete="organization" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} />
              </Field>
              <Field id="s-nif" label={<>NIT o cédula <span className="text-muted-foreground">(opcional)</span></>} error={fErrors.nif}>
                <Input name="nif" maxLength={20} inputMode="text" placeholder="Ej.: 1020304050-1" value={f.nif} onChange={(e) => setF({ ...f, nif: e.target.value })} />
              </Field>
            </div>
            <Field id="s-address" label={<>Dirección <span className="text-muted-foreground">(opcional)</span></>} error={fErrors.address}>
              <Textarea name="address" rows={2} maxLength={300} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>

            <div className="mt-2">
              <CardTitle>Impuestos en Colombia</CardTitle>
              <CardDescription>
                Con estos datos se calcula cuánto reservar. UVT {uvt.year}: {pesos(uvt.pesos)}.
              </CardDescription>
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium" aria-hidden="true">
                ¿Eres responsable de IVA?
              </span>
              <SegmentedRadio
                name="vat_responsible"
                label="¿Eres responsable de IVA?"
                className="max-w-[260px]"
                value={f.vat_responsible ? 'si' : 'no'}
                onChange={(v) => setResponsible(v === 'si')}
                options={[
                  { value: 'si', label: 'Sí' },
                  { value: 'no', label: 'No' },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                No eres responsable si tus ingresos por la actividad fueron menores de {uvtText(meta.tax.vatNotResponsibleUvt, uvt.pesos)} el año pasado y
                lo van siendo este año, y cumples los demás requisitos del art. 437 del Estatuto Tributario. Si no lo eres, no cobras IVA y el IVA de tus
                compras forma parte del costo.
              </p>
            </div>
            {f.vat_responsible && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="s-vat-period"
                  label="Declaración de IVA (formulario 300)"
                  error={fErrors.vat_period}
                  hint={`Bimestral si el año pasado tus ingresos brutos llegaron a ${uvtText(meta.tax.vatBimonthlyUvt, uvt.pesos)} o eres gran contribuyente; si no, cuatrimestral.`}
                >
                  <NativeSelect name="vat_period" value={f.vat_period} onChange={(e) => setF({ ...f, vat_period: e.target.value as VatPeriodicity })}>
                    {(Object.keys(VAT_PERIOD_LABELS) as VatPeriodicity[]).map((p) => (
                      <option key={p} value={p}>
                        {VAT_PERIOD_LABELS[p]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="s-vat" label="IVA por defecto" error={fErrors.default_vat_rate}>
                  <NativeSelect name="default_vat_rate" value={f.default_vat_rate} onChange={(e) => setF({ ...f, default_vat_rate: Number(e.target.value) })}>
                    <RateOptions rates={meta.vatRates} selected={Number(f.default_vat_rate)} labels={VAT_LABELS} />
                  </NativeSelect>
                </Field>
              </div>
            )}
            <Field
              id="s-irpf"
              label="Retención en la fuente que te aplican"
              error={fErrors.default_irpf_rate}
              hint="La descuenta tu cliente al pagarte y se resta de tu impuesto de renta. Usa la de tu certificado de retención."
            >
              <NativeSelect name="default_irpf_rate" className="sm:max-w-[420px]" value={f.default_irpf_rate} onChange={(e) => setF({ ...f, default_irpf_rate: Number(e.target.value) })}>
                <RateOptions rates={meta.irpfRates} selected={Number(f.default_irpf_rate)} labels={WITHHOLDING_LABELS} />
              </NativeSelect>
            </Field>
            <Inset className="px-4 py-3.5 text-sm text-muted-foreground">
              <b className="font-semibold text-foreground">Impuesto de renta:</b> se estima solo, con la tabla del art. 241 del Estatuto Tributario sobre lo que
              llevas del año. Se usa el camino más favorable para un independiente: restar tus costos y gastos, o restar tus aportes a salud y pensión y aplicar la
              renta exenta del {meta.tax.exemptRate} % (máximo {uvtText(meta.tax.exemptCapUvt, uvt.pesos)} al año). Las retenciones que te practicaron se descuentan.
            </Inset>
            <div className="flex justify-end">
              <Button type="submit" disabled={fBusy}>
                {fBusy ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </Card>

        <RemindersCard />

        <AccountantCard />

        <CurrencyCard />

        <Card>
          <CardTitle>Apariencia</CardTitle>
          <CardDescription>Claro, oscuro o el mismo que tu sistema. Se recuerda en este navegador.</CardDescription>
          <ThemeSwitch className="mt-4 max-w-[220px]" />
        </Card>

        <EmailCard security={security} />

        <Card>
          <form ref={pwRef} noValidate onSubmit={changePassword} className="grid gap-4">
            <div>
              <CardTitle>Cambiar contraseña</CardTitle>
              <CardDescription>Al cambiarla se cerrarán tus sesiones en otros dispositivos.</CardDescription>
            </div>
            <FormError message={pwError} />
            <Field id="p-current" label="Contraseña actual" error={pwErrors.current_password}>
              <Input type="password" name="current_password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="p-new" label="Nueva contraseña" error={pwErrors.new_password} hint={PASSWORD_HINT}>
                <Input type="password" name="new_password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              </Field>
              <Field id="p-new2" label="Repite la nueva contraseña" error={pwErrors.new_password2}>
                <Input type="password" name="new_password2" autoComplete="new-password" value={pw.new_password2} onChange={(e) => setPw({ ...pw, new_password2: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pwBusy}>
                {pwBusy ? 'Guardando…' : 'Cambiar contraseña'}
              </Button>
            </div>
          </form>
        </Card>

        <TwoFactorCard security={security} />

        <SecurityActivityCard security={security} />

        <Card>
          <CardTitle>Sesión</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Conectado como <b className="font-semibold text-foreground">{user.name}</b> ({user.email}).
          </p>
          <GreetingTitleForm />
          <Button variant="outline" className="mt-4" onClick={logout}>
            <LogOut /> Cerrar sesión
          </Button>
        </Card>

        <PrivacyCard />

        <Card className="border-negative/35">
          <CardTitle>Eliminar cuenta</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Se borrarán tu cuenta y todos tus movimientos, facturas, eventos, avisos de pago y configuración. No se puede deshacer. Solo se conservan la prueba de tus aceptaciones y tus PQR, como explica la Política de privacidad.</p>
          <Button variant="destructive" className="mt-4" onClick={() => setDeleting(true)}>
            Eliminar mi cuenta…
          </Button>
        </Card>
      </div>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </>
  );
}

/** Cargo opcional del saludo del Dashboard («Hola CEO Alejandro Monsalve»). */
function GreetingTitleForm() {
  const { user, settings, setSettings } = useAuthed();
  const toast = useToast();
  // `?? ''`: un servidor arrancado antes de este cambio todavía no envía el cargo.
  const saved = settings.title ?? '';
  const [title, setTitle] = React.useState(saved);
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const { business_name, nif, address, default_vat_rate, default_irpf_rate, vat_responsible, vat_period, currency } = settings;
      const res = await api<{ settings: Settings }>('/settings', {
        method: 'PUT',
        body: { business_name, nif, address, default_vat_rate, default_irpf_rate, vat_responsible, vat_period, currency, title },
      });
      setSettings(res.settings);
      setTitle(res.settings.title ?? '');
      toast('Saludo guardado');
    } catch (err) {
      setError(errorFields(err).title ?? errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <form noValidate onSubmit={save} className="mt-4 grid gap-3 border-t border-border pt-4">
      <Field id="s-title" label="Cargo en el saludo (opcional)" error={error} hint={`El Dashboard te saluda así: «Hola ${greetingName(user.name, title)}».`}>
        <Input name="title" maxLength={40} placeholder="Ej.: CEO, Diseñadora, Consultor" value={title} onChange={(e) => (setTitle(e.target.value), setError(undefined))} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={busy || title.trim() === saved}>
          {busy ? 'Guardando…' : 'Guardar saludo'}
        </Button>
      </div>
    </form>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuthed();
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
      signOut();
    } catch (err) {
      setError(errorFields(err).password ?? errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Eliminar cuenta" size="sm">
      <form noValidate onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Se eliminarán <b className="text-foreground">todos</b> tus datos. Escribe tu contraseña para confirmar.
        </p>
        <Field id="del-password" label="Contraseña" error={error}>
          <Input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <DialogActions>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" disabled={busy}>
            {busy ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
