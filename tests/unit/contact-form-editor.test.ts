import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactFormEditor } from '@/app/(app)/settings/settings-forms';
import { DEFAULT_CONTACT_FORM } from '@/lib/domain/contact-form';
import { ProspectContactForm } from '@/components/prospect-contact-form';
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      h.slots[i],
      (v: unknown) => {
        h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v;
      },
    ];
  },
  useRef(initial: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = { current: initial };
    return h.slots[i];
  },
  useActionState: () => [{}, vi.fn()],
}));
vi.mock('@/app/(app)/settings/actions', () => ({ saveContactFormAction: vi.fn() }));
type Element = ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const el = tree as Element;
  return [el, ...nodes(el.props?.children)];
}
function render() {
  h.cursor = 0;
  return nodes(ContactFormEditor({ config: DEFAULT_CONTACT_FORM, first: 'Sam' }));
}
function click(text: string) {
  const el = render().find((el) => el.type === 'button' && el.props.children === text)!;
  (el.props.onClick as () => void)();
}
function value() {
  return JSON.parse(render().find((el) => el.props.name === 'contact_form')!.props.value as string);
}
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
});
describe('Setup contact form editor', () => {
  it('updates live preview copy and keeps contact required', () => {
    const title = render().find((el) => el.props.id === 'form-title')!;
    (title.props.onChange as (e: unknown) => void)({ target: { value: 'Hello {first}' } });
    const preview = render().find((el) => el.type === ProspectContactForm)!;
    expect(preview.props).toMatchObject({
      config: { title: 'Hello {first}', contactRequired: true },
      first: 'Sam',
      preview: true,
    });
  });
  it('limits questions to three, focuses a new label and supports removal and reset', () => {
    click('Add a question');
    const question = render().find((el) => el.props.id === 'question-label-0')!;
    const focus = vi.fn();
    (question.props.ref as (node: unknown) => void)({ focus });
    expect(focus).toHaveBeenCalledOnce();
    const id = value().questions[0].id;
    click('Add a question');
    click('Add a question');
    expect(value().questions).toHaveLength(3);
    expect(
      render().find((el) => el.type === 'button' && el.props.children === 'Add a question')!.props
        .disabled,
    ).toBe(true);
    expect(value().questions[0].id).toBe(id);
    const remove = render().find((el) => el.type === 'button' && el.props.children === 'Remove')!;
    (remove.props.onClick as () => void)();
    expect(value().questions).toHaveLength(2);
    click('Reset to default');
    expect(value()).toEqual(DEFAULT_CONTACT_FORM);
  });
  it('disables Required when Ask is off and clears it when the field is hidden', () => {
    const required = () => render().find((el) => el.props.id === 'form-name-required')!;
    expect(required().props.disabled).toBe(true);
    const ask = () => render().find((el) => el.props.id === 'form-name-ask')!;
    (ask().props.onChange as (e: unknown) => void)({ target: { checked: true } });
    (required().props.onChange as (e: unknown) => void)({ target: { checked: true } });
    expect(value().fields.name.required).toBe(true);
    (ask().props.onChange as (e: unknown) => void)({ target: { checked: false } });
    expect(value().fields.name).toEqual({ ask: false, required: false });
  });
  it('ignores blank option lines and clears hidden options when switching to Text', () => {
    click('Add a question');
    const changeType = (value: string) => {
      const type = render().find((el) => el.props.id === 'question-type-0')!;
      (type.props.onChange as (e: unknown) => void)({ target: { value } });
    };
    changeType('choice');
    const options = render().find((el) => el.props.id === 'question-options-0')!;
    (options.props.onChange as (e: unknown) => void)({ target: { value: ' Now \nLater\n' } });
    expect(value().questions[0].options).toEqual(['Now', 'Later']);
    changeType('text');
    expect(value().questions[0].options).toEqual([]);
  });
  it('edits choice options one per line and toggles the whole form', () => {
    click('Add a question');
    const type = render().find((el) => el.props.id === 'question-type-0')!;
    (type.props.onChange as (e: unknown) => void)({ target: { value: 'choice' } });
    const options = render().find((el) => el.props.id === 'question-options-0')!;
    (options.props.onChange as (e: unknown) => void)({ target: { value: 'Now\nLater' } });
    expect(value().questions[0].options).toEqual(['Now', 'Later']);
    const enabled = render().find((el) => el.props.role === 'switch')!;
    (enabled.props.onChange as (e: unknown) => void)({ target: { checked: false } });
    expect(value().enabled).toBe(false);
  });
});
