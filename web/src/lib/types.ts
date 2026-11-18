/** `emailVerified` y `twoFactor`: fase 13 (docs/13-correo-y-segundo-factor.md). */
export type User = { id: number; email: string; name: string; emailVerified: boolean; twoFactor: boolean };

/** Cómo se entregan los correos: por Brevo, o en «modo local» (el enlace aparece en la ventana negra del servidor). */
export type MailDelivery = 'brevo' | 'local' | 'prueba';

export type SecurityEventType =
  | 'correo_confirmado'
  | 'correo_cambiado'
  | 'contrasena_cambiada'
  | 'contrasena_restablecida'
  | '2fa_activado'
  | '2fa_desactivado'
  | '2fa_quitado_admin'
  | 'codigos_nuevos'
  | 'codigo_respaldo_usado'
  | '2fa_bloqueado'
  | 'sesiones_cerradas_admin';

export type SecurityEvent = { id: number; type: SecurityEventType; label: string; detail: string; ip: string; userAgent: string; at: string };

/** GET /api/account/security */
export type SecurityInfo = {
  email: string;
  emailVerified: boolean;
  pendingEmail: string | null;
  delivery: MailDelivery;
  twoFactor: { enabled: boolean; since: string | null; backupCodesLeft: number };
  events: SecurityEvent[];
};

export type VatPeriodicity = 'cuatrimestral' | 'bimestral';

/** `nif` guarda el NIT o la cédula; `default_irpf_rate`, la retención en la fuente (nombres heredados). */
export type Settings = {
  business_name: string;
  nif: string;
  address: string;
  default_vat_rate: number;
  default_irpf_rate: number;
  vat_responsible: boolean;
  vat_period: VatPeriodicity;
  currency: string;
  /** Cargo opcional del saludo del Dashboard ("CEO"). */
  title: string;
  updated_at: string;
};

export type Uvt = { year: number; pesos: number; cents: number; official: boolean };

export type TaxMeta = {
  country: 'CO';
  uvt: Uvt;
  vatNotResponsibleUvt: number;
  vatBimonthlyUvt: number;
  exemptRate: number;
  exemptCapUvt: number;
  rentaTable: { from: number; to: number | null; rate: number; fixed: number }[];
};

export type Meta = {
  categories: { ingreso: string[]; gasto: string[] };
  vatRates: number[];
  irpfRates: number[];
  currencies: string[];
  tax: TaxMeta;
};

export type Amounts = { base: number; vat: number; irpf: number; total: number };

export type MovementType = 'ingreso' | 'gasto';

export type Movement = {
  id: number;
  type: MovementType;
  date: string;
  concept: string;
  category: string;
  base_cents: number;
  vat_rate: number;
  irpf_rate: number;
  deductible: boolean;
  notes: string;
  invoice_id: number | null;
  invoice_number: string | null;
  amounts: Amounts;
};

export type Totals = {
  count: number;
  income: number;
  expenses: number;
  deductibleExpenses: number;
  socialSecurity: number;
  vatOutput: number;
  vatInput: number;
  withholdings: number;
  cashIn: number;
  cashOut: number;
  profit: number;
  taxableProfit: number;
  vatNet: number;
  vatReserve: number;
  cashBalance: number;
};

export type MonthTotals = Totals & { rentaReserve: number; totalReserve: number; availableAfterTaxes: number };

export type RentaMethod = 'costos' | 'exenta25';

/** Renta del año acumulada hasta el mes (formulario 210, estimación). */
export type Renta = {
  year: number;
  from: string;
  to: string;
  income: number;
  method: RentaMethod;
  base: number;
  byCosts: number;
  byExempt: number;
  exempt: number;
  deductibleExpenses: number;
  socialSecurity: number;
  tax: number;
  marginalRate: number;
  withholdings: number;
  balance: number;
  reserve: number;
  uvt: Uvt;
};

/** Periodo de IVA (formulario 300). */
export type VatPeriod = {
  period: number;
  from: string;
  to: string;
  firstMonth: number;
  lastMonth: number;
  vatOutput: number;
  vatInput: number;
  vatNet: number;
  filingMonth: string;
};

export type Summary = {
  month: string;
  year: number;
  settingsComplete: boolean;
  hasMovements: boolean;
  tax: {
    country: 'CO';
    vatResponsible: boolean;
    vatPeriod: VatPeriodicity;
    currency: string;
    uvt: Uvt;
    rentaFiling: { from: string; to: string };
  };
  monthSummary: MonthTotals;
  yearToDate: Totals;
  renta: Renta;
  vatPeriods: VatPeriod[];
  currentVatPeriod: VatPeriod;
  series: { month: string; income: number; expenses: number; profit: number }[];
  pendingInvoices: { count: number; total_cents: number };
  recent: Movement[];
};

export type InvoiceStatus = 'pendiente' | 'cobrada';

export type Invoice = {
  id: number;
  year: number;
  seq: number;
  number: string;
  client_name: string;
  client_nif: string;
  client_address: string;
  issue_date: string;
  due_date: string | null;
  concept: string;
  base_cents: number;
  vat_rate: number;
  irpf_rate: number;
  status: InvoiceStatus;
  paid_date: string | null;
  notes: string;
  movement_id: number | null;
  amounts: Amounts;
};

export type EventCategory = 'reunion' | 'fiscal' | 'cobro' | 'otro';

export type CalendarEvent = {
  id: number;
  title: string;
  date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  category: EventCategory;
  notes: string;
};

/** Plan del usuario (fase 9). `today` es la fecha del servidor. */
export type Plan = {
  /** 'contador' incluye todo lo de Pro (fase 10). */
  tier: 'gratis' | 'pro' | 'contador';
  /** 'pago': lo compró con el cobro manual (fase 11). */
  source: 'prueba' | 'administrador' | 'pago' | null;
  until: string | null;
  /** Días de Pro que quedan contando hoy (el último día vale 1). */
  daysLeft: number | null;
  trialAvailable: boolean;
  trialEndedOn: string | null;
  trialDays: number;
  today: string;
};

/** Declaración con aviso (IVA formulario 300 o renta formulario 210). Importes en centésimas; negativo = a favor. */
export type Declaration = {
  key: string;
  kind: 'iva' | 'renta';
  form: '300' | '210';
  year: number;
  title: string;
  dueFrom: string;
  dueTo: string;
  windowFrom: string;
  windowTo: string;
  amount: number;
  /** IVA: hay ingresos o IVA descontable en el periodo (sin operaciones no se avisa). Renta: siempre true. */
  hasOperations: boolean;
  exactDate: string | null;
  eventId: number | null;
  daysUntil: number | null;
  filed: boolean;
  filedOn: string | null;
  enabled: boolean;
  active: boolean;
};

export type Reminders = {
  today: string;
  preferences: { vat: boolean; renta: boolean };
  vatResponsible: boolean;
  active: Declaration[];
  upcoming: Declaration[];
};

export type Report = {
  period: { kind: 'month' | 'year'; month: string | null; year: number; from: string; to: string };
  generatedOn: string;
  issuer: { name: string; nif: string; vatResponsible: boolean; vatPeriod: VatPeriodicity; currency: string };
  totals: Totals;
  vatPeriods: VatPeriod[];
  renta: Renta;
  expenseCategories: { name: string; total: number; count: number }[];
  invoices: { id: number; number: string; issue_date: string; client_name: string; status: InvoiceStatus; paid_date: string | null; amounts: Amounts }[];
  movements: Movement[];
  uvt: Uvt;
};

/** Cobro manual (fase 11): datos para pagar, de data/cobro.json. Precios en centavos de peso. */
export type PaymentConfig = {
  methods: { name: string; detail: string }[];
  contact: string;
  prices: { pro: number; contador: number };
  months: number[];
  reference: string;
};

export type PaidTier = 'pro' | 'contador';

export type Payment = {
  id: number;
  reference: string;
  tier: PaidTier;
  months: number;
  expected_cents: number;
  amount_cents: number;
  method: string;
  paid_on: string;
  receipt: string;
  note: string;
  status: 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado';
  reason: string;
  plan_until: string | null;
  created_at: string;
  reviewed_at: string | null;
};

/** Plan Contador (fase 10). Lo que ve el cliente de su contador. */
export type AccountantLink = {
  email: string;
  status: 'pendiente' | 'activo' | 'rechazado';
  name: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  lastAccessAt: string | null;
  /** Solo si está activo: si el contador tiene el plan Contador ahora. */
  accountantActive: boolean | null;
};

export type ClientInvitation = { id: number; name: string; email: string; invitedAt: string };

export type ClientRow = {
  id: number;
  name: string;
  nif: string;
  email: string;
  since: string | null;
  /** Moneda del cliente: la reserva se muestra con ella. */
  currency: string;
  reserve: number;
  next: Declaration | null;
  activeReminders: number;
};

/** `invitationsHidden`: el contador aún no confirma su correo y no ve las invitaciones (fase 13). */
export type ClientsData = { email: string; invitations: ClientInvitation[]; invitationsHidden?: boolean; clients: ClientRow[] };

/** Datos del cliente que necesita el modo cliente (solo lectura). `id` es el del vínculo. */
export type ClientProfile = {
  id: number;
  name: string;
  user_name: string;
  email: string;
  business_name: string;
  nif: string;
  address: string;
  vat_responsible: boolean;
  vat_period: VatPeriodicity;
  currency: string;
  since: string | null;
};

export type MonthPoint = { month: string; income: number; expenses: number; profit: number; incomeCount: number; expenseCount: number };

export type Analytics = {
  month: string;
  year: number;
  revenue: { month: string; income: number }[];
  monthly: { current: MonthPoint[]; previous: MonthPoint[] };
  periods: {
    key: 'month' | 'quarter' | 'year';
    label: string;
    from: string;
    to: string;
    income: number;
    expenses: number;
    profit: number;
    previous: { from: string; to: string; income: number; expenses: number; profit: number };
  }[];
  expenseCategories: { name: string; values: number[] }[];
  seasonality: {
    year: number;
    values: number[];
    total: number;
    activeMonths: number;
    incomeCount: number;
    profit: number;
    totalReserve: number;
  }[];
};

/* ---------------------------------------------------------------- legal y PQR (fase 12) */

export type LegalDocKey = 'terminos' | 'privacidad' | 'cookies' | 'reembolsos';

export type LegalDocMeta = { key: LegalDocKey; title: string; version: string; effective: string; sha256: string };

/** GET /api/legal: documentos vigentes y texto exacto de cada casilla de aceptación. */
export type LegalInfo = {
  docs: LegalDocMeta[];
  required: LegalDocKey[];
  labels: { terminos: string; privacidad: string; pagoTerminos: string; pagoPrivacidad: string; contador: string; contadorRevoca: string };
  sicUrl: string;
  contact: { email: string } | null;
  complete: boolean;
};

export type LegalDoc = LegalDocMeta & { text: string; complete: boolean };

export type ConsentRecord = {
  id: number;
  purpose: 'terminos' | 'privacidad' | 'reembolsos' | 'compartir_contador';
  action: 'acepta' | 'revoca';
  doc: LegalDocKey;
  docTitle: string;
  version: string;
  sha256: string;
  current: boolean;
  context: 'registro' | 'actualizacion' | 'pago' | 'contador';
  contextLabel: string;
  label: string;
  detail: string;
  ip: string;
  userAgent: string;
  at: string;
};

export type PqrType = 'peticion' | 'queja' | 'reclamo' | 'datos';

export type Pqr = {
  id: number;
  radicado: string;
  type: PqrType;
  subject: string;
  message: string;
  status: 'radicada' | 'respondida';
  response: string;
  createdAt: string;
  respondedAt: string | null;
};
