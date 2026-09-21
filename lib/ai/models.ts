import 'server-only';
import { createGateway, type LanguageModel } from 'ai';
import { env } from '@/lib/env';
import { mockPitchModel, mockResearchModel } from './mock';

/**
 * The one place a model is chosen (§14.3: "swap providers in one config file").
 *
 * Every call goes through the AI SDK against the Vercel AI Gateway, with model
 * ids as configuration — "anthropic/claude-opus-5", "openai/…" — so changing
 * provider is an environment variable, not a code change. The gateway is a
 * sub-processor in its own right: it belongs on the §23 list alongside the
 * provider it routes to.
 */

export type ModelRole = 'research' | 'pitch';

export type ResolvedModel = {
  /** Recorded with the pitch as generated_pitch_model, and part of the research cache key. */
  id: string;
  model: LanguageModel;
};

const gateway = env.MODEL_API_KEY ? createGateway({ apiKey: env.MODEL_API_KEY }) : null;

function idFor(role: ModelRole): string {
  return role === 'pitch' ? env.MODEL_PITCH : (env.MODEL_RESEARCH ?? env.MODEL_CHAT);
}

export function modelFor(role: ModelRole): ResolvedModel {
  const id = idFor(role);

  if (id === 'mock') {
    return { id, model: role === 'pitch' ? mockPitchModel() : mockResearchModel() };
  }

  if (!gateway) {
    // The env schema makes this unreachable; it stays as a loud failure rather
    // than a silent fallback to the mock.
    throw new Error(`MODEL_API_KEY is required to use model "${id}"`);
  }

  return { id, model: gateway(id) };
}

/** True when the pitch would be written by the offline mock rather than a real model. */
export function pitchUsesMock(): boolean {
  return idFor('pitch') === 'mock';
}
