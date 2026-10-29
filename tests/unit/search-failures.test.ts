import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/http/fixed-api', () => ({ callFixedApi: vi.fn() }));

import { callFixedApi } from '@/lib/http/fixed-api';
import { serpApiSearch, serperSearch, withFallback } from '@/lib/search/providers';
import { SearchUnavailableError, type SearchFn } from '@/lib/search/types';

const mocked = vi.mocked(callFixedApi);

afterEach(() => {
  mocked.mockReset();
  vi.restoreAllMocks();
});

describe('a vendor failure is not "nothing found"', () => {
  it('throws unavailable when the vendor rejects the key, and logs the status but never the key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocked.mockRejectedValue(
      Object.assign(new Error('HTTP 401'), { reason: 'status', status: 401 }),
    );
    await expect(serperSearch('secret-key-123')('q')).rejects.toBeInstanceOf(
      SearchUnavailableError,
    );
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain('"status":401');
    expect(logged).not.toContain('secret-key-123');
  });

  it('throws unavailable on a timeout for every vendor', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocked.mockRejectedValue(Object.assign(new Error('slow'), { reason: 'timeout' }));
    await expect(serpApiSearch('k')('q')).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  it('still returns [] when the vendor answered with no results', async () => {
    mocked.mockResolvedValue({ organic: [] });
    await expect(serperSearch('k')('q')).resolves.toEqual([]);
  });
});

describe('withFallback and failures', () => {
  const found: SearchFn = async () => [{ url: 'https://a.example', title: 't', snippet: 's' }];
  const empty: SearchFn = async () => [];
  const down: SearchFn = async () => {
    throw new SearchUnavailableError();
  };

  it('uses the second search when the first is down', async () => {
    expect(await withFallback(down, found)!('q')).toHaveLength(1);
  });

  it('reports unavailable only when every search failed', async () => {
    await expect(withFallback(down, down)!('q')).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  it('says "nothing found" when one vendor answered empty and the other was down', async () => {
    expect(await withFallback(down, empty)!('q')).toEqual([]);
  });

  it('does not hide an unexpected error', async () => {
    const broken: SearchFn = async () => {
      throw new Error('bug');
    };
    await expect(withFallback(broken, found)!('q')).rejects.toThrow('bug');
  });
});
