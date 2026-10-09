/** Web Audio UI sounds. Off by default; `unlock()` must run from a user click (iOS rule). Each sound is under 300 ms. */
export type SfxKind = 'thock' | 'tick' | 'whoosh';

class SoundFX {
  private ctx: AudioContext | null = null;
  private muted = true;

  get on() {
    return !this.muted;
  }

  unlock() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.muted = false;
  }

  mute() {
    this.muted = true;
  }

  play(kind: SfxKind) {
    const ctx = this.ctx;
    if (this.muted || !ctx) return;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const tone = (f1: number, f2: number, d: number, v: number) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + d);
      gain.gain.setValueAtTime(v, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gain);
      o.start(t);
      o.stop(t + d);
    };
    if (kind === 'thock') tone(130, 38, 0.07, 0.35);
    else if (kind === 'tick') tone(2200, 2200, 0.015, 0.12);
    else {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      src.buffer = buf;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(300, t);
      filter.frequency.exponentialRampToValueAtTime(1500, t + 0.1);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      src.connect(filter).connect(gain);
      src.start(t);
      src.stop(t + 0.2);
    }
  }
}

export const sfx = new SoundFX();
