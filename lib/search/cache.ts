import type { SearchFn } from './types';

/**
 * A short memory in front of a search. Reps retry, re-open a lead and look up the
 * same company twice; a repeat inside ten minutes costs nothing and no API call.
 * Only answers that found something are kept, so a failed search is tried again.
 * Per server instance and bounded: this is a speed-up, not a store.
 */
export function withCache(search: SearchFn, ttlMs = 10 * 60_000, max = 200): SearchFn {
  const entries = new Map<string, { at: number; results: Awaited<ReturnType<SearchFn>> }>();

  return async (query, options) => {
    const key = `${options?.count ?? ''}|${query}`;
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.results;

    const results = await search(query, options);
    if (results.length > 0) {
      if (entries.size >= max) entries.delete(entries.keys().next().value as string);
      entries.set(key, { at: Date.now(), results });
    }
    return results;
  };
}
