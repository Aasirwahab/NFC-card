import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProspectRequest } from '@/app/c/[code]/prospect-request';
const h = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => unknown)[],
  get: vi.fn(),
  send: vi.fn(),
  poll: null as null | ((status: unknown) => void),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = initial;
    return [
      h.slots[i],
      (value: unknown) => {
        h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = { current: initial };
    return h.slots[i];
  },
  useEffect(effect: () => unknown, deps: unknown[]) {
    const i = h.cursor++;
    const prev = h.slots[i] as unknown[] | undefined;
    if (!prev || deps.some((v, j) => v !== prev[j])) h.effects.push(effect);
    h.slots[i] = deps;
  },
}));
vi.mock('@/lib/http/client', async (original) => ({
  ...(await original<typeof import('@/lib/http/client')>()),
  apiGet: (...args: unknown[]) => h.get(...args),
  apiSend: (...args: unknown[]) => h.send(...args),
}));
vi.mock('@/lib/browser/request-poll', () => ({
  pollRequests: (_path: string, callback: typeof h.poll) => {
    h.poll = callback;
    return () => {};
  },
}));
function render() {
  h.cursor = 0;
  const tree = ProspectRequest({ code: 'ABCD2345', first: 'Sam' });
  h.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function nodes(tree: unknown, type: string): ReactElement<Record<string, unknown>>[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  const e = tree as ReactElement<{ children?: unknown }>;
  return [
    ...(e.type === type ? [e as ReactElement<Record<string, unknown>>] : []),
    ...nodes(e.props?.children, type),
  ];
}
function text(tree: unknown): string {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object'
    ? text((tree as ReactElement<{ children?: unknown }>).props?.children)
    : '';
}
function click(tree: unknown, label: string) {
  const node = nodes(tree, 'button').find((n) => text(n) === label)!;
  (node.props.onClick as () => void)();
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const request = { id: 'r1', kind: 'details', channel: 'email', best_time: 'today', status: 'open' };
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.poll = null;
  h.get.mockReset().mockResolvedValue({
    request: null,
    contact: { email: 'tom@example.com', phone: '+447700900123' },
  });
  h.send.mockReset().mockResolvedValue({ request, contact: null });
});
it('shows both warm actions and a labelled native dialog with bounded inputs', () => {
  const tree = render();
  expect(text(tree)).toContain('Ask Sam to call me');
  expect(text(tree)).toContain('Send me the details');
  expect(nodes(tree, 'dialog')[0]!.props['aria-labelledby']).toBe('request-title');
  expect(nodes(tree, 'input').find((n) => n.props.id === 'request-contact')!.props.maxLength).toBe(
    254,
  );
});
it('prefills only the server-authorized answer and resets consent when changing channel', async () => {
  let tree = render();
  click(tree, 'Ask Sam to call me');
  await flush();
  tree = render();
  expect(nodes(tree, 'input').find((n) => n.props.id === 'request-contact')!.props.value).toBe(
    '+447700900123',
  );
  const check = nodes(tree, 'input').find((n) => n.props.type === 'checkbox')!;
  (check.props.onChange as (e: unknown) => void)({ target: { checked: true } });
  click(tree, 'Email');
  tree = render();
  expect(nodes(tree, 'input').find((n) => n.props.id === 'request-contact')!.props.value).toBe(
    'tom@example.com',
  );
  expect(nodes(tree, 'input').find((n) => n.props.type === 'checkbox')!.props.checked).toBe(false);
  expect(text(tree)).toContain('Sam will contact you once by Email about this. Nothing else.');
});
it('does not replace typing when a late prefill arrives', async () => {
  let finish!: (value: unknown) => void;
  h.get.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let tree = render();
  click(tree, 'Ask Sam to call me');
  tree = render();
  (
    nodes(tree, 'input').find((n) => n.props.id === 'request-contact')!.props.onChange as (
      e: unknown,
    ) => void
  )({ target: { value: '07700900999' } });
  finish({ request: null, contact: { email: null, phone: '+447700900123' } });
  await flush();
  tree = render();
  expect(nodes(tree, 'input').find((n) => n.props.id === 'request-contact')!.props.value).toBe(
    '07700900999',
  );
});
it('captures the chosen channel, best time and explicit consent, then clears status after Done', async () => {
  let tree = render();
  click(tree, 'Send me the details');
  await flush();
  tree = render();
  click(tree, 'Email');
  click(tree, 'Today');
  tree = render();
  (
    nodes(tree, 'input').find((n) => n.props.type === 'checkbox')!.props.onChange as (
      e: unknown,
    ) => void
  )({ target: { checked: true } });
  tree = render();
  (nodes(tree, 'form')[0]!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
  await flush();
  tree = render();
  expect(h.send).toHaveBeenCalledWith('/api/landing/ABCD2345/answers/request', 'POST', {
    kind: 'details',
    channel: 'email',
    contact: 'tom@example.com',
    bestTime: 'today',
    consent: true,
  });
  expect(text(tree)).toContain('Sam has your request.');
  h.poll!({ request: null, contact: null });
  tree = render();
  expect(text(tree)).not.toContain('Sam has your request.');
});
it('lets the requesting browser cancel its open request', async () => {
  let tree = render();
  h.poll!({ request, contact: null });
  tree = render();
  click(tree, 'View or cancel my request');
  tree = render();
  click(tree, 'Cancel my request');
  await flush();
  tree = render();
  expect(h.send).toHaveBeenCalledWith('/api/landing/ABCD2345/answers/request', 'DELETE', {
    requestId: 'r1',
  });
  expect(text(tree)).not.toContain('Sam has your request.');
});
