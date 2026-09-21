import 'server-only';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import type { ResearchCache, Semaphore } from './pipeline';

/**
 * The Redis-backed halves of the pipeline (spec §9: "rate limits, concurrency
 * semaphore, research cache"). Both FAIL SAFE, as §24.3 requires:
 *
 *   - the cache fails OPEN: a Redis error is a cache miss, and the job simply
 *     does the research itself;
 *   - the semaphore fails to a CONSERVATIVE in-process limit: with Redis down,
 *     each instance allows a small fixed number of concurrent model calls.
 */

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

/** Bumping this invalidates every cached entry — for when the shape changes. */
const CACHE_VERSION = 'v1';

function logRedis(event: string, error: unknown) {
  console.error(
    JSON.stringify({ event, error: error instanceof Error ? error.message : String(error) }),
  );
}

export const redisResearchCache: ResearchCache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;
    try {
      return (await redis.get<T>(`taplead:${CACHE_VERSION}:${key}`)) ?? null;
    } catch (error) {
      logRedis('research_cache_unavailable', error);
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!redis) return;
    try {
      await redis.set(`taplead:${CACHE_VERSION}:${key}`, value, { ex: ttlSeconds });
    } catch (error) {
      logRedis('research_cache_unavailable', error);
    }
  },
};

// ------------------------------------------------------------ the semaphore

/**
 * A counting semaphore as a sorted set of leases, scored by expiry. Taking a
 * lease drops expired ones first, so a worker that died holding one frees it
 * after the lease time rather than leaking a slot forever. One Lua script, so
 * the count and the take are atomic.
 */
const ACQUIRE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[2]) then
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
  return 1
end
return 0
`;

const KEY = 'taplead:semaphore:model';
/** Longer than any single model call is allowed to take. */
const LEASE_MS = 3 * 60_000;
/** §24.3: "concurrency falls back to a conservative constant". Per instance. */
const FALLBACK_LIMIT = 2;

let localInUse = 0;

function localLease(): (() => Promise<void>) | null {
  if (localInUse >= FALLBACK_LIMIT) return null;
  localInUse++;
  let released = false;
  return async () => {
    if (!released) {
      released = true;
      localInUse--;
    }
  };
}

export function createModelSemaphore(limit: number = env.JOB_CONCURRENCY): Semaphore {
  return {
    async tryAcquire() {
      if (!redis) return localLease();

      const lease = crypto.randomUUID();
      const now = Date.now();
      try {
        const granted = await redis.eval<[string, number, number, string, number], number>(
          ACQUIRE,
          [KEY],
          [String(now), limit, now + LEASE_MS, lease, LEASE_MS],
        );
        if (granted !== 1) return null;
      } catch (error) {
        logRedis('semaphore_unavailable', error);
        return localLease();
      }

      return async () => {
        try {
          await redis.zrem(KEY, lease);
        } catch (error) {
          // The lease expires on its own; failing to release early only delays
          // the next caller.
          logRedis('semaphore_release_failed', error);
        }
      };
    },
  };
}
