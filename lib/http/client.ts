/**
 * The browser's only way to call our own API.
 *
 * `lib/http` is the single place in the codebase allowed to touch `fetch`
 * (§22.4, enforced by ESLint). That rule exists for the SSRF surface — the
 * server fetching URLs it did not choose — but keeping browser calls here too
 * means the rule has no exceptions, and an exception is how a rule like this
 * eventually stops being true.
 *
 * SAME ORIGIN ONLY. This is not `safeFetch`: it carries none of the DNS, redirect
 * or size guards, because it is never given an attacker-influenced URL. The
 * assertion below is what keeps that true.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function assertSameOrigin(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`apiFetch takes a same-origin path, got "${path}"`);
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  assertSameOrigin(path);
  return fetch(path, { cache: 'no-store', ...init });
}

/** GET a same-origin JSON endpoint. Throws ApiError on a non-2xx response. */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

/** POST, PUT, PATCH or DELETE JSON to a same-origin endpoint. */
export async function apiSend<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const response = await apiFetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `${method} ${path} failed with ${response.status}`;
    try {
      const parsed: unknown = await response.json();
      if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
        message = String((parsed as { error: unknown }).error);
      }
    } catch {
      // Not JSON. The status-based message above is what the caller gets.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}
