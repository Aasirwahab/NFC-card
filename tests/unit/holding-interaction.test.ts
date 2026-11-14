import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Holding } from '@/app/c/[code]/holding';
import { ApiError } from '@/lib/http/client';

// Minimal hook runner: exercise the component's event and polling callbacks
// without installing a DOM or another React renderer into this checkout.
const h = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => unknown)[],
  refresh: vi.fn(),
  get: vi.fn(),
  send: vi.fn(),
  poll: null as null | { onStatus(status: string): boolean; onTimeout(): void },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.slots)) h.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      h.slots[index],
      (value: unknown) => {
        h.slots[index] = typeof value === 'function' ? value(h.slots[index]) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.slots)) h.slots[index] = { current: initial };
    return h.slots[index];
  },
  useEffect(effect: () => unknown, deps: unknown[]) {
    const index = h.cursor++;
    const previous = h.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((value, i) => value !== previous[i])) h.effects.push(effect);
    h.slots[index] = deps;
  },
}));
vi.mock('next/navigation', () => {
  const router = { refresh: h.refresh };
  return { useRouter: () => router };
});
vi.mock('@/lib/http/client', async (original) => ({
  ...(await original<typeof import('@/lib/http/client')>()),
  apiGet: (...args: unknown[]) => h.get(...args),
  apiSend: (...args: unknown[]) => h.send(...args),
}));
vi.mock('@/lib/browser/landing-poll', () => ({
  pollLandingStatus: (_code: string, options: typeof h.poll) => {
    h.poll = options;
    return () => {};
  },
}));
const details = { ready: true, problems: ['A', 'B'], picked: [], expiresAt: null };
function render() {
  h.cursor = 0;
  const tree = Holding({ code: 'ABCDEFGH', first: 'Sam', details });
  h.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function nodes(tree: unknown, type: string): ReactElement<Record<string, unknown>>[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  const element = tree as ReactElement<{ children?: unknown }>;
  return [
    ...(element.type === type ? [element as ReactElement<Record<string, unknown>>] : []),
    ...nodes(element.props?.children, type),
  ];
}
function event(tree: unknown, type: string, name: string, value?: unknown) {
  const handler = nodes(tree, type)[0]!.props[name] as (value?: unknown) => void;
  handler(value);
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.poll = null;
  vi.clearAllMocks();
  h.get.mockResolvedValue({ picked: [], readOnly: false });
  h.send.mockResolvedValue({ saved: true });
});

describe('holding page races', () => {
  it('keeps focused or unsent contact text when the rep saves, then permits submission', async () => {
    let tree = render();
    await flush();
    event(tree, 'input', 'onFocus');
    expect(h.poll!.onStatus('working')).toBe(false);
    event(tree, 'input', 'onChange', { target: { value: 'me@example.com' } });
    event(tree, 'input', 'onBlur');
    expect(h.poll!.onStatus('working')).toBe(false);
    expect(h.refresh).not.toHaveBeenCalled();
    tree = render();
    expect(nodes(tree, 'input')[0]!.props.value).toBe('me@example.com');
    event(tree, 'form', 'onSubmit', { preventDefault() {} });
    await flush();
    expect(h.send).toHaveBeenCalledWith('/api/landing/ABCDEFGH/answers', 'POST', {
      contact: 'me@example.com',
      consent: true,
    });
    expect(h.poll!.onStatus('working')).toBe(true);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
  it('keeps the rejected draft copyable until the prospect opens the ready note', async () => {
    let tree = render();
    await flush();
    event(tree, 'input', 'onChange', { target: { value: 'me@example.com' } });
    h.send.mockRejectedValue(new ApiError(409, 'not_ready'));
    h.get.mockRejectedValue(new ApiError(409, 'not_ready'));
    tree = render();
    event(tree, 'form', 'onSubmit', { preventDefault() {} });
    await flush();
    tree = render();
    expect(nodes(tree, 'input')[0]!.props).toMatchObject({
      value: 'me@example.com',
      readOnly: true,
    });
    const statuses = nodes(tree, 'p').map((p) => p.props.children);
    expect(statuses).toContain("Sam's note is ready. You can still copy this and send it to them.");
    expect(h.refresh).not.toHaveBeenCalled();
    const read = nodes(tree, 'button').find(
      (button) => Array.isArray(button.props.children) && button.props.children[0] === 'Read ',
    )!;
    (read.props.onClick as () => void)();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
  it('keeps an expired draft without claiming a note was written', async () => {
    let tree = render();
    await flush();
    event(tree, 'input', 'onChange', { target: { value: 'me@example.com' } });
    h.send.mockRejectedValue(new ApiError(409, 'holding_expired'));
    tree = render();
    event(tree, 'form', 'onSubmit', { preventDefault() {} });
    await flush();
    tree = render();
    expect(nodes(tree, 'input')[0]!.props).toMatchObject({
      value: 'me@example.com',
      readOnly: true,
    });
    expect(nodes(tree, 'p')[0]!.props.children).toBe(
      'Not written yet. Keep the card and tap it again later.',
    );
    expect(
      nodes(tree, 'button').every(
        (button) =>
          typeof button.props.onClick === 'function' && !Array.isArray(button.props.children),
      ),
    ).toBe(true);
    expect(h.refresh).not.toHaveBeenCalled();
  });
  it('shows no choices read-only without a contact field to another browser', async () => {
    h.get.mockResolvedValue({ picked: [], readOnly: true });
    render();
    await flush();
    const tree = render();
    expect(nodes(tree, 'input')).toHaveLength(0);
    expect(nodes(tree, 'fieldset')[0]!.props.disabled).toBe(true);
    expect(nodes(tree, 'button').some((button) => button.props['aria-pressed'] === true)).toBe(
      false,
    );
  });
  it.each(['blur', 'clear', 'submit'])(
    'checks once after polling ends on %s, preserving a draft',
    async (end) => {
      let tree = render();
      await flush();
      event(tree, 'input', 'onFocus');
      event(tree, 'input', 'onChange', { target: { value: 'me@example.com' } });
      h.poll!.onTimeout();
      h.get.mockResolvedValue({ status: 'working' });
      tree = render();
      if (end === 'blur') event(tree, 'input', 'onBlur');
      if (end === 'clear') event(tree, 'input', 'onChange', { target: { value: '' } });
      if (end === 'submit') event(tree, 'form', 'onSubmit', { preventDefault() {} });
      await flush();
      expect(h.get).toHaveBeenCalledWith('/api/landing/ABCDEFGH/status');
      tree = render();
      if (end === 'blur') {
        expect(nodes(tree, 'input')[0]!.props.value).toBe('me@example.com');
        expect(nodes(tree, 'input')[0]!.props.readOnly).toBe(true);
        expect(h.refresh).not.toHaveBeenCalled();
      } else expect(h.refresh).toHaveBeenCalledTimes(1);
    },
  );
  it('does not call an expired portfolio a ready note on the final check', async () => {
    let tree = render();
    await flush();
    event(tree, 'input', 'onChange', { target: { value: 'keep this draft' } });
    h.poll!.onTimeout();
    h.get.mockResolvedValue({ status: 'portfolio' });
    event(tree, 'input', 'onBlur');
    await flush();
    tree = render();
    expect(nodes(tree, 'input')[0]!.props.value).toBe('keep this draft');
    expect(nodes(tree, 'p').map((p) => p.props.children)).not.toContain(
      "Sam's note is ready. You can still copy this and send it to them.",
    );
    expect(h.refresh).not.toHaveBeenCalled();
  });
  it('stops with honest wording after ten minutes, keeping a typed draft', async () => {
    let tree = render();
    await flush();
    event(tree, 'input', 'onChange', { target: { value: 'me@example.com' } });
    h.poll!.onTimeout();
    tree = render();
    expect(nodes(tree, 'p')[0]!.props.children).toBe(
      'Not written yet. Keep the card and tap it again later.',
    );
    expect(nodes(tree, 'input')[0]!.props.value).toBe('me@example.com');
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
