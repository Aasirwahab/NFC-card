import type { LookupAddress } from 'node:dns';
import { describe, expect, it, vi } from 'vitest';
import {
  assertPublicAnswer,
  createValidatingLookup,
  safeFetch,
  SafeFetchError,
  validateUrl,
} from '@/lib/http/safe-fetch';

/**
 * Phase 4 done-when (§26): "safeFetch rejects a private-range URL in a test."
 *
 * The request itself is injected so these tests exercise every guard without
 * the network. The DNS guard is tested through the same lookup function the
 * real socket uses.
 */

type FakeFetch = Parameters<typeof safeFetch>[2] & ReturnType<typeof vi.fn>;

function fakeFetch(responder: (url: string) => Response | Promise<Response>): FakeFetch {
  return vi.fn(async (url: string) => responder(url)) as unknown as FakeFetch;
}

const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...headers } });

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SafeFetchError);
    return (error as SafeFetchError).reason;
  }
  throw new Error('expected a SafeFetchError');
}

describe('validateUrl — the scheme allowlist (§22.4)', () => {
  it.each([
    ['http://example.com/', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['gopher://example.com/', 'scheme'],
    ['data:text/html,hi', 'scheme'],
    ['ftp://example.com/', 'scheme'],
    ['https://user:pass@example.com/', 'credentials'],
    ['https://example.com:8443/', 'port'],
    ['https://example.com:22/', 'port'],
    ['not a url', 'invalid_url'],
  ])('refuses %s (%s)', (url, reason) => {
    expect(() => validateUrl(url)).toThrow(expect.objectContaining({ reason }));
  });

  it('accepts a normal https URL, with or without an explicit :443', () => {
    expect(validateUrl('https://example.com/about').hostname).toBe('example.com');
    expect(validateUrl('https://example.com:443/').hostname).toBe('example.com');
  });
});

describe('validateUrl — private addresses (the Phase 4 done-when)', () => {
  it.each([
    'https://127.0.0.1/',
    'https://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'https://10.0.0.5/admin',
    'https://192.168.1.1/',
    'https://[::1]/',
    'https://[::ffff:169.254.169.254]/',
    'https://[fd00:ec2::254]/',
    // The URL parser normalises these to 127.0.0.1 — they must not slip past.
    'https://2130706433/',
    'https://0x7f000001/',
    'https://0177.0.0.1/',
    'https://127.1/',
  ])('refuses %s', (url) => {
    expect(() => validateUrl(url)).toThrow(expect.objectContaining({ reason: 'private_address' }));
  });

  it.each([
    'https://localhost/',
    'https://intranet/',
    'https://printer.local/',
    'https://db.internal/',
  ])('refuses the internal hostname %s before any DNS lookup', (url) => {
    expect(() => validateUrl(url)).toThrow(expect.objectContaining({ reason: 'private_address' }));
  });

  it('never sends a request for a refused URL', async () => {
    const fetchImpl = fakeFetch(() => html('should never be fetched'));
    expect(await refusal(safeFetch('https://169.254.169.254/', {}, fetchImpl))).toBe(
      'private_address',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('the DNS guard — resolve, then check, then connect to THAT address', () => {
  const v4 = (address: string): LookupAddress => ({ address, family: 4 });
  const v6 = (address: string): LookupAddress => ({ address, family: 6 });

  it('passes an all-public answer through', () => {
    expect(assertPublicAnswer('example.com', [v4('93.184.216.34')])).toHaveLength(1);
  });

  it('refuses a name that resolves to a private address', () => {
    // A company "website" whose DNS an attacker controls.
    expect(() => assertPublicAnswer('evil.example', [v4('169.254.169.254')])).toThrow(
      expect.objectContaining({ reason: 'private_address' }),
    );
  });

  it('refuses the WHOLE answer when any one address is private', () => {
    expect(() => assertPublicAnswer('mixed.example', [v4('93.184.216.34'), v6('::1')])).toThrow(
      expect.objectContaining({ reason: 'private_address' }),
    );
  });

  it('refuses an empty answer', () => {
    expect(() => assertPublicAnswer('nothing.example', [])).toThrow(
      expect.objectContaining({ reason: 'dns' }),
    );
  });

  it('hands the socket only a checked address, in both lookup modes', async () => {
    const lookup = createValidatingLookup((_host, cb) => cb(null, [v4('93.184.216.34')]));

    const single = await new Promise<[unknown, unknown, unknown]>((resolve) =>
      lookup('example.com', { all: false }, (e, a, f) => resolve([e, a, f])),
    );
    expect(single).toEqual([null, '93.184.216.34', 4]);

    const all = await new Promise<[unknown, unknown]>((resolve) =>
      lookup('example.com', { all: true }, (e, a) => resolve([e, a])),
    );
    expect(all).toEqual([null, [v4('93.184.216.34')]]);
  });

  it('fails the socket when the answer is private — the rebinding case', async () => {
    const lookup = createValidatingLookup((_host, cb) => cb(null, [v4('127.0.0.1')]));
    const error = await new Promise<unknown>((resolve) =>
      lookup('rebind.example', { all: false }, (e) => resolve(e)),
    );
    expect(error).toMatchObject({ reason: 'private_address' });
  });
});

describe('redirects — every hop re-validated', () => {
  it('follows a redirect to another public page', async () => {
    const fetchImpl = fakeFetch((url) =>
      url === 'https://example.com/'
        ? new Response(null, { status: 301, headers: { location: '/home' } })
        : html('<p>home</p>'),
    );
    const result = await safeFetch('https://example.com/', {}, fetchImpl);
    expect(result.url).toBe('https://example.com/home');
    expect(result.body).toBe('<p>home</p>');
  });

  it('refuses a public URL that redirects to the metadata service', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://169.254.169.254/latest/meta-data/' },
        }),
    );
    expect(await refusal(safeFetch('https://example.com/', {}, fetchImpl))).toBe('private_address');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect that downgrades to http', async () => {
    const fetchImpl = fakeFetch(
      () => new Response(null, { status: 301, headers: { location: 'http://example.com/' } }),
    );
    expect(await refusal(safeFetch('https://example.com/', {}, fetchImpl))).toBe('scheme');
  });

  it('gives up after three redirects', async () => {
    let n = 0;
    const fetchImpl = fakeFetch(
      () => new Response(null, { status: 302, headers: { location: `/hop-${++n}` } }),
    );
    expect(await refusal(safeFetch('https://example.com/', {}, fetchImpl))).toBe(
      'too_many_redirects',
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe('size and time caps', () => {
  it('refuses a body whose declared length exceeds the cap', async () => {
    const fetchImpl = fakeFetch(() => html('x', { 'content-length': String(10_000_000) }));
    expect(await refusal(safeFetch('https://example.com/', {}, fetchImpl))).toBe('too_large');
  });

  it('refuses a body that exceeds the cap without declaring it', async () => {
    const fetchImpl = fakeFetch(() => html('x'.repeat(5_000)));
    expect(await refusal(safeFetch('https://example.com/', { maxBytes: 1_000 }, fetchImpl))).toBe(
      'too_large',
    );
  });

  it('times out the whole chain', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    ) as unknown as FakeFetch;
    expect(await refusal(safeFetch('https://example.com/', { timeoutMs: 20 }, fetchImpl))).toBe(
      'timeout',
    );
  });
});

describe('what comes back', () => {
  it('returns text for an HTML page', async () => {
    const result = await safeFetch(
      'https://example.com/',
      {},
      fakeFetch(() => html('<h1>Hi</h1>')),
    );
    expect(result).toMatchObject({ ok: true, status: 200, body: '<h1>Hi</h1>' });
  });

  it('does not read a non-text response', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    );
    const result = await safeFetch('https://example.com/brochure.pdf', {}, fetchImpl);
    expect(result).toMatchObject({ ok: true, body: '' });
  });

  it('reports a 404 as not-ok rather than throwing', async () => {
    // An /about page that does not exist is normal, not an error.
    const fetchImpl = fakeFetch(() => new Response('gone', { status: 404 }));
    const result = await safeFetch('https://example.com/about', {}, fetchImpl);
    expect(result).toMatchObject({ ok: false, status: 404, body: '' });
  });

  it('sends no cookies or credentials, and an honest user agent', async () => {
    const fetchImpl = fakeFetch(() => html('ok'));
    await safeFetch('https://example.com/', {}, fetchImpl);
    const headers = (fetchImpl.mock.calls[0]![1] as { headers: Record<string, string> }).headers;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('cookie');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(headers['user-agent']).toMatch(/TapLeadBot/);
  });
});
