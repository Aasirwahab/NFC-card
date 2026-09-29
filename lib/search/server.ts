import 'server-only';
import { env } from '@/lib/env';
import { searchFor } from './providers';
import type { SearchFn } from './types';

export function searchClient(): SearchFn | null {
  return searchFor(env.SEARCH_PROVIDER, env.SEARCH_API_KEY);
}
