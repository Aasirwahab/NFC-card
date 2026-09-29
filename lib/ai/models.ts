import 'server-only';
import { createGateway, type LanguageModel } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/lib/env';
import { mockChatModel, mockPitchModel, mockResearchModel } from './mock';

/**
 * The one place a model is chosen (§14.3: "swap providers in one config file").
 *
 * Every call goes through the AI SDK against the Vercel AI Gateway, with model
 * ids as configuration — "anthropic/claude-opus-5", "openai/…" — so changing
 * provider is an environment variable, not a code change. The gateway is a
 * sub-processor in its own right: it belongs on the §23 list alongside the
 * provider it routes to.
 */

export type ModelRole = 'research' | 'pitch' | 'chat';

export type ResolvedModel = {
  /** Recorded with the pitch as generated_pitch_model, and part of the research cache key. */
  id: string;
  model: LanguageModel;
};

const gateway = env.MODEL_API_KEY
  ? env.MODEL_PROVIDER === 'openrouter'
    ? createOpenRouter({
        apiKey: env.MODEL_API_KEY,
        // Prompts hold prospect and business text: route only to endpoints that keep
        // nothing and train on nothing. If no such endpoint serves the model, the
        // call fails, and the pipeline falls back to the template rather than
        // sending the text anywhere less private.
        extraBody: { provider: { zdr: true, data_collection: 'deny' } },
      })
    : createGateway({ apiKey: env.MODEL_API_KEY })
  : null;

function idFor(role: ModelRole): string {
  if (role === 'pitch') return env.MODEL_PITCH;
  if (role === 'chat') return env.MODEL_CHAT;
  return env.MODEL_RESEARCH ?? env.MODEL_CHAT;
}

export function modelFor(role: ModelRole): ResolvedModel {
  const id = idFor(role);

  if (id === 'mock') {
    const mock =
      role === 'pitch' ? mockPitchModel() : role === 'chat' ? mockChatModel() : mockResearchModel();
    return { id, model: mock };
  }

  if (!gateway) {
    // The env schema makes this unreachable; it stays as a loud failure rather
    // than a silent fallback to the mock.
    throw new Error(`MODEL_API_KEY is required to use model "${id}"`);
  }

  return { id, model: gateway(id) as LanguageModel };
}

/** True when the pitch would be written by the offline mock rather than a real model. */
export function pitchUsesMock(): boolean {
  return idFor('pitch') === 'mock';
}
