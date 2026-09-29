export type SearchResult = { url: string; title: string; snippet: string };

/** One web search. Returns [] on any failure: a lookup with no results just means "type it yourself". */
export type SearchFn = (query: string, options?: { count?: number }) => Promise<SearchResult[]>;
