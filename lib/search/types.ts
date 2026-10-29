export type SearchResult = { url: string; title: string; snippet: string };

/** The search vendor could not answer (bad key, quota, outage, timeout). Not the same as "found nothing". */
export class SearchUnavailableError extends Error {
  constructor() {
    super('search_unavailable');
    this.name = 'SearchUnavailableError';
  }
}

/**
 * One web search. Returns [] when it found nothing: a lookup with no results just means
 * "type it yourself". Throws SearchUnavailableError when the vendor itself failed, so the
 * rep is told the search is down instead of being shown a false "nothing found".
 */
export type SearchFn = (query: string, options?: { count?: number }) => Promise<SearchResult[]>;
