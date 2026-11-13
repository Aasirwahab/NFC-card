/**
 * Shared by the recorder (browser) and the transcribe route (server): the limits on
 * a spoken note, the check that an upload really is what the browser promised to
 * send, and the rule for putting the words in the note box. PURE.
 */

export const MAX_SECONDS = 60;
export const SAMPLE_RATE = 16_000;
export const NOTE_MAX_CHARS = 1000;
const HEADER_BYTES = 44;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;
/** A little slack over 60 s for the last audio chunk; the data size is checked separately. */
const MAX_DATA_BYTES = (MAX_SECONDS + 1) * BYTES_PER_SECOND;
export const MAX_WAV_BYTES = HEADER_BYTES + MAX_DATA_BYTES;
/** Under half a second is a mis-tap, not a note. */
const MIN_DATA_BYTES = BYTES_PER_SECOND / 2;

/** True only for 16 kHz mono 16-bit PCM WAV, between half a second and about a minute. */
export function isNoteWav(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_BYTES + MIN_DATA_BYTES || bytes.length > MAX_WAV_BYTES) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  return (
    tag(0) === 'RIFF' &&
    tag(8) === 'WAVE' &&
    tag(12) === 'fmt ' &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === SAMPLE_RATE &&
    view.getUint16(34, true) === 16 &&
    tag(36) === 'data' &&
    view.getUint32(40, true) === bytes.length - HEADER_BYTES
  );
}

/** The note box holds NOTE_MAX_CHARS; spoken words are only added whole, never cut. */
export function noteFits(current: string, spoken: string): boolean {
  return appendNote(current, spoken).length <= NOTE_MAX_CHARS && spoken.trim().length > 0;
}

/** Spoken words go after what is already in the note box; typing is never replaced. */
export function appendNote(current: string, spoken: string): string {
  const words = spoken.trim();
  if (!words) return current;
  if (!current.trim()) return words;
  return `${current.trimEnd()} ${words}`;
}
