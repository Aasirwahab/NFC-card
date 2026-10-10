/** Film time warp: real clock r (seconds, matches the recorded voice) -> visual timeline time v. Piecewise linear. */
export const KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1.25, 1.2],
  [3.05, 2.6],
  [4.25, 4.0],
  [7.85, 6.0],
  [9.35, 8.0],
  [13.05, 10.5],
  [14.45, 12.5],
  [16.15, 15.0],
  [17.55, 16.6],
  [19.45, 19.0],
  [21.85, 22.0],
  [24.45, 25.5],
  [27.25, 29.0],
  [29.65, 32.0],
  [31.45, 34.5],
  [33.85, 37.5],
  [36.05, 40.5],
  [38.25, 42.5],
  [42.05, 46.0],
];

export const REAL_END = KNOTS[KNOTS.length - 1]![0];
export const VISUAL_END = KNOTS[KNOTS.length - 1]![1];

function interp(x: number, from: 0 | 1, to: 0 | 1): number {
  const last = KNOTS.length - 1;
  if (x <= KNOTS[0]![from]) return KNOTS[0]![to];
  if (x >= KNOTS[last]![from]) return KNOTS[last]![to];
  let i = 1;
  while (KNOTS[i]![from] < x) i++;
  const a = KNOTS[i - 1]!;
  const b = KNOTS[i]!;
  return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
}

/** Real seconds to visual seconds, clamped to [0, VISUAL_END]. */
export const warp = (r: number) => interp(r, 0, 1);
/** Visual seconds to real seconds, clamped to [0, REAL_END]. */
export const unwarp = (v: number) => interp(v, 1, 0);
