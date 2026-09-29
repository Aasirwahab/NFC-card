import { callFixedApi } from '@/lib/http/fixed-api';
import type { SearchFn, SearchResult } from './types';

function clean(text: unknown): string {
  return typeof text === 'string'
    ? text
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

function collect(
  rows: unknown,
  map: (row: Record<string, unknown>) => SearchResult | null,
): SearchResult[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row && typeof row === 'object' ? map(row as Record<string, unknown>) : null))
    .filter((r): r is SearchResult => r !== null && r.url.startsWith('https://'));
}

export function braveSearch(apiKey: string): SearchFn {
  return async (query, options) => {
    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(options?.count ?? 8));
      const data = (await callFixedApi({
        url: url.toString(),
        headers: { 'x-subscription-token': apiKey, accept: 'application/json' },
        timeoutMs: 4_000,
      })) as { web?: { results?: unknown } };
      return collect(data?.web?.results, (r) => ({
        url: String(r.url ?? ''),
        title: clean(r.title),
        snippet: clean(r.description),
      }));
    } catch {
      return [];
    }
  };
}

export function serperSearch(apiKey: string): SearchFn {
  return async (query, options) => {
    try {
      const data = (await callFixedApi({
        url: 'https://google.serper.dev/search',
        headers: { 'x-api-key': apiKey },
        body: { q: query, num: options?.count ?? 8 },
        timeoutMs: 4_000,
      })) as { organic?: unknown };
      return collect(data?.organic, (r) => ({
        url: String(r.link ?? ''),
        title: clean(r.title),
        snippet: clean(r.snippet),
      }));
    } catch {
      return [];
    }
  };
}

/** SerpApi (serpapi.com): Google results too. The key travels in the query string, so the URL is never logged. */
export function serpApiSearch(apiKey: string): SearchFn {
  return async (query, options) => {
    try {
      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', 'google');
      url.searchParams.set('q', query);
      url.searchParams.set('num', String(options?.count ?? 8));
      url.searchParams.set('api_key', apiKey);
      const data = (await callFixedApi({ url: url.toString(), headers: {}, timeoutMs: 8_000 })) as {
        organic_results?: unknown;
      };
      return collect(data?.organic_results, (r) => ({
        url: String(r.link ?? ''),
        title: clean(r.title),
        snippet: clean(r.snippet),
      }));
    } catch {
      return [];
    }
  };
}

/**
 * Canned results for local work with no search account. Deterministic and clearly
 * fake (`.example` hosts); one right answer, one look-alike, one directory. It exists
 * so the screens and the flow can be walked through; it never runs in production
 * because SEARCH_PROVIDER has to be set to `mock` on purpose.
 */
export const mockSearch: SearchFn = async (query) => {
  const linkedin = /site:linkedin\.com\/in/i.test(query);
  const quoted = [...query.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (linkedin) {
    const name = quoted[0] ?? 'Alex Morgan';
    const company = quoted[1] ?? 'Northgate Group';
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
    return [
      {
        url: `https://www.linkedin.com/in/${slug}-1a2b3c`,
        title: `${name} - Director - ${company} | LinkedIn`,
        snippet: `${company}. ${name} is a director. Manchester, United Kingdom.`,
      },
      {
        url: `https://www.linkedin.com/in/${slug}-9z8y7x`,
        title: `${name} - Consultant - Ridgeway Advisory | LinkedIn`,
        snippet: `Consultant at Ridgeway Advisory. London.`,
      },
      {
        url: `https://www.linkedin.com/in/${slug}-44dd55`,
        title: `${name} | LinkedIn`,
        snippet: `Professional profile. United Kingdom.`,
      },
    ];
  }
  const raw = query.replace(/official website/i, '').trim();
  const host =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || 'company';
  return [
    {
      url: `https://www.${host}.example/`,
      title: `${raw} | Official site`,
      snippet: `${raw}: what we do, our team and how to contact us.`,
    },
    {
      url: `https://www.companies-directory.example/${host}`,
      title: `${raw} - company profile, filings and directors`,
      snippet: `Company profile listing for ${raw}.`,
    },
    {
      url: `https://www.${host}-group.example/`,
      title: `${raw} Group | Different business`,
      snippet: `A different organisation with a similar name.`,
    },
  ];
};

export function searchFor(
  provider: 'brave' | 'serper' | 'serpapi' | 'mock' | undefined,
  apiKey: string | undefined,
): SearchFn | null {
  if (provider === 'mock') return mockSearch;
  if (provider === 'brave' && apiKey) return braveSearch(apiKey);
  if (provider === 'serper' && apiKey) return serperSearch(apiKey);
  if (provider === 'serpapi' && apiKey) return serpApiSearch(apiKey);
  return null;
}

/** Tries each search in turn; the first that returns anything wins. A dead vendor costs one empty answer, not the feature. */
export function withFallback(...searches: (SearchFn | null)[]): SearchFn | null {
  const chain = searches.filter((s): s is SearchFn => s !== null);
  if (chain.length === 0) return null;
  if (chain.length === 1) return chain[0]!;
  return async (query, options) => {
    for (const search of chain) {
      const results = await search(query, options);
      if (results.length > 0) return results;
    }
    return [];
  };
}
