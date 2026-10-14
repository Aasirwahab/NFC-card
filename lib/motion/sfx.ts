/** Web Audio UI sounds. Off by default; `unlock()` must run from a user click (iOS rule). Every sound is synthesised, no files. */
export type SfxKind = 'thock' | 'tick' | 'whoosh' | 'hit' | 'rwhoosh' | 'riser' | 'deep';
export type SfxOpt = {
  /** Frequency multiplier, 1 = default. */
  pitch?: number;
  /** Seconds, for riser only. */
  dur?: number;
};

class SoundFX {
  private ctx: AudioContext | null = null;
  private muted = true;
  private noise: AudioBuffer | null = null;
  private live: { gain: GainNode; stop: () => void } | null = null;

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
    this.cut();
  }

  /** Stops a running riser (the film cuts it dead at 15.0 s). */
  cut() {
    const ctx = this.ctx;
    const live = this.live;
    if (!ctx || !live) return;
    this.live = null;
    live.gain.gain.cancelScheduledValues(ctx.currentTime);
    live.gain.gain.setValueAtTime(live.gain.gain.value, ctx.currentTime);
    live.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.03);
    live.stop();
  }

  private noiseBuf(ctx: AudioContext) {
    if (!this.noise) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  play(kind: SfxKind, opt: SfxOpt = {}) {
    const ctx = this.ctx;
    if (this.muted || !ctx) return;
    const p = opt.pitch ?? 1;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const tone = (f1: number, f2: number, d: number, v: number, type: OscillatorType = 'sine') => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + d);
      gain.gain.setValueAtTime(v, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gain);
      o.start(t);
      o.stop(t + d);
    };
    /** Band-passed noise sweep from f1 to f2 with a gain envelope. */
    const sweep = (f1: number, f2: number, d: number, g0: number, g1: number, peakAt = 0) => {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      src.buffer = this.noiseBuf(ctx);
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(f1, t);
      filter.frequency.exponentialRampToValueAtTime(f2, t + d);
      gain.gain.setValueAtTime(g0, t);
      if (peakAt > 0) gain.gain.linearRampToValueAtTime(g1, t + d * peakAt);
      gain.gain.exponentialRampToValueAtTime(0.001, t + d);
      src.connect(filter).connect(gain);
      src.start(t);
      src.stop(t + d);
      return src;
    };

    if (kind === 'thock') tone(130 * p, 38, 0.07, 0.35);
    else if (kind === 'tick') tone(2200 * p, 2200 * p, 0.015, 0.12);
    else if (kind === 'whoosh') sweep(300, 1500, 0.2, 0.2, 0.2);
    else if (kind === 'hit') {
      tone(160 * p, 40, 0.14, 0.5, 'triangle');
      const g2 = ctx.createGain();
      g2.connect(ctx.destination);
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf(ctx);
      g2.gain.setValueAtTime(0.25, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      n.connect(g2);
      n.start(t);
      n.stop(t + 0.06);
    } else if (kind === 'rwhoosh') sweep(1800, 250, 0.32, 0.01, 0.22, 0.85);
    else if (kind === 'deep') tone(70, 24, 0.75, 0.7);
    else {
      // riser: rising filtered noise, kept so cut() can stop it
      const d = opt.dur ?? 3;
      this.cut();
      const src = sweep(180, 3800, d, 0.01, 0.16, 0.98);
      this.live = { gain, stop: () => src.stop() };
    }
  }
}

export const sfx = new SoundFX();
