// Small procedural sounds. Nothing plays until the first interaction.
// Each chapter maps its own steps onto these primitives.
export const Sound = {
  ctx: null, on: true, out: null, noise: null,
  ensure() {
    if (!this.on) return false;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.out = this.ctx.createGain(); this.out.gain.value = 0.32;
        const comp = this.ctx.createDynamicsCompressor(); this.out.connect(comp); comp.connect(this.ctx.destination);
        const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.5, this.ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = b;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    } catch { return false; }
  },
  ready() { return this.on && !!this.ctx; },
  // a pentatonic pitch for a value in [0, max]
  pitch(v, max = 999) { const steps = [0, 2, 4, 7, 9]; const i = Math.round((Math.max(0, Math.min(max, v)) / max) * 14); return 220 * Math.pow(2, (steps[i % 5] + 12 * Math.floor(i / 5)) / 12); },
  tink(f, vol = 0.5, when = 0, dec = 0.9) {
    const c = this.ctx, t0 = c.currentTime + when;
    [[1, 1, dec], [2.76, 0.32, dec * 0.4], [5.4, 0.14, dec * 0.2]].forEach(([m, g, d]) => {
      const o = c.createOscillator(), a = c.createGain();
      o.frequency.value = f * m; o.type = 'sine';
      a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(vol * g, t0 + 0.004); a.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(a); a.connect(this.out); o.start(t0); o.stop(t0 + d + 0.05);
    });
  },
  hiss(dur, f0, f1, vol = 0.08, when = 0) {
    const c = this.ctx, t0 = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const a = c.createGain(); a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(vol, t0 + dur * 0.3); a.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp); bp.connect(a); a.connect(this.out); s.start(t0); s.stop(t0 + dur + 0.05);
  },
  thud(when = 0, f = 110, vol = 0.35) {
    const c = this.ctx, t0 = c.currentTime + when, o = c.createOscillator(), a = c.createGain();
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.6, t0 + 0.25);
    a.gain.setValueAtTime(vol, t0); a.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    o.connect(a); a.connect(this.out); o.start(t0); o.stop(t0 + 0.35);
  },
  wobble() {
    const c = this.ctx, t0 = c.currentTime;
    [196, 203].forEach(f => { const o = c.createOscillator(), a = c.createGain(); o.frequency.value = f; a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(0.1, t0 + 0.05); a.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9); o.connect(a); a.connect(this.out); o.start(t0); o.stop(t0 + 1); });
  },
  chime(when = 0) { this.tink(784, 0.18, when, 1.2); this.tink(1175, 0.12, when + 0.08, 1.2); },
};

export function bindSoundToggle(button) {
  button.addEventListener('click', () => { Sound.on = !Sound.on; button.setAttribute('aria-pressed', String(Sound.on)); if (Sound.on) Sound.ensure(); });
}
