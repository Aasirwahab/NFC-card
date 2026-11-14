import { z } from 'zod';

export const BLOCKED_TOPIC_PRESETS = [
  { value: 'pricing', label: 'Pricing and discounts' },
  { value: 'legal', label: 'Contracts and legal' },
  { value: 'delivery', label: 'Delivery dates' },
  { value: 'competitors', label: 'Competitors' },
] as const;

export const blockedTopicsSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(20)
  .transform((topics) => [...new Set(topics)])
  .refine(
    (topics) =>
      topics.filter((topic) => !BLOCKED_TOPIC_PRESETS.some((preset) => preset.value === topic))
        .length <= 5,
    'Add up to five custom topics.',
  );

const TOPIC_QUESTIONS = [
  { topic: 'pricing', question: 'What does it cost?' },
  { topic: 'services', question: 'How does your service work?' },
  { topic: 'timeline', question: 'How long does setup take?' },
  { topic: 'proof', question: 'Can you share an example of your work?' },
  { topic: 'about', question: 'Who do you work with?' },
  { topic: 'faq', question: 'What should I know before getting started?' },
  { topic: 'niche', question: 'What makes your approach different?' },
];

/** Suggestions use only the rep's own problems and gaps in their saved notes. */
export function suggestedAssistantQuestions(
  problems: string[],
  knowledge: { topic: string; content: string }[],
): string[] {
  const covered = new Set(
    knowledge.filter((entry) => entry.content.trim()).map((entry) => entry.topic),
  );
  const problem = problems.find((value) => value.trim());
  return [
    ...new Set([
      ...(problem ? [`How can you help with ${problem.trim().slice(0, 200)}?`] : []),
      ...TOPIC_QUESTIONS.filter((entry) => !covered.has(entry.topic)).map(
        (entry) => entry.question,
      ),
      'What services do you offer?',
      'How can I get in touch?',
      'What happens next?',
    ]),
  ].slice(0, 3);
}
