import { describe, expect, it } from 'vitest';
import { capSamples, encodeWav } from '@/lib/browser/wav';
import {
  appendNote,
  isNoteWav,
  MAX_SECONDS,
  MAX_WAV_BYTES,
  SAMPLE_RATE,
} from '@/lib/capture/voice';

const seconds = (n: number) => encodeWav(new Float32Array(SAMPLE_RATE * n));

describe('encodeWav', () => {
  it('writes a 16 kHz mono 16-bit PCM header and scales samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2]));
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      0, 32767, -32768, 32767, -32768,
    ]);
  });
});

describe('isNoteWav', () => {
  it('accepts what the browser makes, up to the cap', () => {
    expect(isNoteWav(seconds(1))).toBe(true);
    expect(isNoteWav(seconds(MAX_SECONDS))).toBe(true);
  });

  it('refuses a mis-tap, an over-long note, other formats and a lying header', () => {
    expect(isNoteWav(encodeWav(new Float32Array(100)))).toBe(false);
    expect(isNoteWav(seconds(MAX_SECONDS + 2))).toBe(false);
    expect(seconds(MAX_SECONDS + 2).length).toBeGreaterThan(MAX_WAV_BYTES);
    expect(isNoteWav(encodeWav(new Float32Array(44_100), 44_100))).toBe(false);
    expect(isNoteWav(new Uint8Array(40_000))).toBe(false);
    expect(isNoteWav(seconds(1).subarray(0, 30_000))).toBe(false);
  });
});

describe('appendNote', () => {
  it('never overwrites what was typed', () => {
    expect(appendNote('stuck on funding', 'and wants a call')).toBe(
      'stuck on funding and wants a call',
    );
    expect(appendNote('typed  \n', ' spoken ')).toBe('typed spoken');
  });

  it('fills an empty box and ignores empty speech', () => {
    expect(appendNote('', ' hello ')).toBe('hello');
    expect(appendNote('   ', 'hello')).toBe('hello');
    expect(appendNote('keep me', '   ')).toBe('keep me');
  });

  it('never cuts spoken words: if they do not fit, they do not go in', () => {
    expect(noteFits('x'.repeat(990), 'y'.repeat(50))).toBe(false);
    expect(noteFits('x'.repeat(1000), 'hi')).toBe(false);
    expect(noteFits('x'.repeat(900), 'y'.repeat(50))).toBe(true);
    expect(noteFits('', '   ')).toBe(false);
  });
});

describe('capSamples', () => {
  it('cuts an overlong take to the cap so it is still accepted', () => {
    const long = capSamples(new Float32Array(SAMPLE_RATE * (MAX_SECONDS + 30)));
    expect(isNoteWav(encodeWav(long))).toBe(true);
    expect(capSamples(new Float32Array(100))).toHaveLength(100);
  });
});
