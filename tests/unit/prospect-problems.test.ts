import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProspectProblems } from '@/lib/capture/prospect-problems';
const mocks = vi.hoisted(() => ({ fallback: vi.fn() }));
vi.mock('@/lib/db/rep', () => ({ listPlaybookProblems: mocks.fallback }));
beforeEach(() => vi.clearAllMocks());
describe('prospect problems are only the rep general list', () => {
  it('offers the rep general problems in order, capped at five, never event areas', async () => {
    mocks.fallback.mockResolvedValue(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(await getProspectProblems('rep')).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(mocks.fallback).toHaveBeenCalledWith('rep');
  });
  it('returns nothing, so the question is hidden, when the rep has none', async () => {
    mocks.fallback.mockResolvedValue([]);
    expect(await getProspectProblems('rep')).toEqual([]);
  });
});
