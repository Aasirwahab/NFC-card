import { describe, expect, it } from 'vitest';
import { KNOTS, REAL_END, VISUAL_END, unwarp, warp } from '@/lib/motion/warp';

describe('film time warp', () => {
  it('hits every knot and clamps at both ends', () => {
    for (const [r, v] of KNOTS) {
      expect(warp(r)).toBeCloseTo(v, 9);
      expect(unwarp(v)).toBeCloseTo(r, 9);
    }
    expect(warp(-1)).toBe(0);
    expect(warp(REAL_END + 5)).toBe(VISUAL_END);
  });
  it('is monotonic and round-trips between knots', () => {
    let prev = -1;
    for (let r = 0; r <= REAL_END; r += 0.05) {
      const v = warp(r);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
      expect(unwarp(v)).toBeCloseTo(r, 6);
    }
  });
});
