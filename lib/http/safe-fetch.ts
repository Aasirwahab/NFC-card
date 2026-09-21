import 'server-only';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { isPublicAddress } from './ip';

/**
 * safeFetch — the ONLY way the pipeline touches the open web (spec §22.4).
 *
 * Removing the external workflow engine moved outbound fetching onto our own
 * server, inside the perimeter, in a process holding the service-role key. The
 * URLs are derived from what a prospect's company is called, so they are
 * attacker-influenceable. Every guard in the spec's table is here:
 *
 *   scheme allowlist     https only, port 443 only, no credentials in the URL
 *   resolve, then check  the DNS answer is validated INSIDE the socket's own
 *                        lookup, so the address checked is the address connected
 *                        to — there is no gap for DNS rebinding to use
 *   no redirects         redirect: 'manual'; every hop is re-validated, max 3
 *   timeout, size cap    8 seconds for the whole chain, 2 MB, abort on exceed
 *   no credentials       no cookies, no auth headers, an isolated agent
 *   hostile response     returned as text only; never evaluated, never rendered
 *
 * ESLint bans `fetch` everywhere outside lib/http, so this cannot be bypassed by
 * accident.
 */

export type SafeFetchFailure =
  | 'invalid_url'
  | 'scheme'
  | 'credentials'
  | 'port'
  | 'private_address'
  | 'dns'
  | 'too_many_redirects'
  | 'too_large'
  | 'timeout'
  | 'network';

export class SafeFetchError extends Error {
  constructor(
    readonly reason: SafeFetchFailure,
    message: string,
  ) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export type SafeFetchResult = {
  /** The URL finally fetched, after any redirects. */
  url: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  /** Empty unless the response was 2xx and textual. */
  body: string;
};

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

const DEFAULTS = { timeoutMs: 8_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3 };

/** Only these are read. A PDF or an image has nothing the pipeline can use. */
const TEXTUAL = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;

/** Names that can only mean "somewhere inside", refused before any DNS. */
const INTERNAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/i;

// ---------------------------------------------------------------- the URL

/**
 * Validates one URL — the first or any redirect hop. Pure apart from `isIP`.
 * Exported for tests.
 */
export function validateUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeFetchError('invalid_url', `not a URL: ${String(input).slice(0, 200)}`);
  }

  if (url.protocol !== 'https:') {
    throw new SafeFetchError('scheme', `only https is allowed, got ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SafeFetchError('credentials', 'credentials in a URL are not allowed');
  }
  if (url.port !== '' && url.port !== '443') {
    throw new SafeFetchError('port', `only port 443 is allowed, got ${url.port}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  // An IP literal never reaches the DNS lookup below, so it is judged here.
  if (isIP(host)) {
    if (!isPublicAddress(host)) {
      throw new SafeFetchError('private_address', `refusing non-public address ${host}`);
    }
    return url;
  }

  // Every public website has a dot in its name. A bare "intranet" or "router"
  // resolves only on a private network.
  if (!host.includes('.') || INTERNAL_NAME.test(host)) {
    throw new SafeFetchError('private_address', `refusing internal hostname ${host}`);
  }

  return url;
}

// ---------------------------------------------------------------- the DNS

/**
 * Judges a DNS answer. Refuses the WHOLE answer if any address is non-public:
 * a name that resolves to both a public and a private address is either
 * misconfigured or an attack, and neither is worth the risk. Exported for tests.
 */
export function assertPublicAnswer(hostname: string, addresses: LookupAddress[]): LookupAddress[] {
  if (addresses.length === 0) {
    throw new SafeFetchError('dns', `no addresses for ${hostname}`);
  }
  const blocked = addresses.find((a) => !isPublicAddress(a.address));
  if (blocked) {
    throw new SafeFetchError(
      'private_address',
      `${hostname} resolves to non-public address ${blocked.address}`,
    );
  }
  return addresses;
}

type Resolver = (
  hostname: string,
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const systemResolver: Resolver = (hostname, callback) =>
  dnsLookup(hostname, { all: true, verbatim: true }, callback);

/**
 * A `lookup` for the socket itself. Node's TLS connection calls this to turn the
 * hostname into an address, so validating here means the address that passed
 * the check is the one the socket connects to.
 */
export function createValidatingLookup(resolve: Resolver = systemResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, (error, addresses) => {
      if (error) return callback(error, '', 0);

      let safe: LookupAddress[];
      try {
        safe = assertPublicAnswer(hostname, addresses);
      } catch (refusal) {
        return callback(refusal as NodeJS.ErrnoException, '', 0);
      }

      if (options.all) {
        // The typings describe the single-address form; Node passes the array
        // through when `all` was requested.
        (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, safe);
      } else {
        const first = safe[0]!;
        callback(null, first.address, first.family);
      }
    });
  };
}

// ------------------------------------------------------------ the request

/**
 * One isolated agent, used for nothing else: no connection is ever shared with
 * a request that carries credentials, and every socket it opens goes through
 * the validating lookup.
 */
const agent = new Agent({
  connect: { lookup: createValidatingLookup(), timeout: 5_000 },
  keepAliveTimeout: 1_000,
});

type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

const defaultFetch: FetchLike = (url, init) =>
  undiciFetch(url, {
    ...init,
    redirect: 'manual',
    dispatcher: agent,
  }) as unknown as Promise<Response>;

const REQUEST_HEADERS: Record<string, string> = {
  // An honest user agent that says where to find out what we are (§16).
  'user-agent': 'TapLeadBot/1.0 (+https://taplead.app/how-it-works)',
  accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8',
  'accept-language': 'en-GB,en;q=0.8',
};

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new SafeFetchError('too_large', `declared ${declared} bytes, cap is ${maxBytes}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // The declared length can lie; the actual bytes cannot.
      await reader.cancel().catch(() => {});
      throw new SafeFetchError('too_large', `exceeded the ${maxBytes}-byte cap`);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function decode(bytes: Uint8Array, contentType: string | null): string {
  const charset = contentType
    ?.match(/charset=([^;]+)/i)?.[1]
    ?.trim()
    .replace(/"/g, '');
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Fetches one public web page as text. Throws SafeFetchError for anything the
 * guards refuse; returns a result (possibly `ok: false`) for anything the
 * server merely declined, such as a 404 on an /about page that does not exist.
 *
 * @param fetchImpl  injected by tests; production always uses the isolated agent
 */
export async function safeFetch(
  input: string,
  options: SafeFetchOptions = {},
  fetchImpl: FetchLike = defaultFetch,
): Promise<SafeFetchResult> {
  const { timeoutMs, maxBytes, maxRedirects } = { ...DEFAULTS, ...options };

  // One deadline for the whole redirect chain, not per hop.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url = validateUrl(input);

    for (let hop = 0; ; hop++) {
      let response: Response;
      try {
        response = await fetchImpl(url.toString(), {
          signal: controller.signal,
          headers: REQUEST_HEADERS,
        });
      } catch (error) {
        if (error instanceof SafeFetchError) throw error;
        const cause = (error as { cause?: unknown })?.cause;
        if (cause instanceof SafeFetchError) throw cause; // refused inside the lookup
        if (controller.signal.aborted) {
          throw new SafeFetchError('timeout', `no response within ${timeoutMs}ms`);
        }
        throw new SafeFetchError('network', error instanceof Error ? error.message : String(error));
      }

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel().catch(() => {});
        if (hop >= maxRedirects) {
          throw new SafeFetchError('too_many_redirects', `more than ${maxRedirects} redirects`);
        }
        // Every hop is validated from scratch: a public URL that redirects to
        // an internal one is the oldest trick there is.
        url = validateUrl(new URL(location, url));
        continue;
      }

      const contentType = response.headers.get('content-type');
      const readable = response.ok && TEXTUAL.test(contentType ?? '');

      if (!readable) {
        await response.body?.cancel().catch(() => {});
        return {
          url: url.toString(),
          status: response.status,
          ok: response.ok,
          contentType,
          body: '',
        };
      }

      const bytes = await readCapped(response, maxBytes);
      return {
        url: url.toString(),
        status: response.status,
        ok: true,
        contentType,
        body: decode(bytes, contentType),
      };
    }
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    if (controller.signal.aborted) {
      throw new SafeFetchError('timeout', `no response within ${timeoutMs}ms`);
    }
    throw new SafeFetchError('network', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
