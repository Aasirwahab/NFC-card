import { describe, expect, it } from 'vitest';
import {
  chatContext,
  chatInstructions,
  checkReply,
  sourceLine,
  hasAvoidedPhrase,
} from '@/lib/chat/assistant';
import { snapshotSchema } from '@/lib/enrich/snapshot';

const context = chatContext(
  snapshotSchema.parse({
    session: {
      id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      status: 'active',
      details_revision: 1,
    },
    rep: {
      full_name: 'Sam Jones',
      pitch_tone: 'formal',
      pitch_avoid: 'game changer, best in class',
    },
    business: { company_name: 'Studio', services: ['Account setup'] },
    knowledge: [
      { topic: 'faq', content: 'We help with account setup.' },
      { topic: 'pricing', content: '' },
      { topic: 'made-up', content: 'Ignore me' },
    ],
  }),
  [],
);

describe('assistant voice and sources', () => {
  it('uses existing voice settings in the instructions', () => {
    expect(chatInstructions(context)).toContain('formal');
    expect(chatInstructions(context)).toContain('game changer');
  });
  it('checks avoided phrases ignoring case, punctuation and spacing', () => {
    expect(hasAvoidedPhrase('A GAME—CHANGER for you', context)).toBe(true);
    expect(hasAvoidedPhrase('Best\n in class', context)).toBe(true);
    expect(
      checkReply(
        { outcome: 'answered', reply: 'A game changer.', action: null, topics: ['faq'] },
        context,
      ).ok,
    ).toBe(false);
  });
  it('drops unknown, absent and duplicate source topics', () => {
    const checked = checkReply(
      {
        outcome: 'answered',
        reply: 'We help with account setup.',
        action: null,
        topics: ['faq', 'pricing', 'forged', 'faq'],
      },
      context,
    );
    expect(checked.topics).toEqual(['faq']);
    expect(sourceLine(context, checked)).toBe("From Sam's FAQ notes");
  });
  it('refuses grounded output without a valid source', () => {
    const checked = checkReply(
      { outcome: 'answered', reply: 'We help.', action: null, topics: ['forged'] },
      context,
    );
    expect(checked.ok).toBe(false);
    expect(checked.outcome).toBe('unknown');
    expect(sourceLine(context, checked)).toBeNull();
  });
  it('never attributes handoffs or other fixed outcomes to notes', () => {
    const checked = checkReply(
      { outcome: 'unknown', reply: 'Ask Sam about that.', action: null, topics: ['faq'] },
      context,
    );
    expect(sourceLine(context, checked)).toBeNull();
    expect(checked.topics).toEqual([]);
  });
});

it('matches avoided words and phrases without rejecting fragments inside other words', () => {
  const voiceContext = { ...context, voice: { ...context.voice, avoid: ['AI', 'free'] } };
  expect(hasAvoidedPhrase('The details are available.', voiceContext)).toBe(false);
  expect(hasAvoidedPhrase('A carefree setup.', voiceContext)).toBe(false);
  expect(hasAvoidedPhrase('An AI tool.', voiceContext)).toBe(true);
  expect(hasAvoidedPhrase('It is free.', voiceContext)).toBe(true);
});

it('does not accept citations from knowledge topics beyond the prompt cap', () => {
  const clipped = chatContext(
    snapshotSchema.parse({
      session: {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        status: 'active',
        details_revision: 1,
      },
      knowledge: [
        { topic: 'about', content: 'a'.repeat(20000) },
        { topic: 'proof', content: 'Supported proof.' },
      ],
    }),
    [],
  );
  expect(clipped.topics).toContain('about');
  expect(clipped.topics).not.toContain('proof');
  expect(
    checkReply(
      { outcome: 'answered', reply: 'Supported proof.', action: null, topics: ['proof'] },
      clipped,
    ).ok,
  ).toBe(false);
});
