import { getPlan, startTrial } from '../plans.js';

/** Plan del usuario y prueba gratis de Pro. */
export function registerPlanRoutes(router, { db, today }) {
  router.get('/api/plan', ({ user }) => ({ plan: getPlan(db, user.id, today()) }));

  router.post('/api/plan/trial', ({ user }) => ({ plan: startTrial(db, user.id, today()) }));
}
