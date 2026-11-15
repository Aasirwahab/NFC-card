import { MAX_SECONDS, SAMPLE_RATE } from '@/lib/capture/voice';

/** 16-bit PCM mono WAV from samples in -1..1. PURE; the one format every audio model accepts. */
export function encodeWav(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(out.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => {
    const clamped = Math.max(-1, Math.min(1, s));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return out;
}

/** An overlong take (a suspended tab keeps the clock running) is cut to the cap, not refused. */
export function capSamples(samples: Float32Array): Float32Array {
  return samples.subarray(0, MAX_SECONDS * SAMPLE_RATE);
}

/**
 * Whatever the browser recorded (webm/opus on Chrome, mp4 on iOS Safari) to 16 kHz
 * mono WAV. The offline context does the resampling and the mix-down. Browser only.
 */
export async function toWav16kMono(recording: Blob): Promise<Uint8Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const offline = new OfflineAudioContext(
      1,
      Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)),
      SAMPLE_RATE,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(capSamples(rendered.getChannelData(0)));
  } finally {
    void context.close();
  }
}
