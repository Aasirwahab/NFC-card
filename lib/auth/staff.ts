import 'server-only';
import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { createAuthClient, type RepIdentity } from '@/lib/db/server';
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
  const supabase = await createAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) return null;

  // An address nobody has proved they own must never grant staff access, whether
  // it came from a sign-up or from an email change.
  if (!user.email_confirmed_at) return null;
  if (!isStaffEmail(user.email, env.STAFF_EMAILS)) return null;
  return { userId: user.id, email: user.email };
}

/** For pages and server actions: not staff means 404. */
export async function requireStaff(): Promise<RepIdentity> {
  const staff = await getStaff();
  if (!staff) notFound();
  return staff;
}
