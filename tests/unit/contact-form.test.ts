import { describe, expect, it } from 'vitest';
import {
  CONTACT_FORM_PRESETS,
  DEFAULT_CONTACT_FORM,
  contactFormSchema,
  parseContactForm,
  contactFormFields,
  contactFormText,
  validateContactFormAnswers,
} from '@/lib/domain/contact-form';

describe('custom contact forms', () => {
  it('supplies the default config and requires contact within the optional form', () => {
    expect(contactFormSchema.parse({})).toEqual(DEFAULT_CONTACT_FORM);
    expect(DEFAULT_CONTACT_FORM.contactRequired).toBe(true);
    expect(contactFormFields(DEFAULT_CONTACT_FORM, 'Sam').map((f) => f.key)).toEqual([
      'contact',
      'message',
    ]);
  });
  it.each([
    null,
    [],
    'bad',
    { title: '' },
    {
      questions: [{ id: 'one', label: 'Pick', type: 'choice', options: ['One'], required: false }],
    },
  ])('falls back safely for %j', (json) => {
    expect(parseContactForm(json)).toEqual(DEFAULT_CONTACT_FORM);
  });
  it('substitutes each first name token without interpreting the name', () => {
    expect(contactFormText('{first} to {first}', 'A$&')).toBe('A$& to A$&');
  });
  it('builds ordered fields and validates required answers and choice membership', () => {
    const config = contactFormSchema.parse({
      fields: {
        name: { ask: true, required: true },
        company: { ask: true, required: false },
        jobTitle: { ask: true, required: false },
      },
      questions: [
        { id: 'timing', label: 'When?', type: 'choice', options: ['Now', 'Later'], required: true },
      ],
    });
    expect(contactFormFields(config, 'Sam').map((f) => f.key)).toEqual([
      'contact',
      'name',
      'company',
      'jobTitle',
      'question:timing',
      'message',
    ]);
    expect(validateContactFormAnswers(config, {}, 'Sam').success).toBe(false);
    expect(
      validateContactFormAnswers(config, { name: 'Alex', 'question:timing': 'Never' }, 'Sam')
        .success,
    ).toBe(false);
    expect(
      validateContactFormAnswers(config, { name: ' Alex ', 'question:timing': 'Now' }, 'Sam'),
    ).toEqual({
      success: true,
      answers: [
        { label: 'Name', value: 'Alex' },
        { label: 'When?', value: 'Now' },
      ],
    });
  });
  it('substitutes names in a selected choice snapshot while validating its configured value', () => {
    const config = contactFormSchema.parse({
      questions: [
        {
          id: 'reply',
          label: 'Reply from {first}?',
          type: 'choice',
          options: ['Ask {first}', 'No thanks'],
          required: false,
        },
      ],
    });
    expect(validateContactFormAnswers(config, { 'question:reply': 'Ask {first}' }, 'Sam')).toEqual({
      success: true,
      answers: [{ label: 'Reply from Sam?', value: 'Ask Sam' }],
    });
  });
  it('rejects unknown fields, hidden fields, overlong values and disabled forms', () => {
    for (const answers of [{ other: 'x' }, { name: 'x' }, { message: 'x'.repeat(301) }] as Record<
      string,
      string
    >[]) {
      expect(validateContactFormAnswers(DEFAULT_CONTACT_FORM, answers, 'Sam').success).toBe(false);
    }
    expect(
      validateContactFormAnswers({ ...DEFAULT_CONTACT_FORM, enabled: false }, {}, 'Sam').success,
    ).toBe(false);
  });
  it('rejects answer snapshots that exceed the storage budget after name substitution', () => {
    const config = contactFormSchema.parse({
      questions: [0, 1, 2].map((i) => ({
        id: `q${i}`,
        label: '{first}'.repeat(11),
        type: 'text',
        options: [],
        required: false,
      })),
    });
    expect(
      validateContactFormAnswers(
        config,
        {
          'question:q0': 'x'.repeat(300),
          'question:q1': 'x'.repeat(300),
          'question:q2': 'x'.repeat(300),
        },
        '界'.repeat(160),
      ).success,
    ).toBe(false);
  });
  it('rejects duplicate and reserved question ids, too many questions and invalid choice options', () => {
    const q = { id: 'same', label: 'Question', type: 'text', options: [], required: false };
    expect(contactFormSchema.safeParse({ questions: [q, q] }).success).toBe(false);
    expect(contactFormSchema.safeParse({ questions: [{ ...q, id: '__proto__' }] }).success).toBe(
      false,
    );
    expect(contactFormSchema.safeParse({ questions: [q, q, q, q] }).success).toBe(false);
    expect(contactFormSchema.safeParse({ contactRequired: false }).success).toBe(false);
  });
});

describe('answerLine', () => {
  it('adds a colon only when the label has no closing punctuation', async () => {
    const { answerLine } = await import('@/lib/domain/contact-form');
    expect(answerLine({ label: 'Name', value: 'Tom' })).toBe('Name: Tom');
    expect(answerLine({ label: 'What are you after?', value: 'Reviews' })).toBe(
      'What are you after? Reviews',
    );
  });
});

// Presets must remain usable by the same prospect form and server validator.

it('provides the three complete, valid preset configurations', () => {
  expect(CONTACT_FORM_PRESETS.map((p) => p.label)).toEqual([
    'Book a call',
    'Get a quote',
    'Stay in touch',
  ]);
  for (const preset of CONTACT_FORM_PRESETS)
    expect(contactFormSchema.parse(preset.config)).toEqual(preset.config);
  const [call, quote, stay] = CONTACT_FORM_PRESETS.map((p) => p.config);
  expect(call).toMatchObject({
    title: 'Book a call with {first}',
    button: 'Ask {first} to call me',
    fields: {
      name: { ask: true, required: true },
      company: { ask: true, required: false },
      message: { ask: false, required: false },
    },
    questions: [
      {
        label: 'Best time to call?',
        type: 'choice',
        options: ['Morning', 'Afternoon', 'Evening'],
        required: false,
      },
    ],
  });
  expect(quote).toMatchObject({
    title: 'Get a quote from {first}',
    button: 'Request a quote',
    fields: {
      name: { ask: true, required: true },
      company: { ask: true, required: true },
      message: { ask: true, required: false },
    },
    questions: [{ label: 'What do you need a quote for?', type: 'text', required: true }],
  });
  expect(stay).toEqual(DEFAULT_CONTACT_FORM);
});

describe('contact-form-view', () => {
  it('keeps the hand-written default equal to what the schema produces', async () => {
    const { contactFormSchema } = await import('@/lib/domain/contact-form');
    const { DEFAULT_CONTACT_FORM } = await import('@/lib/domain/contact-form-view');
    expect(DEFAULT_CONTACT_FORM).toEqual(contactFormSchema.parse({}));
  });

  it('never imports zod at runtime, so the prospect page stays light', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('lib/domain/contact-form-view.ts', 'utf8');
    expect(source).not.toMatch(/from 'zod'/);
    expect(source).not.toMatch(/^import \{[^}]*\} from '\.\/contact-form'/m);
  });
});
