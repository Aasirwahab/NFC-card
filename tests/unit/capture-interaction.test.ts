import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceNote } from '@/components/voice-note';
import { DetailsForm } from '@/app/(app)/sessions/[id]/edit/details-form';
import { FollowupSendButton } from '@/components/followup-send-button';

type Element = ReactElement<Record<string, unknown>>;
const h = vi.hoisted(() => ({
  slots: {} as Record<string, unknown[]>,
  key: '',
  cursor: 0,
  effects: [] as (() => unknown)[],
  send: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const slots = h.slots[h.key]!;
    const i = h.cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[i],
      (value: unknown) => {
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const slots = h.slots[h.key]!;
    const i = h.cursor++;
    if (!(i in slots)) slots[i] = { current: initial };
    return slots[i];
  },
  useEffect(effect: () => unknown, deps?: unknown[]) {
    const slots = h.slots[h.key]!;
    const i = h.cursor++;
    const previous = slots[i] as unknown[] | undefined;
    if (!deps || !previous || deps.some((v, n) => v !== previous[n])) h.effects.push(effect);
    slots[i] = deps;
  },
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock('@/lib/http/client', async (original) => ({
  ...(await original<typeof import('@/lib/http/client')>()),
  apiSend: (...args: unknown[]) => h.send(...args),
}));
function render(key: string, component: () => Element) {
  h.key = key;
  h.slots[key] ??= [];
  h.cursor = 0;
  const tree = component();
  h.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function nodes(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const el = tree as Element;
  return [el, ...nodes(el.props?.children)];
}
function child(tree: Element, name: string) {
  return nodes(tree).find((el) => typeof el.type === 'function' && el.type.name === name)!;
}
function mount(el: Element, key: string) {
  return render(key, () => (el.type as (props: Element['props']) => Element)(el.props));
}
function click(el: Element) {
  (el.props.onClick as () => void)();
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const props = {
  session: {
    id: 'contact',
    colour_tag: 'Blue',
    event_sequence_number: 1,
    custom_problems: 'typed',
    problems: [],
  } as unknown as Parameters<typeof DetailsForm>[0]['session'],
  niches: [],
  fallbackProblems: [],
  eventName: null,
  cardCode: 'ABCDEFGH',
  events: [],
  lookupEnabled: false,
  scanEnabled: false,
  voiceEnabled: true,
  aiEnabled: true,
  justRegistered: false,
};
const form = () => render('form', () => DetailsForm(props));
const saveButton = (tree: Element) =>
  nodes(tree).find((el) => el.props?.size === 'block' && typeof el.props.onClick === 'function')!;

beforeEach(() => {
  vi.clearAllMocks();
  h.slots = {};
  h.effects = [];
  vi.stubGlobal('window', {
    localStorage: { getItem: () => null },
    location: { origin: 'https://example.com', href: '' },
  });
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal('HTMLTextAreaElement', class {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('voice capture and sorting', () => {
  it.each(['permission', 'constructor', 'start'])(
    'clears busy before unmount and releases a stream on %s failure',
    async (failure) => {
      let rejectPermission!: (reason: Error) => void;
      const stop = vi.fn();
      const stream = { getTracks: () => [{ stop }] };
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: () =>
            failure === 'permission'
              ? new Promise((_resolve, reject) => {
                  rejectPermission = reject;
                })
              : Promise.resolve(stream),
        },
      });
      vi.stubGlobal(
        'MediaRecorder',
        class {
          constructor() {
            if (failure === 'constructor') throw new Error('unsupported');
          }
          start() {
            throw new Error('cannot start');
          }
        },
      );
      let busy = false;
      const unavailable = vi.fn(() => {
        expect(busy).toBe(false);
      });
      const voiceProps = {
        onText: () => true,
        onBusy: (next: boolean) => {
          busy = next;
        },
        onUnavailable: unavailable,
      };
      const voice = () => render('voice', () => VoiceNote(voiceProps));
      click(nodes(voice()).find((el) => el.type === 'button')!);
      voice();
      expect(busy).toBe(true);
      if (failure === 'permission') rejectPermission(new Error('denied'));
      await flush();
      expect(unavailable).toHaveBeenCalledOnce();
      expect(busy).toBe(false);
      if (failure !== 'permission') expect(stop).toHaveBeenCalledOnce();
    },
  );
  it('never keeps Save voice-busy after the recorder is unmounted', () => {
    let tree = form();
    const voice = child(tree, 'VoiceNote');
    (voice.props.onBusy as (busy: boolean) => void)(true);
    tree = form();
    expect(saveButton(tree).props.disabled).toBe(true);
    (voice.props.onUnavailable as () => void)();
    tree = form();
    expect(child(tree, 'VoiceNote')).toBeUndefined();
    expect(saveButton(tree).props.disabled).toBe(false);
  });
  it('blocks Save during manual sorting too', async () => {
    let resolve!: (value: unknown) => void;
    h.send.mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    const tree = form();
    const note = mount(child(tree, 'NoteBox'), 'note');
    click(nodes(note).find((el) => el.type === 'button')!);
    expect(saveButton(form()).props.disabled).toBe(true);
    resolve({ name: null, company: null, niche: null, problems: [] });
    await flush();
    expect(saveButton(form()).props.disabled).toBe(false);
  });
  it('keeps Save blocked until overlapping sorts have both settled', async () => {
    const pending: ((fill: unknown) => void)[] = [];
    h.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    let tree = form();
    click(nodes(mount(child(tree, 'NoteBox'), 'note')).find((el) => el.type === 'button')!);
    (child(tree, 'VoiceNote').props.onText as (text: string) => boolean)('spoken');
    tree = form();
    mount(child(tree, 'NoteBox'), 'note');
    const fill = { name: null, company: null, niche: null, problems: [] };
    pending[0]!(fill);
    await flush();
    expect(saveButton(form()).props.disabled).toBe(true);
    pending[1]!(fill);
    await flush();
    expect(saveButton(form()).props.disabled).toBe(false);
  });
  it.each(['success', 'failure', 'timeout'])(
    'blocks Save through transcript sorting and releases it on %s',
    async (outcome) => {
      vi.useFakeTimers();
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      h.send.mockReturnValue(
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
      );
      let tree = form();
      mount(child(tree, 'NoteBox'), 'note');
      const voice = child(tree, 'VoiceNote');
      (voice.props.onBusy as (busy: boolean) => void)(true);
      (voice.props.onText as (text: string) => boolean)('spoken');
      (voice.props.onBusy as (busy: boolean) => void)(false);
      tree = form();
      expect(saveButton(tree).props.disabled).toBe(true);
      expect(saveButton(tree).props.children).toBe('Finish your voice note first');
      mount(child(tree, 'NoteBox'), 'note');
      tree = form();
      expect(saveButton(tree).props.disabled).toBe(true);
      if (outcome === 'success')
        resolve({ name: 'Sorted name', company: null, niche: null, problems: [] });
      if (outcome === 'failure') reject(new Error('offline'));
      if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(30_001);
      await flush();
      tree = form();
      expect(saveButton(tree).props.disabled).toBe(false);
      expect(nodes(tree).find((el) => el.props?.id === 'name')!.props.value).toBe(
        outcome === 'success' ? 'Sorted name' : '',
      );
      if (outcome === 'timeout') {
        resolve({ name: 'Late name', company: null, niche: null, problems: [] });
        await flush();
        expect(nodes(form()).find((el) => el.props?.id === 'name')!.props.value).toBe('');
      }
    },
  );
});

describe('visible send recipient', () => {
  it.each([
    ['person@example.com', null, 'Send to person@example.com', 'mailto:person%40example.com?body='],
    [null, '+447700900123', 'Text +447700900123', 'sms:+447700900123?body='],
  ])(
    'opens exactly the displayed recipient even when native sharing is available',
    async (email, phone, label, url) => {
      const share = vi.fn();
      vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
      const tree = render('send', () =>
        FollowupSendButton({ draft: 'Hi', pagePath: '/c/abc', email, phone, preferContact: false }),
      );
      const button = child(tree, 'Button');
      expect(button.props.children).toBe(label);
      click(button);
      await flush();
      expect(window.location.href).toBe(
        `${url}${encodeURIComponent('Hi\n\nhttps://example.com/c/abc')}`,
      );
      expect(share).not.toHaveBeenCalled();
    },
  );
});
