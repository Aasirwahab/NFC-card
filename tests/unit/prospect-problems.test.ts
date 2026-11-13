import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProspectProblems } from '@/lib/capture/prospect-problems';
const mocks = vi.hoisted(() => ({ event: vi.fn(), fallback: vi.fn() }));
vi.mock('@/lib/db/rep', () => ({ getEvent: mocks.event, listPlaybookProblems: mocks.fallback }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fallback.mockResolvedValue(['Fallback']);
});
describe('prospect problems use the capture chip source', () => {
  it('combines event areas in configured order without duplicates, capped at six', async () => {
    mocks.event.mockResolvedValue({
      niches: [
        { name: 'A', problems: ['One', 'Two', 'Three'] },
        { name: 'B', problems: ['Two', 'Four', 'Five', 'Six', 'Seven'] },
      ],
    });
    expect(await getProspectProblems('rep', 'event')).toEqual([
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
    ]);
    expect(mocks.event).toHaveBeenCalledWith('rep', 'event');
    expect(mocks.fallback).toHaveBeenCalledWith('rep');
  });
  it('uses the capture fallback only when the event has no configured problems', async () => {
    mocks.event.mockResolvedValue({ niches: [{ name: 'A', problems: [] }] });
    expect(await getProspectProblems('rep', 'event')).toEqual(['Fallback']);
  });
  it('returns no chips if neither source has problems', async () => {
    mocks.event.mockResolvedValue(null);
    mocks.fallback.mockResolvedValue([]);
    expect(await getProspectProblems('rep', 'event')).toEqual([]);
  });
});
