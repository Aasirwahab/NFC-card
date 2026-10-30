import type { PageActionId } from '@/lib/landing/actions';

/** Move to the existing control; activation remains a separate visitor gesture. */
export function focusPageAction(id: PageActionId): void {
  const control = document.getElementById(`page-action-${id}`);
  control?.scrollIntoView({ block: 'center' });
  control?.focus({ preventScroll: true });
}
