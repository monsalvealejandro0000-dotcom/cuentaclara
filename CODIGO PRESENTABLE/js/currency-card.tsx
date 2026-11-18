import * as React from 'react';
import { Coins } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuthed } from '@/lib/session';
import { COMMON_CURRENCIES, currencyDigits, currencyName, sampleAmount } from '@/lib/format';
import type { Settings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, Inset } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Field, FormError } from '@/components/common';

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Configuración → Moneda: la moneda local con la que se muestran todos los importes. */
export function CurrencyCard() {
  const { settings, meta, setSettings } = useAuthed();
  const toast = useToast();
  const [code, setCode] = React.useState(settings.currency);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const all = React.useMemo(
    () => meta.currencies.map((c) => ({ code: c, name: currencyName(c) })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [meta.currencies],
  );
  const q = normalize(query);
  const matches = (o: { code: string; name: string }) => !q || normalize(o.name).includes(q) || o.code.toLowerCase().includes(q);
  const common = COMMON_CURRENCIES.map((c) => all.find((o) => o.code === c)).filter((o): o is { code: string; name: string } => !!o && matches(o));
  const rest = all.filter((o) => !COMMON_CURRENCIES.includes(o.code) && matches(o));
  const selected = all.find((o) => o.code === code) ?? { code, name: currencyName(code) };
  const selectedVisible = [...common, ...rest].some((o) => o.code === code);
  const digits = currencyDigits(code);
  const changed = code !== settings.currency;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { business_name, nif, address, default_vat_rate, default_irpf_rate, vat_responsible, vat_period } = settings;
      const res = await api<{ settings: Settings }>('/settings', {
        method: 'PUT',
        body: { business_name, nif, address, default_vat_rate, default_irpf_rate, vat_responsible, vat_period, currency: code },
      });
      setSettings(res.settings);
      toast(`Moneda cambiada a ${currencyName(code)} (${code})`);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <Coins className="size-[18px] text-muted-foreground" aria-hidden="true" /> Moneda
      </CardTitle>
      <CardDescription>La moneda local de tu país. Cambia el símbolo y el formato de todos los importes de la app.</CardDescription>
      <div className="mt-4 grid gap-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cur-search" label="Buscar moneda">
            <Input type="search" placeholder="Ej.: peso, dólar, MXN" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          <Field id="cur-select" label="Moneda">
            <NativeSelect name="currency" value={code} onChange={(e) => setCode(e.target.value)}>
              {!selectedVisible && (
                <option value={selected.code}>
                  {selected.name} ({selected.code})
                </option>
              )}
              {common.length > 0 && (
                <optgroup label="Más habituales">
                  {common.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </optgroup>
              )}
              {rest.length > 0 && (
                <optgroup label={q ? 'Resultados' : 'Todas las monedas'}>
                  {rest.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </optgroup>
              )}
            </NativeSelect>
          </Field>
        </div>
        {q && !common.length && !rest.length && <p className="text-sm text-muted-foreground">Ninguna moneda coincide con «{query}».</p>}
        <Inset className="flex flex-wrap items-end justify-between gap-3 px-4 py-3.5" aria-live="polite">
          <div>
            <div className="text-xs text-muted-foreground">Vista previa</div>
            <div className="tabular mt-1 text-2xl font-medium" data-testid="currency-preview">
              {sampleAmount(code)}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {selected.name} · {code}
            <br />
            {digits === 0 ? 'Sin decimales' : `${digits} decimales`}
          </div>
        </Inset>
        <p className="text-xs text-muted-foreground">
          Cambiar la moneda <b className="font-semibold text-foreground">no convierte</b> los importes que ya tienes registrados: solo cambia cómo se muestran.
          Los impuestos se calculan con las reglas de Colombia, que están en pesos (UVT): con otra moneda, la estimación de renta no es válida.
        </p>
        <div className="flex justify-end">
          <Button onClick={save} disabled={!changed || busy}>
            {busy ? 'Guardando…' : 'Guardar moneda'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
