import 'server-only';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

/**
 * "Has this already happened in the last N seconds?"
 *
 * Used for the 60-second same-IP view dedupe (§10.4). Separate from the rate
 * limiters because the semantics differ: a limiter refuses a request, this one
 * suppresses a side effect while the request itself proceeds normally.
 */

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

/**
 * Returns true if the caller is the first to claim `key` within `seconds`.
 *
 * Fails OPEN: with no Redis, or with Redis unreachable, every caller wins the
 * claim. For the view counter that means a refresh may be counted twice, which is
 * a slightly inflated number — strictly better than a page that fails to render
 * or a first view that goes unrecorded, since an unrecorded first view silently
 * suppresses the no-tap follow-up (§19.3).
 */
export async function claimOnce(key: string, seconds: number): Promise<boolean> {
  if (!redis) return true;

  try {
    const result = await redis.set(`taplead:once:${key}`, '1', { nx: true, ex: seconds });
    return result === 'OK';
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'dedupe_unavailable',
        key,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return true;
  }
}
