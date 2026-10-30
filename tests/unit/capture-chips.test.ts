import { describe, expect, it } from 'vitest';
import {
  chipProblems,
  eventHasProblems,
  FALLBACK_NICHE,
  keepVisible,
  noteNiches,
} from '@/lib/capture/chips';

const own = [{ name: 'Clinics', problems: ['Enquiries lost after hours', 'Old website'] }];
const fallback = ['Slow response to new enquiries', 'Outdated website that does not convert'];

describe('chipProblems', () => {
  it("shows the event's own problems when the selected area has some", () => {
    expect(chipProblems(own, 'Clinics', fallback)).toEqual(own[0]!.problems);
  });

  it('falls back to the playbook problems on an Unsorted card (no areas)', () => {
    expect(chipProblems([], '', fallback)).toEqual(fallback);
  });

  it('falls back when the event has areas but none has a problem', () => {
    expect(chipProblems([{ name: 'Clinics', problems: [] }], 'Clinics', fallback)).toEqual(
      fallback,
    );
  });

  it('shows nothing, not the playbook, when the event has problems but this area has none', () => {
    const mixed = [...own, { name: 'Trades', problems: [] }];
    expect(chipProblems(mixed, 'Trades', fallback)).toEqual([]);
  });

  it('shows nothing when there is no fallback either', () => {
    expect(chipProblems([], '', [])).toEqual([]);
  });
});

describe('noteNiches', () => {
  it("passes the event's areas through unchanged when it has problems", () => {
    expect(noteNiches(own, fallback)).toBe(own);
  });

  it('offers the playbook problems to the note reader under a placeholder area', () => {
    expect(noteNiches([], fallback)).toEqual([{ name: FALLBACK_NICHE, problems: fallback }]);
  });

  it('stays empty with no fallback', () => {
    expect(noteNiches([], [])).toEqual([]);
  });

  it('eventHasProblems is false for no areas and for empty areas', () => {
    expect(eventHasProblems([])).toBe(false);
    expect(eventHasProblems([{ name: 'a', problems: [] }])).toBe(false);
    expect(eventHasProblems(own)).toBe(true);
  });
});

describe('keepVisible', () => {
  it('drops a tick whose chip is no longer shown', () => {
    expect(keepVisible(['Old website', 'Slow response'], ['Slow response'])).toEqual([
      'Slow response',
    ]);
  });

  it('keeps everything that is still visible, in order', () => {
    expect(keepVisible(['b', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a']);
  });

  it('saves nothing when no chips are shown', () => {
    expect(keepVisible(['Old website'], [])).toEqual([]);
  });
});
