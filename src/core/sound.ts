// Small procedural sounds. Nothing plays until the first interaction.
// Each chapter maps its own steps onto these primitives.

type AudioContextCtor = typeof AudioContext;

class SoundKit {
  on = true;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Start (or resume) audio. Call from a user gesture. */
  ensure(): boolean {
    if (!this.on) return false;
    try {
      if (!this.ctx) {
        const AC: AudioContextCtor | undefined =
          window.AudioContext || (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        const out = ctx.createGain();
        out.gain.value = 0.32;
        const comp = ctx.createDynamicsCompressor();
        out.connect(comp);
        comp.connect(ctx.destination);
        const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.ctx = ctx;
        this.out = out;
        this.noise = buf;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  ready(): boolean {
    return this.on && !!this.ctx;
  }

  /** A pentatonic pitch for a value in [0, max]. */
  pitch(v: number, max = 999): number {
    const steps = [0, 2, 4, 7, 9];
    const i = Math.round((Math.max(0, Math.min(max, v)) / max) * 14);
    return 220 * Math.pow(2, (steps[i % 5] + 12 * Math.floor(i / 5)) / 12);
  }

  tink(f: number, vol = 0.5, when = 0, dec = 0.9): void {
    const c = this.ctx,
      out = this.out;
    if (!c || !out || !this.on) return;
    const t0 = c.currentTime + when;
    for (const [m, g, d] of [
      [1, 1, dec],
      [2.76, 0.32, dec * 0.4],
      [5.4, 0.14, dec * 0.2],
    ]) {
      const o = c.createOscillator(),
        a = c.createGain();
      o.frequency.value = f * m;
      o.type = 'sine';
      a.gain.setValueAtTime(0, t0);
      a.gain.linearRampToValueAtTime(vol * g, t0 + 0.004);
      a.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(a);
      a.connect(out);
      o.start(t0);
      o.stop(t0 + d + 0.05);
    }
  }

  hiss(dur: number, f0: number, f1: number, vol = 0.08, when = 0): void {
    const c = this.ctx,
      out = this.out;
    if (!c || !out || !this.noise || !this.on) return;
    const t0 = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t0);
    bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const a = c.createGain();
    a.gain.setValueAtTime(0, t0);
    a.gain.linearRampToValueAtTime(vol, t0 + dur * 0.3);
    a.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp);
    bp.connect(a);
    a.connect(out);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
  }

  thud(when = 0, f = 110, vol = 0.35): void {
    const c = this.ctx,
      out = this.out;
    if (!c || !out || !this.on) return;
    const t0 = c.currentTime + when,
      o = c.createOscillator(),
      a = c.createGain();
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t0 + 0.25);
    a.gain.setValueAtTime(vol, t0);
    a.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    o.connect(a);
    a.connect(out);
    o.start(t0);
    o.stop(t0 + 0.35);
  }

  wobble(): void {
    const c = this.ctx,
      out = this.out;
    if (!c || !out || !this.on) return;
    const t0 = c.currentTime;
    for (const f of [196, 203]) {
      const o = c.createOscillator(),
        a = c.createGain();
      o.frequency.value = f;
      a.gain.setValueAtTime(0, t0);
      a.gain.linearRampToValueAtTime(0.1, t0 + 0.05);
      a.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(a);
      a.connect(out);
      o.start(t0);
      o.stop(t0 + 1);
    }
  }

  chime(when = 0): void {
    this.tink(784, 0.18, when, 1.2);
    this.tink(1175, 0.12, when + 0.08, 1.2);
  }
}

export const sound = new SoundKit();

export function bindSoundToggle(button: HTMLElement): void {
  button.addEventListener('click', () => {
    sound.on = !sound.on;
    button.setAttribute('aria-pressed', String(sound.on));
    if (sound.on) sound.ensure();
  });
}
