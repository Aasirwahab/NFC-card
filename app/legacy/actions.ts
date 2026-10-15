'use server';

import { headers } from 'next/headers';
import { serviceClient } from '@/lib/db/service';
import { type EarlyAccessState, earlyAccessSchema } from '@/lib/schemas/early-access';
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit';

/**
 * Saves an early access request from the home page.
 *
 * Applying twice with the same email updates the one row rather than adding a
 * second. The honeypot field (`website`) is invisible to people; a bot that fills
 * it is told "thank you" and nothing is saved, so it has no reason to retry.
 */
export async function requestEarlyAccess(
  _previous: EarlyAccessState,
  formData: FormData,
): Promise<EarlyAccessState> {
  if (formData.get('website')) return { done: true };

  const parsed = earlyAccessSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
    nextEvent: formData.get('nextEvent'),
    consent: formData.get('consent'),
    ref: formData.get('ref'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const limit = await checkRateLimit('earlyAccess', clientIp(await headers()));
  if (!limit.allowed) {
    return { error: 'Too many requests from this connection. Please try again later.' };
  }

  const { name, email, role, nextEvent, ref } = parsed.data;
  const { error } = await serviceClient()
    .from('early_access_requests')
    .upsert({ name, email, role, next_event: nextEvent, ref }, { onConflict: 'email' });

  if (error) {
    console.error(JSON.stringify({ event: 'early_access_save_failed', error: error.message }));
    return { error: 'Something went wrong, so nothing was saved. Please try again in a moment.' };
  }

  return { done: true };
}
