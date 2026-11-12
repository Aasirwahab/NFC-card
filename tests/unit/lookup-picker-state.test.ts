import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyFailure,
  emptyText,
  failureText,
  LookupTimeoutError,
  profileBadge,
  shouldSearchOnBlur,
  withTimeout,
} from '@/lib/lookup/picker-state';

afterEach(() => vi.useRealTimers());

describe('failure wording', () => {
  it('tells apart too many searches, search down, and too slow', () => {
    expect(classifyFailure(Object.assign(new Error('rate_limited'), { status: 429 }))).toBe(
      'rate_limited',
    );
    expect(classifyFailure(Object.assign(new Error('search_unavailable'), { status: 502 }))).toBe(
      'unavailable',
    );
    expect(
      classifyFailure(Object.assign(new Error('search_not_configured'), { status: 501 })),
    ).toBe('unavailable');
    expect(classifyFailure(new TypeError('Failed to fetch'))).toBe('unavailable');
    expect(classifyFailure(new LookupTimeoutError())).toBe('timeout');
    expect(failureText('rate_limited')).toBe('Too many searches. Wait a minute or type it in.');
    expect(failureText('unavailable')).toBe('Search is not working right now. Type it in.');
    expect(failureText('timeout')).toBe('Taking too long. Type it in, or try again.');
  });

  it('names the query when nothing is found', () => {
    expect(emptyText('Sarah Lee at Acme')).toBe('Nothing found for Sarah Lee at Acme. Type it in.');
  });
});

describe('withTimeout', () => {
  it('gives up after the cut-off and ignores the late answer', async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 20_000));
    const result = withTimeout(slow, 10_000);
    const caught = result.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await caught).toBeInstanceOf(LookupTimeoutError);
  });

  it('passes a fast answer through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 10_000)).resolves.toBe('ok');
  });
});

describe('search on leaving a field', () => {
  const base = { enabled: true, filled: false, query: 'Sarah Lee', lastQuery: null };
  it('searches a new question once', () => {
    expect(shouldSearchOnBlur(base)).toBe(true);
    expect(shouldSearchOnBlur({ ...base, lastQuery: 'Sarah Lee' })).toBe(false);
  });
  it('stays quiet when disabled or filled', () => {
    expect(shouldSearchOnBlur({ ...base, enabled: false })).toBe(false);
    expect(shouldSearchOnBlur({ ...base, filled: true })).toBe(false);
  });
  it('asks the new question even while an older one is still running', () => {
    expect(
      shouldSearchOnBlur({ ...base, query: 'Sarah Lee at Acme', lastQuery: 'Sarah Lee' }),
    ).toBe(true);
  });
});

describe('profile badges', () => {
  it('uses plain words', () => {
    expect(profileBadge(true, 'exact_match')).toBe('Best match');
    expect(profileBadge(false, 'exact_match')).toBe('Same name, check it');
    expect(profileBadge(false, 'ambiguous')).toBe('Maybe');
    expect(profileBadge(false, 'namesake')).toBe('Different company');
    expect(profileBadge(false, 'colleague')).toBeUndefined();
  });
});
