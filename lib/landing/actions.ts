import { parseBookingUrl } from '@/lib/booking/link';
import { linkedinHref } from '@/lib/domain/linkedin';
import type { Snapshot } from '@/lib/enrich/snapshot';

export type PageActionId = 'book' | 'linkedin' | 'save-contact' | 'email-page';
export type PageAction = { id: PageActionId; label: string };

/** The same validated links and email configuration used by the prospect page. */
export function availableActions(
  snapshot: { rep: Pick<NonNullable<Snapshot['rep']>, 'booking_url' | 'linkedin_url'> | null },
  mode: { emailEnabled: boolean; preview?: boolean },
): PageAction[] {
  if (mode.preview) return [];
  const actions: PageAction[] = [];
  if (parseBookingUrl(snapshot.rep?.booking_url)) actions.push({ id: 'book', label: 'Book' });
  if (linkedinHref(snapshot.rep?.linkedin_url ?? null)) {
    actions.push({ id: 'linkedin', label: 'LinkedIn connect' });
  }
  actions.push({ id: 'save-contact', label: 'Save contact' });
  if (mode.emailEnabled) actions.push({ id: 'email-page', label: 'Email me this page' });
  return actions;
}
