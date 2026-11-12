/**
 * What the lookup picker says and when it may search. PURE: the component only wires
 * these to the screen, so the wording and the "never while typing" rule are testable.
 */

/** Longest the rep waits for a search before being told to type it in. */
export const LOOKUP_TIMEOUT_MS = 10_000;

export type LookupFailure = 'timeout' | 'rate_limited' | 'unavailable';

/** Thrown by `withTimeout` when the search is too slow. */
export class LookupTimeoutError extends Error {
  constructor() {
    super('lookup_timeout');
    this.name = 'LookupTimeoutError';
  }
}

export function withTimeout<T>(work: Promise<T>, ms = LOOKUP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LookupTimeoutError()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 429 is "too many"; a timeout is its own message; everything else (502, 501, offline) is "not working". */
export function classifyFailure(caught: unknown): LookupFailure {
  if (caught instanceof LookupTimeoutError) return 'timeout';
  const status = (caught as { status?: unknown } | null)?.status;
  const code = caught instanceof Error ? caught.message : '';
  return status === 429 || code === 'rate_limited' ? 'rate_limited' : 'unavailable';
}

export function failureText(kind: LookupFailure): string {
  if (kind === 'timeout') return 'Taking too long. Type it in, or try again.';
  if (kind === 'rate_limited') return 'Too many searches. Wait a minute or type it in.';
  return 'Search is not working right now. Type it in.';
}

export function emptyText(query: string): string {
  return query ? `Nothing found for ${query}. Type it in.` : 'Nothing found. Type it in.';
}

/**
 * Search once when the rep leaves a field, and only if what would be asked is new, usable and
 * still unfilled. A search still running for an OLDER question does not block a new one: the
 * picker drops the older answer, so skipping here would leave the rep with nothing.
 */
export function shouldSearchOnBlur(input: {
  enabled: boolean;
  filled: boolean;
  query: string;
  lastQuery: string | null;
}): boolean {
  return input.enabled && !input.filled && input.query !== input.lastQuery;
}

/** Plain-word badges for a LinkedIn candidate. */
export function profileBadge(isLikely: boolean, label: string): string | undefined {
  if (isLikely) return 'Best match';
  if (label === 'exact_match') return 'Same name, check it';
  if (label === 'ambiguous') return 'Maybe';
  if (label === 'namesake') return 'Different company';
  return undefined;
}
