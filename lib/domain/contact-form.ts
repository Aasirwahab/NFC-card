import { z } from 'zod';

const fieldSchema = z.object({ ask: z.boolean(), required: z.boolean() }).strict();
export const CONTACT_BUILT_INS = ['name', 'company', 'jobTitle', 'message'] as const;
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
export type ContactFormAnswer = { label: string; value: string };
export const DEFAULT_CONTACT_FORM: ContactForm = contactFormSchema.parse({});

export function parseContactForm(json: unknown): ContactForm {
  const parsed = contactFormSchema.safeParse(json);
  return parsed.success ? parsed.data : contactFormSchema.parse({});
}

export function contactFormText(text: string, first: string): string {
  return text.replaceAll('{first}', () => first);
}

export type ContactFormField = {
  key: string;
  label: string;
  type: 'contact' | 'text' | 'choice' | 'message';
  required: boolean;
  options: string[];
};

export function contactFormFields(config: ContactForm, first: string): ContactFormField[] {
  const labels = {
    name: 'Name',
    company: 'Company',
    jobTitle: 'Job title',
    message: `What would you like from ${first}?`,
  };
  const builtIn = (key: (typeof CONTACT_BUILT_INS)[number]): ContactFormField[] =>
    config.fields[key].ask
      ? [
          {
            key,
            label: labels[key],
            type: key === 'message' ? 'message' : 'text',
            required: config.fields[key].required,
            options: [],
          },
        ]
      : [];
  return [
    {
      key: 'contact',
      label: contactFormText(config.contactLabel, first),
      type: 'contact',
      required: true,
      options: [],
    },
    ...builtIn('name'),
    ...builtIn('company'),
    ...builtIn('jobTitle'),
    ...config.questions.map((q) => ({
      key: `question:${q.id}`,
      label: contactFormText(q.label, first),
      type: q.type,
      required: q.required,
      options: q.options,
    })),
    ...builtIn('message'),
  ];
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

/** "Name: Tom", but "Interested in? Reviews" when the label already ends in punctuation. */
export function answerLine(answer: ContactFormAnswer): string {
  return /[?:!.]$/.test(answer.label.trim())
    ? `${answer.label.trim()} ${answer.value}`
    : `${answer.label}: ${answer.value}`;
}
