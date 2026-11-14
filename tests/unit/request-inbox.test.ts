import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProspectRequestInbox } from '@/components/prospect-request-inbox';
import type { RepRequest } from '@/lib/db/requests';
const h = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), refresh: vi.fn() }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => [initial, h.set],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: () => {},
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock('@/lib/http/client', () => ({
  apiGet: (...args: unknown[]) => h.get(...args),
  apiSend: vi.fn(),
}));
const row: RepRequest = {
  id: 'r1',
  sessionId: 's1',
  kind: 'call',
  channel: 'text',
  contact: '+447700900123',
  bestTime: 'today',
  prospectName: 'Tom',
  repFullName: 'Sam',
  businessName: 'Acme',
  eventName: 'Expo',
  pagePath: '/c/ABCD2345',
};
function find(
  tree: unknown,
  predicate: (node: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | undefined {
  if (!tree || typeof tree !== 'object') return;
  if (Array.isArray(tree)) return tree.map((n) => find(n, predicate)).find(Boolean);
  const e = tree as ReactElement<Record<string, unknown>>;
  return predicate(e) ? e : find(e.props?.children, predicate);
}
function renderRow() {
  const tree = ProspectRequestInbox({ initial: [row] });
  const element = find(tree, (e) => typeof e.type === 'function' && e.type.name === 'RequestRow')!;
  return (element.type as (props: unknown) => ReactElement)(element.props);
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { location: { origin: 'https://example.com', href: '' } });
});
it('frames the action, shows the recipient and exposes one primary action', () => {
  const html = renderToStaticMarkup(renderRow());
  expect(html).toContain('asked you to call them');
  expect(html).toContain('Text');
  expect(html).toContain('today');
  expect(html).toContain('Text +447700900123');
  expect(html.match(/<button/g)).toHaveLength(1);
});
it.each([
  [[]],
  [[{ ...row, id: 'replacement' }]],
  [[{ ...row, channel: 'whatsapp' }]],
  [[{ ...row, contact: '+447700900999' }]],
])('never opens withdrawn or replaced cached consent: %j', async (requests) => {
  h.get.mockResolvedValue({ requests });
  const button = find(renderRow(), (e) => e.type === 'button')!;
  (button.props.onClick as () => void)();
  await flush();
  expect(window.location.href).toBe('');
  expect(h.set).toHaveBeenCalledWith(
    'This request has changed or was cancelled. Refreshing the list.',
  );
  expect(h.get).toHaveBeenCalledTimes(2);
});
it('rechecks exact current consent and builds the link from fresh rep-saved identity', async () => {
  h.get.mockResolvedValue({ requests: [{ ...row, prospectName: 'Alice Smith' }] });
  const button = find(renderRow(), (e) => e.type === 'button')!;
  (button.props.onClick as () => void)();
  await flush();
  expect(h.get).toHaveBeenCalledWith('/api/requests?contact=s1');
  expect(window.location.href).toMatch(/^sms:\+447700900123\?body=/);
  expect(decodeURIComponent(window.location.href)).toContain('Hi Alice,');
});
