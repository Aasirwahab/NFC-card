import 'server-only';
import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { getRep, type RepIdentity } from '@/lib/db/server';
import { isStaffEmail } from './staff-check';

/**
 * The operator console gate.
 *
 * Staff are the emails in STAFF_EMAILS. An empty list means nobody, so a missing
 * variable closes the console rather than opening it. A signed-in rep who is not
 * on the list gets a plain 404, the same as a page that does not exist, so the
 * area cannot be found by probing.
 */
export async function getStaff(): Promise<RepIdentity | null> {
  const rep = await getRep();
  if (!rep || !isStaffEmail(rep.email, env.STAFF_EMAILS)) return null;
  return rep;
}

/** For pages and server actions: not staff means 404. */
export async function requireStaff(): Promise<RepIdentity> {
  const staff = await getStaff();
  if (!staff) notFound();
  return staff;
}
