import { describe, expect, it } from 'vitest';
import { COLOUR_HEX, COLOUR_PALETTE, colourForSequence } from '@/lib/domain/colours';

describe('colourForSequence (§10.3)', () => {
  it('walks the palette in order from card 1', () => {
    expect(colourForSequence(1)).toBe('Red');
    expect(colourForSequence(2)).toBe('Blue');
    expect(colourForSequence(8)).toBe('Teal');
  });

  it('repeats after eight, which is unambiguous when shown with the number', () => {
    expect(colourForSequence(9)).toBe(colourForSequence(1));
    expect(colourForSequence(17)).toBe(colourForSequence(1));
    expect(colourForSequence(16)).toBe(colourForSequence(8));
  });

  it('clamps anything below 1 rather than throwing', () => {
    // Matches the database function exactly, so the two can never disagree.
    expect(colourForSequence(0)).toBe('Red');
    expect(colourForSequence(-5)).toBe('Red');
  });

  it('has a hex value for every colour in the palette', () => {
    for (const colour of COLOUR_PALETTE) {
      expect(COLOUR_HEX[colour]).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(Object.keys(COLOUR_HEX)).toHaveLength(COLOUR_PALETTE.length);
  });
});
