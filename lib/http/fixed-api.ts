/**
 * Calls to a small, FIXED set of third-party APIs (the decision model, the search
 * vendors). Not `safeFetch`: the host is chosen by us in code, never by a user,
 * so there is no SSRF surface, and the host list below keeps it that way. Lives
 * in lib/http because that is the only place allowed to touch `fetch` (§22.4).
 */

const ALLOWED_HOSTS = new Set(['openrouter.ai', 'api.search.brave.com', 'google.serper.dev']);

export class FixedApiError extends Error {
  constructor(
    readonly reason: 'host_not_allowed' | 'timeout' | 'network' | 'status',
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FixedApiError';
  }
}

export async function callFixedApi(input: {
  url: string;
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
}): Promise<unknown> {
  const url = new URL(input.url);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new FixedApiError('host_not_allowed', `${url.hostname} is not an allowed API host`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: input.method ?? (input.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...input.headers,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: AbortSignal.timeout(input.timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new FixedApiError(
      timedOut ? 'timeout' : 'network',
      timedOut ? `no answer within ${input.timeoutMs}ms` : 'network error',
    );
  }

  if (!response.ok) {
    throw new FixedApiError('status', `HTTP ${response.status}`, response.status);
  }
  return response.json();
}
