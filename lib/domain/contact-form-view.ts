import type { ContactForm } from './contact-form';

export type { ContactForm };

/**
 * The validation-free half of the contact form: safe to import from browser
 * components without shipping zod to every prospect's phone. contact-form.ts holds
 * the schema and server-side validation, and a test keeps DEFAULT_CONTACT_FORM equal
 * to what the schema produces for an empty config.
 */

export const CONTACT_BUILT_INS = ['name', 'company', 'jobTitle', 'message'] as const;

export type ContactFormAnswer = { label: string; value: string };

export const DEFAULT_CONTACT_FORM: ContactForm = {
  enabled: true,
  title: 'Share your details with {first}',
  intro: 'So {first} can get back to you. Only {first} sees this.',
  button: 'Share with {first}',
  contactLabel: 'Email address or UK mobile',
  contactRequired: true,
  fields: {
    name: { ask: false, required: false },
    company: { ask: false, required: false },
    jobTitle: { ask: false, required: false },
    message: { ask: true, required: false },
  },
  questions: [],
};

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

/** "Name: Tom", but "Interested in? Reviews" when the label already ends in punctuation. */
export function answerLine(answer: ContactFormAnswer): string {
  return /[?:!.]$/.test(answer.label.trim())
    ? `${answer.label.trim()} ${answer.value}`
    : `${answer.label}: ${answer.value}`;
}
