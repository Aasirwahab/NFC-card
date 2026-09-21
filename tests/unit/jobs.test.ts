import { describe, expect, it } from 'vitest';
import { retryDelaySeconds } from '@/lib/jobs/backoff';
import { createBudget } from '@/lib/jobs/budget';
import { bearerMatches } from '@/lib/security/bearer';

describe('retryDelaySeconds (§13)', () => {
  const noJitter = () => 0.5;

  it('waits a minute, then five, growing by a factor of five', () => {
    expect(retryDelaySeconds(1, noJitter)).toBe(60);
    expect(retryDelaySeconds(2, noJitter)).toBe(300);
    expect(retryDelaySeconds(3, noJitter)).toBe(1500);
  });

  it('caps at thirty minutes however many attempts are configured', () => {
    expect(retryDelaySeconds(4, noJitter)).toBe(1800);
    expect(retryDelaySeconds(50, noJitter)).toBe(1800);
  });

  it('jitters by at most 20% either way, so a burst does not retry in lockstep', () => {
    expect(retryDelaySeconds(1, () => 0)).toBe(48);
    expect(retryDelaySeconds(1, () => 0.999999)).toBe(72);
  });

  it('treats a nonsensical attempt count as the first attempt', () => {
    expect(retryDelaySeconds(0, noJitter)).toBe(60);
    expect(retryDelaySeconds(-3, noJitter)).toBe(60);
  });
});

describe('createBudget (§13)', () => {
  it('reports whether work fits in what is left, against an injected clock', () => {
    let now = 1_000;
    const budget = createBudget(30_000, () => now);

    expect(budget.remainingMs()).toBe(30_000);
    expect(budget.fits(30_000)).toBe(true);
    expect(budget.fits(30_001)).toBe(false);

    now += 25_000;
    expect(budget.remainingMs()).toBe(5_000);
    expect(budget.fits(10_000)).toBe(false);
  });

  it('goes negative after the deadline rather than wrapping', () => {
    let now = 0;
    const budget = createBudget(1_000, () => now);
    now = 5_000;
    expect(budget.remainingMs()).toBe(-4_000);
    expect(budget.fits(0)).toBe(false);
  });
});

describe('bearerMatches (§15.3)', () => {
  const secret = 'a'.repeat(43);

  it('accepts the exact secret', () => {
    expect(bearerMatches(`Bearer ${secret}`, secret)).toBe(true);
  });

  it('rejects a wrong, truncated, extended or missing token', () => {
    expect(bearerMatches(`Bearer ${'b'.repeat(43)}`, secret)).toBe(false);
    expect(bearerMatches(`Bearer ${secret.slice(0, -1)}`, secret)).toBe(false);
    expect(bearerMatches(`Bearer ${secret}x`, secret)).toBe(false);
    expect(bearerMatches('Bearer ', secret)).toBe(false);
    expect(bearerMatches(null, secret)).toBe(false);
  });

  it('requires the Bearer scheme', () => {
    expect(bearerMatches(secret, secret)).toBe(false);
    expect(bearerMatches(`Basic ${secret}`, secret)).toBe(false);
  });

  it('never matches when the configured secret is empty', () => {
    // A blank secret must lock the route, not open it to "Bearer ".
    expect(bearerMatches('Bearer ', '')).toBe(false);
  });
});
