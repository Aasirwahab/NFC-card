import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { PlaybookForm } from '@/app/(app)/settings/settings-forms';

type Element = ReactElement<Record<string, unknown>>;
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  focus: vi.fn(),
  starting: vi.fn(),
  details: { open: true, querySelector: vi.fn() },
  action: null as null | ((previous: object, data: FormData) => Promise<unknown>),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => [initial, mocks.starting],
  useRef: () => ({ current: mocks.details }),
  useActionState: (action: typeof mocks.action) => {
    mocks.action = action;
    return [{}, action];
  },
}));
vi.mock('@/app/(app)/settings/actions', () => ({
  savePlaybookAction: mocks.save,
  deletePlaybookAction: vi.fn(),
  dismissUnansweredAction: vi.fn(),
  saveBusinessAction: vi.fn(),
  saveKnowledgeAction: vi.fn(),
  saveProfileAction: vi.fn(),
  savePitchVoiceAction: vi.fn(),
}));

function nodes(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const el = tree as Element;
  return [el, ...nodes(el.props?.children)];
}
function entry(id = '') {
  const tree = PlaybookForm({
    entries: id ? [{ id, problem: 'Missed calls', why: null, checks: [], resource_url: null }] : [],
    suggestions: [],
    draftEnabled: false,
  });
  const el = nodes(tree).find(
    (el) => typeof el.type === 'function' && el.type.name === 'PlaybookEntry',
  )!;
  (el.type as (props: unknown) => unknown)(el.props);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.details.open = true;
  mocks.details.querySelector.mockReturnValue({ focus: mocks.focus });
});

it('closes the add form and focuses its summary only after a successful save', async () => {
  mocks.save.mockResolvedValue({ saved: true });
  entry();
  const data = new FormData();
  expect(await mocks.action!({}, data)).toEqual({ saved: true });
  expect(mocks.save).toHaveBeenCalledWith({}, data);
  expect(mocks.details.open).toBe(false);
  expect(mocks.starting).toHaveBeenCalledWith(null);
  expect(mocks.focus).toHaveBeenCalledOnce();
});

it('keeps the add form open when saving fails', async () => {
  mocks.save.mockResolvedValue({ error: 'Name the problem.' });
  entry();
  expect(await mocks.action!({}, new FormData())).toEqual({ error: 'Name the problem.' });
  expect(mocks.details.open).toBe(true);
  expect(mocks.focus).not.toHaveBeenCalled();
});

it('keeps an existing entry open after an edit', async () => {
  mocks.save.mockResolvedValue({ saved: true });
  entry('existing');
  await mocks.action!({}, new FormData());
  expect(mocks.details.open).toBe(true);
  expect(mocks.focus).not.toHaveBeenCalled();
});
