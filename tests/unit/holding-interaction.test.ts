import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProspectContactForm } from '@/components/prospect-contact-form';
import { parseContactForm, type ContactForm } from '@/lib/domain/contact-form';
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
function render(contactForm?: ContactForm) {
  h.cursor = 0;
  const tree = Holding({ code: 'ABCDEFGH', first: 'Sam', details, contactForm });
  h.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function nodes(tree: unknown, type: string): ReactElement<Record<string, unknown>>[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  const element = tree as ReactElement<{ children?: unknown }>;
  if (element.type === ProspectContactForm)
    return nodes(
      ProspectContactForm(element.props as Parameters<typeof ProspectContactForm>[0]),
      type,
    );
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
  h.get.mockResolvedValue({ picked: [], readOnly: false, contact: null });
  h.send.mockResolvedValue({ saved: true });
});

describe('holding page races', () => {
  it.each(['', 'draft@example.com'])(
    'defers a late saved answer while focused with %s, until blurred and empty',
    async (draft) => {
      let resolve!: (answers: unknown) => void;
      h.get.mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
      let tree = render();
      event(tree, 'input', 'onFocus');
      event(tree, 'input', 'onChange', { target: { value: draft } });
      resolve({ picked: [], readOnly: false, contact: 'b•••@example.test' });
      await flush();
      tree = render();
      expect(nodes(tree, 'input')[0]?.props.value).toBe(draft);
      event(tree, 'input', 'onBlur');
      tree = render();
      if (draft) {
        expect(nodes(tree, 'input')[0]?.props.value).toBe(draft);
        event(tree, 'input', 'onChange', { target: { value: '' } });
        tree = render();
      }
      expect(nodes(tree, 'input')).toHaveLength(0);
      expect(JSON.stringify(nodes(tree, 'p').map((p) => p.props.children))).toContain(
        'b•••@example.test',
      );
    },
  );
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
      answers: {},
    });
    expect(h.poll!.onStatus('working')).toBe(true);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
  it('submits the optional message and shows it with the saved contact', async () => {
    let tree = render();
    await flush();
    event(tree, 'input', 'onChange', { target: { value: 'me@example.com' } });
    event(tree, 'textarea', 'onChange', { target: { value: 'A quote please' } });
    h.get.mockResolvedValue({
      picked: [],
      readOnly: false,
      contact: 'm•••@example.com',
      answers: [{ label: 'What would you like from Sam?', value: 'A quote please' }],
    });
    tree = render();
    event(tree, 'form', 'onSubmit', { preventDefault() {} });
    await flush();
    expect(h.send).toHaveBeenCalledWith('/api/landing/ABCDEFGH/answers', 'POST', {
      contact: 'me@example.com',
      consent: true,
      answers: { message: 'A quote please' },
    });
    tree = render();
    expect(JSON.stringify(tree)).toContain('A quote please');
    expect(JSON.stringify(tree)).toContain('has your details and will get back to you.');
    expect(nodes(tree, 'textarea')).toHaveLength(0);
    const change = nodes(tree, 'button').find((button) => button.props.children === 'Change')!;
    (change.props.onClick as () => void)();
    expect(nodes(render(), 'textarea')[0]!.props.value).toBe('A quote please');
  });
  it('preserves a message-only draft when the rep finishes the note', async () => {
    let tree = render();
    await flush();
    event(tree, 'textarea', 'onChange', { target: { value: 'A quick call' } });
    expect(h.poll!.onStatus('working')).toBe(false);
    h.poll!.onTimeout();
    h.get.mockResolvedValue({ status: 'working' });
    event(tree, 'textarea', 'onBlur');
    await flush();
    tree = render();
    expect(nodes(tree, 'textarea')[0]!.props).toMatchObject({
      value: 'A quick call',
      readOnly: true,
    });
    expect(h.refresh).not.toHaveBeenCalled();
  });
  it.each(['name', 'company', 'jobTitle', 'question:when'])(
    'keeps a %s draft through polling and late saved answers',
    async (key) => {
      const config = parseContactForm({
        fields: {
          name: { ask: true, required: false },
          company: { ask: true, required: false },
          jobTitle: { ask: true, required: false },
        },
        questions: [
          {
            id: 'when',
            label: 'When?',
            type: 'choice',
            options: ['Now', 'Later'],
            required: false,
          },
        ],
      });
      let resolve!: (answers: unknown) => void;
      h.get.mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
      let tree = render(config);
      const input = nodes(tree, 'input').find((el) => el.props.name === key)!;
      (input.props.onChange as (e: unknown) => void)({
        target: { value: key === 'question:when' ? 'Now' : 'Alex' },
      });
      resolve({ picked: [], readOnly: false, contact: 'b•••@example.test', answers: [] });
      await flush();
      expect(h.poll!.onStatus('working')).toBe(false);
      h.poll!.onTimeout();
      tree = render(config);
      expect(nodes(tree, 'input').some((el) => el.props.name === key)).toBe(true);
      expect(h.refresh).not.toHaveBeenCalled();
    },
  );
  it('hides the contact box when disabled while retaining problem chips', async () => {
    render({ ...parseContactForm(null), enabled: false });
    await flush();
    const tree = render({ ...parseContactForm(null), enabled: false });
    expect(nodes(tree, 'form')).toHaveLength(0);
    expect(nodes(tree, 'fieldset')).toHaveLength(1);
  });
  it('does not copy one saved answer into multiple questions with the same label on Change', async () => {
    const config = parseContactForm({
      questions: ['a', 'b'].map((id) => ({
        id,
        label: 'Same label',
        type: 'text',
        options: [],
        required: false,
      })),
    });
    h.get.mockResolvedValue({
      picked: [],
      readOnly: false,
      contact: 'b•••@example.test',
      answers: [
        { label: 'Same label', value: 'First' },
        { label: 'Same label', value: 'Second' },
      ],
    });
    render(config);
    await flush();
    const change = nodes(render(config), 'button').find((b) => b.props.children === 'Change')!;
    (change.props.onClick as () => void)();
    const inputs = nodes(render(config), 'input').filter((el) =>
      String(el.props.name).startsWith('question:'),
    );
    expect(inputs.map((el) => el.props.value)).toEqual(['', '']);
  });
  it('clears an optional choice draft and lets polling refresh afterwards', async () => {
    const config = parseContactForm({
      questions: [
        { id: 'when', label: 'When?', type: 'choice', options: ['Now', 'Later'], required: false },
      ],
    });
    let tree = render(config);
    await flush();
    const radio = nodes(tree, 'input').find((el) => el.props.type === 'radio')!;
    (radio.props.onChange as () => void)();
    tree = render(config);
    expect(h.poll!.onStatus('working')).toBe(false);
    const clear = nodes(tree, 'button').find((el) => el.props.children === 'Clear answer')!;
    (clear.props.onClick as () => void)();
    expect(h.poll!.onStatus('working')).toBe(true);
  });
  it('restores a saved choice whose display text includes the rep name', async () => {
    const config = parseContactForm({
      questions: [
        {
          id: 'reply',
          label: 'Reply?',
          type: 'choice',
          options: ['Ask {first}', 'No thanks'],
          required: false,
        },
      ],
    });
    h.get.mockResolvedValue({
      picked: [],
      readOnly: false,
      contact: 'b•••@example.test',
      answers: [{ label: 'Reply?', value: 'Ask Sam' }],
    });
    render(config);
    await flush();
    const change = nodes(render(config), 'button').find((b) => b.props.children === 'Change')!;
    (change.props.onClick as () => void)();
    const selected = nodes(render(config), 'input').find(
      (el) => el.props.type === 'radio' && el.props.checked,
    )!;
    expect(selected.props.value).toBe('Ask {first}');
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
    expect(nodes(tree, 'h1')[0]!.props.children).toBe(
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
  it('shows one quiet line, no chips and no field, to a browser that did not answer', async () => {
    h.get.mockResolvedValue({ picked: [], readOnly: true, contact: null });
    render();
    await flush();
    const tree = render();
    expect(nodes(tree, 'input')).toHaveLength(0);
    expect(nodes(tree, 'fieldset')).toHaveLength(0);
    expect(nodes(tree, 'button')).toHaveLength(0);
    expect(nodes(tree, 'p').map((p) => p.props.children)).toContain(
      'Answers have already been given on this card.',
    );
  });
  it('shows nothing of the answers while it is still unknown whether this browser answered', () => {
    const tree = Holding({
      code: 'ABCDEFGH',
      first: 'Sam',
      details: { ...details, readOnly: true },
    });
    expect(nodes(tree, 'fieldset')).toHaveLength(0);
    expect(nodes(tree, 'input')).toHaveLength(0);
    expect(nodes(tree, 'p')).toHaveLength(0);
  });
  it('confirms a saved contact in masked form with Change, and Change reopens the field', async () => {
    h.get.mockResolvedValue({ picked: [], readOnly: false, contact: 'b•••@example.test' });
    render();
    await flush();
    let tree = render();
    expect(nodes(tree, 'input')).toHaveLength(0);
    const text = JSON.stringify(nodes(tree, 'p').map((p) => p.props.children));
    expect(text).toContain('b•••@example.test');
    const change = nodes(tree, 'button').find((button) => button.props.children === 'Change')!;
    (change.props.onClick as () => void)();
    tree = render();
    expect(nodes(tree, 'input')).toHaveLength(1);
  });
  it('re-reads the masked value after a save instead of echoing what was typed', async () => {
    let tree = render();
    await flush();
    event(tree, 'input', 'onChange', { target: { value: 'me@example.com' } });
    h.get.mockResolvedValue({ picked: [], readOnly: false, contact: 'm•••@example.com' });
    tree = render();
    event(tree, 'form', 'onSubmit', { preventDefault() {} });
    await flush();
    tree = render();
    expect(JSON.stringify(nodes(tree, 'p').map((p) => p.props.children))).toContain(
      'm•••@example.com',
    );
    expect(JSON.stringify(tree)).not.toContain('me@example.com');
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
    expect(nodes(tree, 'h1')[0]!.props.children).toBe(
      'Not written yet. Keep the card and tap it again later.',
    );
    expect(nodes(tree, 'input')[0]!.props.value).toBe('me@example.com');
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
