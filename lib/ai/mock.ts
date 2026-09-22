import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';

/**
 * The offline model (spec §25.1: "Local — mock provider — the whole pipeline
 * runs offline").
 *
 * These are real AI SDK models, so the pipeline code under test is exactly the
 * code that runs against a real provider: generateText, structured output,
 * schema validation, all of it. Only the text generation is canned — and it
 * reads the actual prompt, so its output tracks the inputs rather than being a
 * fixed string.
 *
 * WHAT THE MOCK CANNOT DO is prove the pitch is good. Its output is a
 * deterministic arrangement of the brief, which is why production refuses to
 * run the pipeline on it (lib/jobs/handlers.ts): real prospects get either a
 * real model's pitch or the designed template, never this.
 */

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

/** All the user-facing text of a call, joined — where our tagged blocks live. */
function promptText(options: LanguageModelV4CallOptions): string {
  return options.prompt
    .flatMap((message) =>
      message.role === 'user'
        ? message.content.flatMap((part) => (part.type === 'text' ? [part.text] : []))
        : [],
    )
    .join('\n');
}

function between(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1]!.trim() : null;
}

function reply(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: USAGE,
    warnings: [],
  };
}

// ----------------------------------------------------------------- research

/**
 * Picks the first few well-formed sentences from the <website> block and
 * returns them as facts whose quote IS the sentence — so they survive the
 * verbatim-quote check, just as a well-behaved real model's would.
 */
export function mockResearchModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId: 'mock-research',
    doGenerate: async (options) => {
      const site = between(promptText(options), 'website') ?? '';
      const sentences = site
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 30 && s.length <= 220 && /^[A-Z]/.test(s));

      return reply(
        JSON.stringify({
          summary: sentences[0] ?? null,
          facts: sentences.slice(0, 3).map((s) => ({ fact: s, quote: s })),
        }),
      );
    },
  });
}

// -------------------------------------------------------------------- pitch

type MockBrief = {
  met_at?: string | null;
  problem_they_raised?: string | null;
  they?: { firstName?: string | null; company?: string | null };
  public_facts_about_their_company?: string[];
  salesperson?: { firstName?: string };
  business?: { name?: string | null; services?: string[] };
};

function lowerFirst(text: string): string {
  const first = text.split(/\s+/)[0] ?? '';
  return first.length > 1 && first === first.toUpperCase()
    ? text
    : text[0]!.toLowerCase() + text.slice(1);
}

/** A deterministic note built from the brief, written to pass the quality gate. */
export function mockPitchModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId: 'mock-pitch',
    doGenerate: async (options) => {
      let brief: MockBrief = {};
      try {
        brief = JSON.parse(between(promptText(options), 'brief') ?? '{}') as MockBrief;
      } catch {
        // Unparseable brief: fall through to a generic but valid note.
      }

      const problem = brief.problem_they_raised ? lowerFirst(brief.problem_they_raised) : null;
      const company = brief.they?.company;
      const fact = brief.public_facts_about_their_company?.[0];
      const services = (brief.business?.services ?? []).slice(0, 2);
      const doer = brief.business?.name ? `${brief.business.name} works` : 'We work';
      const rep = brief.salesperson?.firstName ?? 'the team';

      const paragraphs = [
        [
          brief.met_at ? `It was good to meet you at ${brief.met_at}.` : 'It was good to meet you.',
          problem
            ? `You mentioned ${problem}${company ? ` at ${company}` : ''}, and that is the kind of problem we spend most of our week on.`
            : 'I wanted to follow up properly rather than leave you with a card.',
        ].join(' '),
        fact
          ? `${fact.replace(/[.!?]$/, '')} — so getting this right is worth more to you than most.`
          : 'Getting this right usually matters more than it looks from the outside.',
        services.length > 0
          ? `${doer} on ${services.map(lowerFirst).join(' and ')}, and the honest answer to whether we can help takes about fifteen minutes to give properly.`
          : 'The honest answer to whether we can help takes about fifteen minutes to give properly.',
        `If it would be useful, book 15 minutes below and I will come with specifics rather than a brochure.\n— ${rep}`,
      ];

      return reply(paragraphs.join('\n\n'));
    },
  });
}

// --------------------------------------------------------------------- chat

/** The system instructions, where the chatbot's <knowledge> block lives. */
function systemText(options: LanguageModelV4CallOptions): string {
  return options.prompt
    .flatMap((message) => (message.role === 'system' ? [message.content] : []))
    .join('\n');
}

/**
 * An offline chatbot (§18). It answers from the first line of the knowledge block
 * and hands anything more to the rep — the shape a well-behaved real model's
 * answer should take, so the widget and the guardrails can be exercised locally.
 */
export function mockChatModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId: 'mock-chat',
    doGenerate: async (options) => {
      // The rules mention "<knowledge>" before the block itself: read the LAST one.
      const system = systemText(options);
      const start = system.lastIndexOf('<knowledge>');
      const end = system.lastIndexOf('</knowledge>');
      const knowledge = start >= 0 && end > start ? system.slice(start + 11, end) : '';
      const first = knowledge
        .split('\n')
        .map((line) => line.trim())
        // A sentence, not the bare company name that heads the block.
        .find((line) => line.length >= 20);
      const rep = system.match(/^You are (\S+?)’s assistant/m)?.[1] ?? 'The team';

      return reply(
        first
          ? `Good question. ${first.replace(/[.!?]?$/, '.')} For the detail on your setup, ${rep} can give you a straight answer — book 15 minutes below.`
          : `That’s one ${rep} can answer properly — book 15 minutes below.`,
      );
    },
  });
}
