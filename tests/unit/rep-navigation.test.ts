import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { RepNavigation } from '@/components/rep-navigation';
const mocks = vi.hoisted(() => ({ path: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.path }));

it.each([
  ['/dashboard', '/dashboard'],
  ['/events', '/events'],
  ['/events/one/results', '/events'],
  ['/cards', '/cards'],
  ['/settings', '/settings'],
])('marks the current tab on %s', (path, href) => {
  mocks.path = path;
  const html = renderToStaticMarkup(createElement(RepNavigation));
  const active = [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)];
  expect(active).toHaveLength(1);
  expect(active[0]![0]).toContain(`href="${href}"`);
});
it('hides the navigation only on contact edit', () => {
  mocks.path = '/sessions/contact/edit';
  expect(renderToStaticMarkup(createElement(RepNavigation))).toBe('');
  mocks.path = '/sessions/contact/preview';
  expect(renderToStaticMarkup(createElement(RepNavigation))).toContain('<nav');
});
