import type { CardFields } from '@/lib/capture/card';

/**
 * Cards against what the rep already typed. A scan never overwrites typing: an empty
 * field is filled, an equal one is ticked, a different one is put to the rep as a
 * question ("The card says X, you typed Y"). PURE.
 */

export type ReconciledField = 'name' | 'company' | 'email' | 'phone' | 'website';
export type FormValues = Record<ReconciledField, string>;
export type CardConflict = { field: ReconciledField; typed: string; card: string };
export type Reconciled = {
  fill: Partial<FormValues>;
  matched: ReconciledField[];
  conflicts: CardConflict[];
};

const FIELDS: ReconciledField[] = ['name', 'company', 'email', 'phone', 'website'];

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const LEGAL_SUFFIX = /\s(ltd|limited|llp|llc|inc|plc|corp|co)$/;

/** The form of a value used only to ask "is this the same thing?". */
export function comparable(field: ReconciledField, value: string): string {
  const v = value.trim();
  switch (field) {
    case 'email':
      return v.toLowerCase();
    case 'phone': {
      const digits = v.replace(/\D/g, '');
      return digits.slice(-9); // 07… and +44 7… are the same number
    }
    case 'website':
      return v
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[/?#].*$/, '');
    case 'company':
      return fold(v)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(LEGAL_SUFFIX, '');
    default:
      return fold(v)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
  }
}

export function reconcileCard(current: FormValues, card: CardFields): Reconciled {
  const out: Reconciled = { fill: {}, matched: [], conflicts: [] };
  for (const field of FIELDS) {
    const fromCard = card[field]?.trim();
    if (!fromCard) continue;
    const typed = current[field].trim();
    if (!typed) out.fill[field] = fromCard;
    else if (comparable(field, typed) === comparable(field, fromCard)) out.matched.push(field);
    else out.conflicts.push({ field, typed, card: fromCard });
  }
  return out;
}

/**
 * A pasted link in a text box: LinkedIn profile or website. Only an obvious link counts
 * (a scheme, www., or a LinkedIn path), so a company called "Booking.com" typed as text stays text.
 */
export function classifyLink(text: string): { kind: 'linkedin' | 'website'; value: string } | null {
  const t = text.trim();
  if (!t || /\s/.test(t) || t.includes('@')) return null;
  const hasScheme = /^https?:\/\//i.test(t);
  const www = /^www\./i.test(t);
  const linkedin = /(^|\/\/|\.)linkedin\.com\/in\/[^/?#\s]+/i.test(t);
  if (!hasScheme && !www && !linkedin) return null;
  try {
    const u = new URL(hasScheme ? t : `https://${t}`);
    if (!u.hostname.includes('.')) return null;
    if (/(^|\.)linkedin\.com$/i.test(u.hostname)) {
      const m = u.pathname.match(/^\/in\/([^/?#]+)/i);
      return m ? { kind: 'linkedin', value: `https://www.linkedin.com/in/${m[1]}` } : null;
    }
    return { kind: 'website', value: u.hostname.replace(/^www\./i, '') };
  } catch {
    return null;
  }
}
