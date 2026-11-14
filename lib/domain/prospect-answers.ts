import { z } from 'zod';
import { comparable } from '@/lib/capture/reconcile';

const HOLDING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Only a first tap made within the last day carries a promise of a note. */
export function isProspectHolding(
  detailsCompletedAt: string | null,
  firstViewedAt: string | null,
  now = Date.now(),
): boolean {
  if (detailsCompletedAt || !firstViewedAt) return false;
  const age = now - Date.parse(firstViewedAt);
  return age >= 0 && age < HOLDING_WINDOW_MS;
}

export function normaliseProspectContact(
  value: string,
): { email: string | null; phone: string | null } | null {
  const email = value.trim().toLowerCase();
  if (email.length <= 254 && z.string().email().safeParse(email).success) {
    return { email, phone: null };
  }
  const phone = value.trim().replace(/[\s().-]/g, '');
  if (!/^(?:0|(?:\+|00)440?)7[1-57-9]\d{8}$/.test(phone)) return null;
  return { email: null, phone: `+44${comparable('phone', phone)}` };
}

/** "b•••@example.test" or "•••• ••• 23": enough to recognise it, never enough to read it. PURE. */
export function maskContact(email: string | null, phone: string | null): string | null {
  if (email) {
    const at = email.lastIndexOf('@');
    return at > 0 ? `${at > 2 ? email[0] : ''}•••${email.slice(at)}` : null;
  }
  return phone && phone.length >= 3 ? `•••• ••• ${phone.slice(-2)}` : null;
}

export const prospectAnswersSchema = z
  .object({
    problems: z
      .array(z.string().min(1).max(200))
      .max(2)
      .refine((choices) => new Set(choices).size === choices.length)
      .optional(),
    contact: z
      .string()
      .trim()
      .max(254)
      .refine((value) => normaliseProspectContact(value) !== null)
      .optional(),
    consent: z.boolean().optional(),
  })
  .strict()
  .refine((data) => data.problems !== undefined || data.contact !== undefined)
  .refine((data) =>
    data.contact === undefined ? data.consent === undefined : data.consent === true,
  );
