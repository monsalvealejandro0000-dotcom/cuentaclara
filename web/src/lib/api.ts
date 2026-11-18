export class ApiError extends Error {
  status: number;
  code?: string;
  fields: Record<string, string>;
  constructor(status: number, error?: { message?: string; code?: string; fields?: Record<string, string> }) {
    super(error?.message || `Error ${status}`);
    this.status = status;
    this.code = error?.code;
    this.fields = error?.fields || {};
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

let onConsentRequired: () => void = () => {};
/** El servidor pide aceptar una versión nueva de los términos o de la política de privacidad (403 CONSENT_REQUIRED). */
export function setConsentRequiredHandler(fn: () => void) {
  onConsentRequired = fn;
}

/** Llama a /api{path}. Lanza ApiError con el mensaje del servidor si la respuesta no es 2xx. */
export async function api<T = unknown>(path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, {
      code: 'NETWORK',
      message: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.',
    });
  }
  if (res.status === 204) return null as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error);
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    if (res.status === 403 && err.code === 'CONSENT_REQUIRED') onConsentRequired();
    throw err;
  }
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Ha ocurrido un error inesperado');
export const errorFields = (err: unknown) => (err instanceof ApiError ? err.fields : {});
