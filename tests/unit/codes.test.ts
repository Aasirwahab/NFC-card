import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateCode,
  generateCodes,
  isValidCode,
  normaliseCode,
} from '@/lib/domain/codes';

/** Real randomness, for the properties that are about the generator as shipped. */
const realRandom = (size: number) => crypto.getRandomValues(new Uint8Array(size));

/** A deterministic source, for the properties that are about the algorithm. */
const bytesFrom = (values: number[]) => {
  let cursor = 0;
  return (size: number) => {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      out[i] = values[cursor % values.length]!;
      cursor++;
    }
    return out;
  };
};

describe('the alphabet (§22.1)', () => {
  it('has 31 characters', () => {
    expect(CODE_ALPHABET).toHaveLength(31);
    expect(new Set(CODE_ALPHABET).size).toBe(31);
  });

  it('excludes every confusable character', () => {
    // I, L, O, 0 and 1 are removed so a code read off a card is never mistyped.
    for (const char of ['I', 'L', 'O', '0', '1']) {
      expect(CODE_ALPHABET).not.toContain(char);
    }
  });
});

describe('generateCode', () => {
  it('returns eight characters, all from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode(realRandom);
      expect(code).toHaveLength(CODE_LENGTH);
      for (const char of code) expect(CODE_ALPHABET).toContain(char);
    }
  });

  it('rejects biased bytes rather than folding them', () => {
    // 256 is not a multiple of 31: bytes 248-255 would make the first eight
    // characters of the alphabet fractionally more likely. They must be skipped.
    // Feeding only rejected bytes followed by a zero must yield the FIRST letter,
    // not whatever 248 % 31 would give.
    const code = generateCode(bytesFrom([248, 249, 250, 251, 252, 253, 254, 255, 0]));
    expect(code).toBe(CODE_ALPHABET[0]!.repeat(CODE_LENGTH));
  });

  it('maps bytes to the alphabet by modulo', () => {
    const code = generateCode(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toBe('ABCDEFGH');
  });

  it('keeps going when the random source is starved of usable bytes', () => {
    // Every eighth byte is usable; the loop must request more rather than hang
    // or return a short code.
    const pattern = [250, 250, 250, 250, 250, 250, 250, 9];
    expect(generateCode(bytesFrom(pattern))).toHaveLength(CODE_LENGTH);
  });
});

describe('generateCodes', () => {
  it('generates 100 codes with no collisions (Phase 1 done-when)', () => {
    const codes = generateCodes(realRandom, 100);
    expect(codes).toHaveLength(100);
    expect(new Set(codes).size).toBe(100);
    for (const code of codes) expect(isValidCode(code)).toBe(true);
  });

  it('gives up rather than looping forever on a broken RNG', () => {
    // A source that always returns the same byte can only ever produce one code.
    expect(() => generateCodes(bytesFrom([5]), 2)).toThrow(/is the RNG working/);
  });
});

describe('isValidCode', () => {
  it('accepts a well-formed code', () => {
    expect(isValidCode('K7M3PQ2X')).toBe(true);
  });

  it('rejects the wrong length, lower case, and excluded characters', () => {
    expect(isValidCode('K7M3PQ2')).toBe(false);
    expect(isValidCode('K7M3PQ2XY')).toBe(false);
    expect(isValidCode('k7m3pq2x')).toBe(false);
    expect(isValidCode('K7M3PQ2O')).toBe(false); // O is not in the alphabet
    expect(isValidCode('K7M3PQ21')).toBe(false); // nor is 1
    expect(isValidCode('')).toBe(false);
  });
});

describe('normaliseCode', () => {
  it('handles what a person actually types off a card', () => {
    expect(normaliseCode('  k7m3pq2x ')).toBe('K7M3PQ2X');
    expect(normaliseCode('K7M3-PQ2X')).toBe('K7M3PQ2X');
    expect(normaliseCode('K7M3 PQ2X')).toBe('K7M3PQ2X');
  });

  it('does not guess at excluded characters', () => {
    // Folding a typed O onto Q would resolve one prospect's code to another
    // prospect's card. An unrecognised code gets the generic 404 instead.
    const normalised = normaliseCode('K7M3PQ2O');
    expect(normalised).toBe('K7M3PQ2O');
    expect(isValidCode(normalised)).toBe(false);
  });
});
