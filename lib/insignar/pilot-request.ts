/**
 * The /insignar pilot form, as one early-access row.
 *
 * The landing form asks for name, work email, company and team size; the
 * existing early_access_requests table stores name, email, role, next_event and
 * ref. Company and team size go into `role` so nothing needs a migration.
 * PURE: validation and mapping only.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max + 1) : '';

export type PilotRow = {
  name: string;
  email: string;
  role: string;
  next_event: null;
  ref: string;
};

export function pilotRow(body: Record<string, unknown>): PilotRow | null {
  const name = clean(body.name, 100);
  const email = clean(body.email, 254).toLowerCase();
  const company = clean(body.company, 120);
  const team = clean(body.reps, 4);

  const bad =
    !name ||
    name.length > 100 ||
    !EMAIL.test(email) ||
    email.length > 254 ||
    !company ||
    company.length > 120 ||
    (team !== '' && !/^\d{1,4}$/.test(team));
  if (bad) return null;

  const role = `Pilot request · ${company}${team ? ` · team of ${team}` : ''}`.slice(0, 200);
  return { name, email, role, next_event: null, ref: 'insignar-landing' };
}
