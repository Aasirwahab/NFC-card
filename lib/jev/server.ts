import 'server-only';
import { env } from '@/lib/env';
import { callFixedApi } from '@/lib/http/fixed-api';
import { createJev, type JevClient } from './client';

/**
 * The production Jev client: OpenRouter's decisions endpoint with our key, the
 * zero-retention routing flags, a 2.5 s timeout (the first call on a cold connection can take over a second) and one retry on a network or 5xx
 * failure. Null when Jev is switched off or there is no OpenRouter key (the
 * gateway path has none), and every caller treats null as "no opinion".
 */
let cached: JevClient | null | undefined;

export function jevClient(): JevClient | null {
  if (cached !== undefined) return cached;

  if (!env.JEV_ENABLED || env.MODEL_PROVIDER !== 'openrouter' || !env.MODEL_API_KEY) {
    cached = null;
    return cached;
  }

  const key = env.MODEL_API_KEY;
  const post = async (body: Record<string, unknown>): Promise<unknown> => {
    const request = {
      url: 'https://openrouter.ai/api/alpha/decisions',
      headers: { authorization: `Bearer ${key}` },
      body: { ...body, provider: { zdr: true, data_collection: 'deny' } },
      timeoutMs: 2_500,
    };
    const log = (error: unknown) =>
      console.warn(
        JSON.stringify({
          event: 'jev_failed',
          reason: (error as { reason?: string }).reason ?? 'unknown',
          status: (error as { status?: number }).status ?? null,
        }),
      );
    try {
      return await callFixedApi(request);
    } catch (first) {
      // One retry for a blip. Never for a refusal (4xx): that would repeat itself.
      const status = (first as { status?: number }).status;
      if (status !== undefined && status < 500 && status !== 429) {
        log(first);
        throw first;
      }
      try {
        return await callFixedApi(request);
      } catch (second) {
        log(second);
        throw second;
      }
    }
  };

  cached = createJev(post, { model: env.JEV_MODEL });
  return cached;
}
