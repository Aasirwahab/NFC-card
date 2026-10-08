import type { StaffTap } from './verify';

/**
 * What a signed-in staff member's tap on /c/CODE does.
 *
 *   - First check of a freshly written sticker: show the prospect view with the
 *     staff banner (the check is the point), even for a staff member who owns it.
 *   - Tapped again while the card is still unused:
 *       * by its owner: carry on as the rep, so they get their own page to add
 *         details (staff who are also reps must not be locked out of their cards);
 *       * by someone else: keep showing the prospect view and file nothing, so
 *         a test tap cannot use the card up.
 *   - Anything else (card in use, lost, unknown): an ordinary visit.
 */
export type StaffTapOutcome = 'preview' | 'continue';

export function decideStaffTap(
  tap: StaffTap,
  audienceIfSignedIn: 'rep' | 'owner' | 'prospect' | 'missing' | 'unavailable',
): StaffTapOutcome {
  if (tap === 'not_applicable') return 'continue';
  if (tap === 'verified') return 'preview';
  return audienceIfSignedIn === 'rep' ? 'continue' : 'preview';
}
