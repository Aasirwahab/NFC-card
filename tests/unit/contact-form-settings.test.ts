import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveContactFormAction } from '@/app/(app)/settings/actions';
import { DEFAULT_CONTACT_FORM } from '@/lib/domain/contact-form';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/db/server', () => ({ requireRep: async () => ({ userId: 'rep' }) }));
vi.mock('@/lib/booking/check', () => ({ checkBookingLink: vi.fn() }));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({
    from: () => ({
      update: (value: unknown) => {
        mocks.update(value);
        return {
          eq: (...args: unknown[]) => {
            mocks.eq(...args);
            return { select: mocks.select };
          },
        };
      },
    }),
  }),
}));
const data = (config: unknown) => {
  const form = new FormData();
  form.set('contact_form', JSON.stringify(config));
  return form;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockResolvedValue({ data: [{ id: 'rep' }], error: null });
});
describe('saving a contact form', () => {
  it('validates and saves only the authenticated rep config', async () => {
    expect(await saveContactFormAction({}, data(DEFAULT_CONTACT_FORM))).toEqual({ saved: true });
    expect(mocks.update).toHaveBeenCalledWith({ contact_form: DEFAULT_CONTACT_FORM });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'rep');
    expect(mocks.revalidate).toHaveBeenCalledWith('/settings');
  });
  it('asks for a name when no profile exists and reports database errors', async () => {
    mocks.select.mockResolvedValueOnce({ data: [], error: null });
    expect((await saveContactFormAction({}, data(DEFAULT_CONTACT_FORM))).error).toContain(
      'Save your name first',
    );
    mocks.select.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    expect((await saveContactFormAction({}, data(DEFAULT_CONTACT_FORM))).error).toContain(
      'Could not save',
    );
  });
  it('rejects invalid or malformed JSON without updating', async () => {
    const broken = new FormData();
    broken.set('contact_form', '{');
    for (const form of [broken, data({ title: '' }), data({ contactRequired: false })])
      expect((await saveContactFormAction({}, form)).error).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
