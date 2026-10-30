import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusPageAction } from '@/lib/landing/focus-action';

afterEach(() => vi.unstubAllGlobals());

describe('chat action navigation', () => {
  it.each(['book', 'linkedin', 'save-contact', 'email-page'] as const)(
    'only focuses and scrolls to the existing %s control',
    (id) => {
      const control = { scrollIntoView: vi.fn(), focus: vi.fn(), click: vi.fn() };
      const getElementById = vi.fn(() => control);
      vi.stubGlobal('document', { getElementById });
      focusPageAction(id);
      expect(getElementById).toHaveBeenCalledWith(`page-action-${id}`);
      expect(control.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
      expect(control.focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(control.click).not.toHaveBeenCalled();
    },
  );
  it('tolerates a control removed since the response', () => {
    vi.stubGlobal('document', { getElementById: () => null });
    expect(() => focusPageAction('book')).not.toThrow();
  });
});
