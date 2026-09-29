import 'server-only';
import { env } from '@/lib/env';
import { searchFor, withFallback } from './providers';
import type { SearchFn } from './types';

export function searchClient(): SearchFn | null {
  return withFallback(
    searchFor(env.SEARCH_PROVIDER, env.SEARCH_API_KEY),
    searchFor(env.SEARCH_FALLBACK_PROVIDER, env.SEARCH_FALLBACK_API_KEY),
  );
}
