import 'server-only';
import { env } from '@/lib/env';
import { withCache } from './cache';
import { searchFor, withFallback } from './providers';
import type { SearchFn } from './types';

let cached: SearchFn | null | undefined;

export function searchClient(): SearchFn | null {
  if (cached === undefined) {
    const search = withFallback(
      searchFor(env.SEARCH_PROVIDER, env.SEARCH_API_KEY),
      searchFor(env.SEARCH_FALLBACK_PROVIDER, env.SEARCH_FALLBACK_API_KEY),
    );
    cached = search ? withCache(search) : null;
  }
  return cached;
}
