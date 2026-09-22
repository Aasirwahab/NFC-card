import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

/**
 * Per-IP rate limits (spec §22.2).
 *
 * Codes are not secrets, but they are the only thing protecting a prospect's
 * details — hence the 8-character length AND these limits. The 404 limiter is the
 * one that matters: it is what makes walking the code space impractical.
 *
 * FAILS OPEN, DELIBERATELY (§24.3: "Redis down -> normal page; limits fail open,
 * logged"). The one page that must never fail is `/c/[code]`, and refusing to
 * render it because a cache is unreachable would trade a small abuse risk for the
 * exact failure this product cannot have — a prospect tapping a card and getting
 * an error.
 */

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

/** The §22.2 table, as code. */
const LIMITS = {
  /** GET /c/[code] */
  landing: { tokens: 30, window: '1 m' },
  /** GET /c/[code] that resolves to nothing. Tighter, because this is enumeration. */
  landingMiss: { tokens: 10, window: '1 m' },
  /** POST /api/chat */
  chat: { tokens: 10, window: '1 m' },
  /** POST /api/landing/[code]/email */
  landingEmail: { tokens: 3, window: '1 h' },
  /** GET /api/landing/[code]/status — polled every 3s by the crafting state. */
  landingStatus: { tokens: 60, window: '1 m' },
} as const satisfies Record<string, { tokens: number; window: `${number} ${'m' | 'h' | 's'}` }>;

export type LimitName = keyof typeof LIMITS;

const limiters = new Map<LimitName, Ratelimit>();

function limiter(name: LimitName): Ratelimit | null {
  if (!redis) return null;

  let existing = limiters.get(name);
  if (!existing) {
    const { tokens, window } = LIMITS[name];
    existing = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(tokens, window),
      prefix: `taplead:rl:${name}`,
      analytics: false,
    });
    limiters.set(name, existing);
  }
  return existing;
}

export type RateLimitResult = {
  allowed: boolean;
  /** True when the limiter could not run at all, so the request was let through. */
  degraded: boolean;
  remaining: number;
  /** Seconds until the caller may retry. Only meaningful when `allowed` is false. */
  retryAfter: number;
};

const ALLOWED_DEGRADED: RateLimitResult = {
  allowed: true,
  degraded: true,
  remaining: Number.POSITIVE_INFINITY,
  retryAfter: 0,
};

export async function checkRateLimit(name: LimitName, key: string): Promise<RateLimitResult> {
  const instance = limiter(name);

  if (!instance) {
    // No Redis configured. Expected locally and in CI; alertable in production.
    return ALLOWED_DEGRADED;
  }

  try {
    const { success, remaining, reset } = await instance.limit(key);
    return {
      allowed: success,
      degraded: false,
      remaining,
      retryAfter: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (error) {
    // §24.3: a Redis outage must not take the landing page with it.
    console.error(
      JSON.stringify({
        event: 'rate_limit_unavailable',
        limit: name,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return ALLOWED_DEGRADED;
  }
}

/**
 * Whether `key` still has budget on a limiter, WITHOUT spending any of it.
 *
 * The miss limiter is spent by misses and read by every request: an IP that has
 * burned through its misses is refused for real codes too, so walking the code
 * space stops yielding hits instead of merely being counted. Fails open, like
 * checkRateLimit.
 */
export async function peekRateLimit(name: LimitName, key: string): Promise<boolean> {
  const instance = limiter(name);
  if (!instance) return true;

  try {
    const { remaining } = await instance.getRemaining(key);
    return remaining > 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'rate_limit_unavailable',
        limit: name,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return true;
  }
}

/**
 * The caller's IP, from the proxy headers Vercel sets.
 *
 * These headers are attacker-controlled anywhere they are not set by a trusted
 * proxy, so this is a rate-limiting key and nothing more. Nothing is authorised
 * on the basis of it.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || headers.get('x-real-ip') || 'unknown';
}
