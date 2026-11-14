import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isBlockedQuestion } from '@/lib/chat/blocked-topics';
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: mocks.generate,
}));
vi.mock('@/lib/ai/models', () => ({ modelFor: () => ({ model: 'test' }) }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.generate.mockResolvedValue({ output: { blocked: false } });
});
describe('blocked question routing', () => {
  it.each([
    ['pricing', 'Can you call me with a discount?'],
    ['legal', 'Who signs the contract?'],
    ['delivery', 'When will it be ready?'],
    ['competitors', 'Is it better than Acme?'],
    ['Security review', 'Tell me about SECURITY—REVIEW'],
  ])('routes %s keywords without any model', async (topic, message) => {
    expect(await isBlockedQuestion(message!, [topic!])).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('does no classification when no topics are blocked', async () => {
    expect(await isBlockedQuestion('What does it cost?', [])).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each(['constructor', 'toString', 'valueOf'])(
    'treats %s as a custom topic, not an inherited keyword rule',
    async (topic) => {
      expect(await isBlockedQuestion('What do you offer?', [topic])).toBe(false);
      mocks.generate.mockClear();
      expect(await isBlockedQuestion(`Tell me about ${topic}.`, [topic])).toBe(true);
      expect(mocks.generate).not.toHaveBeenCalled();
    },
  );
  it.each(['???', '-', '🤖'])('skips a topic that normalises to empty: %s', async (topic) => {
    expect(await isBlockedQuestion('What do you offer?', [topic])).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('omits empty normalised topics from classification alongside valid topics', async () => {
    expect(await isBlockedQuestion('What do you offer?', ['???', 'pricing'])).toBe(false);
    expect(JSON.parse(mocks.generate.mock.calls[0]![0].messages[0].content).blockedTopics).toEqual([
      'pricing',
    ]);
  });
  it.each([
    ['ai', 'Can you send email?'],
    ['contract', 'Do you work with subcontractors?'],
    ['security review', 'Do you provide security reviews?'],
  ])('does not match %s inside other words', async (topic, message) => {
    expect(await isBlockedQuestion(message, [topic])).toBe(false);
  });
  it.each([
    ['ai', 'AI tools'],
    ['contract', 'Who signs the contract?'],
    ['security review', 'SECURITY—REVIEW'],
    ['café', 'Tell me about the café.'],
  ])('matches %s as whole normalised words', async (topic, message) => {
    expect(await isBlockedQuestion(message, [topic])).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('uses one bounded classifier for indirect requests with only redacted question and topics', async () => {
    mocks.generate.mockResolvedValue({ output: { blocked: true } });
    expect(
      await isBlockedQuestion('What will I owe? email me at me@example.test', ['pricing']),
    ).toBe(true);
    expect(mocks.generate).toHaveBeenCalledOnce();
    const options = mocks.generate.mock.calls[0]![0];
    expect(options.maxOutputTokens).toBe(40);
    expect(JSON.stringify(options.messages)).not.toContain('me@example.test');
    expect(options.instructions).toContain('Do not answer');
  });
  it('permits an unrelated question only on a valid false classification', async () => {
    expect(await isBlockedQuestion('What do you offer?', ['pricing'])).toBe(false);
  });
  it.each([null, {}, { blocked: 'false' }])(
    'hands off malformed classifications: %j',
    async (output) => {
      mocks.generate.mockResolvedValue({ output });
      expect(await isBlockedQuestion('What will I owe?', ['pricing'])).toBe(true);
    },
  );
  it('hands off on classifier failure', async () => {
    mocks.generate.mockRejectedValue(new Error('provider failure'));
    expect(await isBlockedQuestion('What will I owe?', ['pricing'])).toBe(true);
  });
});
