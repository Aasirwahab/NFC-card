import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RemovalGate, RemovedContext } from '@/app/c/[code]/removal-gate';

const h = vi.hoisted(() => ({ removed: false }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: boolean) => [h.removed, (value: boolean) => (h.removed = value)],
}));

describe('removing details replaces the whole page', () => {
  it('shows the page until removal, then only the calm removed state, with no reload', () => {
    h.removed = false;
    const page = RemovalGate({ children: 'THE NOTE AND CHAT' }) as ReactElement<{
      value: () => void;
      children: string;
    }>;
    expect(page.type).toBe(RemovedContext.Provider);
    expect(page.props.children).toBe('THE NOTE AND CHAT');
    page.props.value();
    const after = renderToStaticMarkup(createElement(RemovalGate, null, 'THE NOTE AND CHAT'));
    expect(after).toContain('Your details have been removed.');
    expect(after).not.toContain('THE NOTE AND CHAT');
  });
});
