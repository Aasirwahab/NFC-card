/**
 * Jev: a fast typed-decision model (TypeSafe "System One", on OpenRouter). It
 * classifies, picks and scores; it never writes, extracts or explains, and it
 * never decides anything about people or money.
 *
 * Rules this module enforces (decisions 2026-09-29, see the vault note
 * INSIGNAR_JEV_LAYER_AND_AI_STANDARD):
 *   - FAIL SAFE: any failure, timeout or odd answer becomes `null`, and the
 *     caller decides what null means (usually: the rep taps).
 *   - The caller sends business-level text only. No emails, phones, LinkedIn
 *     links or private notes: `scrubPersonalFields` cuts out emails and phone numbers.
 *
 * PURE apart from the injected `post`, so it is tested without a network.
 */

export type JevPost = (body: Record<string, unknown>) => Promise<unknown>;

export type JevPick<T extends string> = {
  choice: T | 'other';
  confidence: number;
  probabilities: Record<string, number>;
};

export type JevClient = {
  /** Probability (0 to 1) that the statement holds, or null when unavailable. */
  yes(input: {
    state: string;
    question: string;
    yes?: string;
    no?: string;
  }): Promise<number | null>;
  /** One choice among the options, or null. */
  pick<T extends string>(input: {
    state: string;
    question: string;
    options: Record<T, string>;
  }): Promise<JevPick<T> | null>;
};

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+|00)?\d[\d\s().-]{8,}\d/g;

/**
 * Contact details never go to the decision model. Real search snippets often carry a
 * company's phone number or an email address ("Call +49 89 ..."), so instead of
 * refusing them we cut them out before sending. PURE; exported for tests.
 */
export function scrubPersonalFields(state: string): string {
  return state.replace(EMAIL, '[contact removed]').replace(PHONE, '[contact removed]');
}

function asProbability(value: unknown): number | null {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : null;
}

export function createJev(post: JevPost, options: { model: string }): JevClient {
  const model = options.model;

  return {
    async yes({ state: rawState, question, yes, no }) {
      const state = scrubPersonalFields(rawState);
      const q: Record<string, unknown> = { type: 'noul', instructions: question };
      if (yes !== undefined || no !== undefined) q.criteria = { true: yes ?? '', false: no ?? '' };
      try {
        const response = (await post({ model, state, questions: { answer: q } })) as {
          answers?: { answer?: { noul?: unknown } };
        };
        return asProbability(response?.answers?.answer?.noul);
      } catch {
        return null;
      }
    },

    async pick({ state: rawState, question, options: opts }) {
      const state = scrubPersonalFields(rawState);
      const criteria: Record<string, string> = { ...opts, other: 'None of the above' };
      try {
        const response = (await post({
          model,
          state,
          questions: { answer: { type: 'choice', instructions: question, criteria } },
        })) as {
          answers?: {
            answer?: { choice?: unknown; confidence?: unknown; probabilities?: unknown };
          };
        };
        const a = response?.answers?.answer;
        const choice = typeof a?.choice === 'string' ? a.choice : null;
        const confidence = asProbability(a?.confidence);
        if (!choice || confidence === null || !(choice in criteria)) return null;
        const probabilities: Record<string, number> = {};
        for (const [key, value] of Object.entries(
          (a?.probabilities ?? {}) as Record<string, unknown>,
        )) {
          const p = asProbability(value);
          if (p !== null) probabilities[key] = p;
        }
        return { choice: choice as JevPick<never>['choice'], confidence, probabilities };
      } catch {
        return null;
      }
    },
  };
}
