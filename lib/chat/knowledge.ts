const COMMON_QUESTIONS = [
  { label: 'Price range', topic: 'pricing', matches: ['pricing', 'price range', 'cost'] },
  { label: 'How it works', topic: 'services', matches: ['services', 'how it works', 'process'] },
  { label: 'Timeline', topic: 'timeline', matches: ['timeline', 'onboarding', 'timescale'] },
  {
    label: 'Proof or examples',
    topic: 'proof',
    matches: ['proof', 'examples', 'case studies', 'testimonials'],
  },
  { label: 'Who it is for', topic: 'about', matches: ['about', 'audience', 'who it is for'] },
];

/** Topic coverage is a setup hint, not a judgement of the answer's quality. */
export function commonQuestions(knowledge: { topic: string; content: string }[]) {
  const topics = new Set(
    knowledge.filter((k) => k.content.trim()).map((k) => k.topic.trim().toLowerCase()),
  );
  return COMMON_QUESTIONS.map(({ label, topic, matches }) => ({
    label,
    topic,
    covered: matches.some((match) => topics.has(match)),
  }));
}
