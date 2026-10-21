import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissUnansweredAction, saveKnowledgeAction } from '@/app/(app)/settings/actions';

const mocks = vi.hoisted(() => ({
  requireRep: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/db/server', () => ({ requireRep: mocks.requireRep }));
vi.mock('@/lib/db/service', () => ({
  serviceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

function answer(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    topic: 'faq',
    content: '  Two weeks.  ',
    unanswered_id: '42',
    public_question: 'How long does it take?',
    ...fields,
  }))
    form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRep.mockResolvedValue({ userId: 'rep-id' });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe('answering from the knowledge save action', () => {
  it('uses the authenticated owner and a trimmed answer in the atomic save', async () => {
    expect(
      await saveKnowledgeAction(
        {},
        answer({ user_id: 'forged-owner', question: 'forged question' }),
      ),
    ).toEqual({ saved: true });
    expect(mocks.rpc).toHaveBeenCalledWith('answer_chat_question', {
      p_id: 42,
      p_user_id: 'rep-id',
      p_public_question: 'How long does it take?',
      p_answer: 'Two weeks.',
      p_topic: 'faq',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings');
  });

  const invalidAnswers: Record<string, string>[] = [
    { content: '  ' },
    { public_question: '  ' },
    { content: 'x'.repeat(20_001) },
    { unanswered_id: '-1' },
    { unanswered_id: '1.5' },
    { unanswered_id: '9007199254740992' },
  ];
  it.each(invalidAnswers)('rejects invalid answers or IDs', async (fields) => {
    expect(await saveKnowledgeAction({}, answer(fields))).toHaveProperty('error');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reports a full knowledge topic without claiming success', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'knowledge_too_long' } });
    expect(await saveKnowledgeAction({}, answer())).toEqual({
      error: 'That topic is full. Shorten it in your knowledge base, then try again.',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not call the service client when authentication fails', async () => {
    mocks.requireRep.mockRejectedValue(new Error('unauthenticated'));
    await expect(saveKnowledgeAction({}, answer())).rejects.toThrow('unauthenticated');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('dismissing an unanswered question', () => {
  it('scopes the update to an open row owned by the authenticated rep', async () => {
    const query = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 42 }], error: null }),
    };
    mocks.from.mockReturnValue(query);
    expect(await dismissUnansweredAction({}, answer())).toEqual({ saved: true });
    expect(mocks.from).toHaveBeenCalledWith('chat_unanswered');
    expect(query.update).toHaveBeenCalledWith({ resolved_at: expect.any(String) });
    expect(query.eq).toHaveBeenCalledWith('id', 42);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'rep-id');
    expect(query.is).toHaveBeenCalledWith('resolved_at', null);
  });

  it.each([
    { data: [], error: null },
    { data: null, error: { message: 'failed' } },
  ])('reports missing rows or failed updates', async (result) => {
    const query = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue(result),
    };
    mocks.from.mockReturnValue(query);
    expect(await dismissUnansweredAction({}, answer())).toHaveProperty('error');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
