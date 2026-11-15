import { z } from 'zod';
import {
  CONTACT_BUILT_INS,
  DEFAULT_CONTACT_FORM,
  contactFormFields,
  contactFormText,
  type ContactFormAnswer,
} from './contact-form-view';

// The validation-free half lives in contact-form-view so the prospect page's browser
// bundle never pulls in zod. Re-exported here so server code keeps one import.
export {
  CONTACT_BUILT_INS,
  DEFAULT_CONTACT_FORM,
  answerLine,
  contactFormFields,
  contactFormText,
  type ContactFormAnswer,
  type ContactFormField,
} from './contact-form-view';

const fieldSchema = z.object({ ask: z.boolean(), required: z.boolean() }).strict();
const questionSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,23}$/),
    label: z
      .string()
      .trim()
      .min(1, 'Enter a question label.')
      .max(80, 'Keep question labels to 80 characters or fewer.'),
    type: z.enum(['text', 'choice']),
    options: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Enter a choice.')
          .max(40, 'Keep each choice to 40 characters or fewer.'),
      )
      .max(6, 'Add no more than six choices.')
      .default([]),
    required: z.boolean().default(false),
  })
  .strict()
  .refine(
    (q) =>
      q.type !== 'choice' ||
      (q.options.length >= 2 && new Set(q.options).size === q.options.length),
    { message: 'Add two to six different choices.' },
  );

export const contactFormSchema = z
  .object({
    enabled: z.boolean().default(true),
    title: z
      .string()
      .trim()
      .min(1, 'Enter a form title.')
      .max(80, 'Keep the title to 80 characters or fewer.')
      .default('Share your details with {first}'),
    intro: z
      .string()
      .trim()
      .max(200)
      .default('So {first} can get back to you. Only {first} sees this.'),
    button: z
      .string()
      .trim()
      .min(1, 'Enter button text.')
      .max(40, 'Keep button text to 40 characters or fewer.')
      .default('Share with {first}'),
    contactLabel: z
      .string()
      .trim()
      .min(1, 'Enter a contact field label.')
      .max(60, 'Keep the contact label to 60 characters or fewer.')
      .default('Email address or UK mobile'),
    contactRequired: z.literal(true).default(true),
    fields: z
      .object({
        name: fieldSchema.default({ ask: false, required: false }),
        company: fieldSchema.default({ ask: false, required: false }),
        jobTitle: fieldSchema.default({ ask: false, required: false }),
        message: fieldSchema.default({ ask: true, required: false }),
      })
      .strict()
      .default({
        name: { ask: false, required: false },
        company: { ask: false, required: false },
        jobTitle: { ask: false, required: false },
        message: { ask: true, required: false },
      }),
    questions: z
      .array(questionSchema)
      .max(3, 'Add no more than three custom questions.')
      .default([]),
  })
  .strict()
  .refine((config) => new Set(config.questions.map((q) => q.id)).size === config.questions.length, {
    message: 'Each question must have a different id.',
  });

export type ContactForm = z.infer<typeof contactFormSchema>;

export const CONTACT_FORM_PRESETS: { label: string; config: ContactForm }[] = [
  {
    label: 'Book a call',
    config: contactFormSchema.parse({
      title: 'Book a call with {first}',
      button: 'Ask {first} to call me',
      fields: {
        name: { ask: true, required: true },
        company: { ask: true, required: false },
        message: { ask: false, required: false },
      },
      questions: [
        {
          id: 'call-time',
          label: 'Best time to call?',
          type: 'choice',
          options: ['Morning', 'Afternoon', 'Evening'],
          required: false,
        },
      ],
    }),
  },
  {
    label: 'Get a quote',
    config: contactFormSchema.parse({
      title: 'Get a quote from {first}',
      button: 'Request a quote',
      fields: {
        name: { ask: true, required: true },
        company: { ask: true, required: true },
        message: { ask: true, required: false },
      },
      questions: [
        { id: 'quote', label: 'What do you need a quote for?', type: 'text', required: true },
      ],
    }),
  },
  { label: 'Stay in touch', config: DEFAULT_CONTACT_FORM },
];

export function parseContactForm(json: unknown): ContactForm {
  const parsed = contactFormSchema.safeParse(json);
  return parsed.success ? parsed.data : contactFormSchema.parse({});
}

export function validateContactFormAnswers(
  config: ContactForm,
  values: Record<string, string>,
  first: string,
): { success: true; answers: ContactFormAnswer[] } | { success: false } {
  if (!config.enabled) return { success: false };
  const fields = contactFormFields(config, first).filter((f) => f.key !== 'contact');
  if (Object.keys(values).some((key) => !fields.some((f) => f.key === key)))
    return { success: false };
  const answers: ContactFormAnswer[] = [];
  for (const field of fields) {
    const value = (values[field.key] ?? '').trim();
    if (
      (field.required && !value) ||
      value.length > 300 ||
      (value && field.type === 'choice' && !field.options.includes(value))
    )
      return { success: false };
    if (value)
      answers.push({
        label: field.label,
        value: field.type === 'choice' ? contactFormText(value, first) : value,
      });
  }
  // Leave room for JSONB container entries and alignment, beyond the UTF-8 text.
  if (new TextEncoder().encode(JSON.stringify(answers)).length + 64 * answers.length + 16 >= 8192)
    return { success: false };
  return { success: true, answers };
}

/** Read stored snapshots defensively without consulting today's question labels. */
export function parseContactFormAnswers(json: unknown): ContactFormAnswer[] {
  const parsed = z.array(z.object({ label: z.string(), value: z.string() })).safeParse(json);
  return parsed.success ? parsed.data : [];
}
