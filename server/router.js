export const REPLY = Symbol('reply');

/** Respuesta con código distinto de 200 (p. ej. 201 al crear). */
export const reply = (status, data) => ({ [REPLY]: true, status, data });

export class Router {
  constructor() {
    this.routes = [];
  }

  /**
   * `auth`: exige sesión. `consent: false`: se puede usar sin haber aceptado la versión vigente de los
   * documentos legales (aceptarlos, leerlos, PQR, eliminar la cuenta).
   */
  add(method, pattern, handler, { auth = true, consent = true } = {}) {
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    this.routes.push({ method, re: new RegExp(`^${source}/?$`), keys, handler, auth, consent });
  }

  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  delete(p, h, o) { this.add('DELETE', p, h, o); }

  match(method, pathname) {
    let pathExists = false;
    for (const route of this.routes) {
      const m = route.re.exec(pathname);
      if (!m) continue;
      pathExists = true;
      if (route.method !== method) continue;
      const params = {};
      try {
        route.keys.forEach((k, i) => {
          params[k] = decodeURIComponent(m[i + 1]);
        });
      } catch {
        return null; // «%E0%A4%A» y similares: no es una ruta válida (404, nunca 500)
      }
      return { route, params };
    }
    return pathExists ? { methodNotAllowed: true } : null;
  }
}
