// The step player shared by every chapter.
//
// An algorithm runs instantly and records a list of steps. A chapter describes
// each step as a transition: { dur, pose(t) } with t in [0, 1]. The player walks
// through those transitions: forward plays t from 0 to 1, back plays the same
// motion from 1 to 0, so rewinding never needs its own animation.
//
// Hooks (all optional except build and morph):
//   build(prog, i)      -> transition for step i
//   morph(P0, P1, dur)  -> transition between two arbitrary poses (seek, catch-up)
//   holdFor(step)       -> seconds to wait after a step while playing
//   onShow(i)           a step is about to be shown (i = -1 before the first step)
//   onStep(step, i, tr) a step starts playing forward
//   onBack(i)           step i starts playing in reverse
//   onRefresh()         a transition finished; the rest state changed
//   onUI()              playing/paused/end state changed
//   onLoad()            a new program was loaded
//   onGesture()         a user action that may start audio

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

export class Player {
  constructor(hooks) {
    this.h = hooks;
    this.prog = null;
    this.idx = -1;       // index of the last completed step (-1 = before the first)
    this.tr = null;      // active transition { tr, i, dir, t, after? }
    this.playing = false;
    this.hold = 0;
    this.speed = 1;
    this.cache = new Map();
    this.queue = 0;      // a step requested while a transition was running
    this.freeze = false; // test hook: stop advancing time
  }
  get steps() { return this.prog ? this.prog.steps : []; }
  trFor(i) {
    let t = this.cache.get(i);
    if (!t) { t = this.h.build(this.prog, i); this.cache.set(i, t); }
    return t;
  }
  restPose() { return this.idx >= 0 ? this.trFor(this.idx).pose(1) : this.prog.startPose; }
  pose() {
    const T = this.tr;
    if (T) return T.tr.pose(clamp01(T.t));
    return this.restPose();
  }
  atEnd() { return !this.tr && this.idx >= this.prog.steps.length - 1; }
  // the step whose motion is on screen right now (or the last completed one)
  activeIndex() { return this.tr ? this.tr.i : this.idx; }

  startStep(dir) {
    const steps = this.prog.steps;
    if (dir > 0) {
      const i = this.idx + 1;
      if (i >= steps.length) return false;
      const tr = this.trFor(i);
      this.tr = { tr, i, dir: 1, t: 0 };
      this.h.onShow?.(i);
      this.h.onStep?.(steps[i], i, tr);
    } else {
      if (this.idx < 0) return false;
      const i = this.idx;
      this.tr = { tr: this.trFor(i), i, dir: -1, t: 1 };
      this.h.onShow?.(i - 1);
      this.h.onBack?.(i);
    }
    return true;
  }
  tick(dt) {
    if (this.freeze) return;
    const T = this.tr;
    if (T) {
      T.t += T.dir * dt * this.speed / T.tr.dur;
      if (T.dir > 0 && T.t >= 1) {
        this.tr = null; this.idx = T.i;
        if (T.after) T.after();
        else if (T.i >= 0 && this.prog.steps[T.i]) this.hold = this.h.holdFor ? this.h.holdFor(this.prog.steps[T.i]) : 0.4;
        this.h.onRefresh?.();
      } else if (T.dir < 0 && T.t <= 0) {
        this.tr = null; this.idx = T.i - 1; this.h.onRefresh?.();
      }
      return;
    }
    if (this.queue) { const q = this.queue; this.queue = 0; this.startStep(q); return; }
    if (this.playing) {
      this.hold -= dt * this.speed;
      if (this.hold <= 0 && !this.startStep(1)) { this.playing = false; this.h.onUI?.(); }
    }
  }
  // Load a new program. If the previous one was mid-way, morph to the new start first.
  load(prog, { catchDur = 0.45, autoplay = true } = {}) {
    const needCatch = this.prog && (this.tr || this.idx < this.prog.steps.length - 1);
    const from = this.prog ? this.pose() : null;
    this.prog = prog;
    this.cache.clear();
    this.idx = -1; this.queue = 0;
    this.tr = needCatch && from ? { tr: this.h.morph(from, prog.startPose, catchDur), i: -1, dir: 1, t: 0, after: () => { this.hold = 0.1; } } : null;
    this.playing = autoplay && prog.steps.length > 0; this.hold = 0.12;
    this.h.onLoad?.(); this.h.onShow?.(-1); this.h.onUI?.();
  }
  // Play an opening move (such as lowering the piece into view) without steps.
  intro(tr) { this.tr = { tr, i: -1, dir: 1, t: 0, after() {} }; }
  seek(i) {
    if (!this.prog) return;
    const from = this.pose();
    this.idx = i;
    const to = this.restPose();
    this.tr = { tr: this.h.morph(from, to, 0.5), i, dir: 1, t: 0, after() {} };
    this.playing = false; this.queue = 0;
    this.h.onShow?.(i); this.h.onUI?.();
  }
  stepBy(d) {
    this.playing = false; this.h.onUI?.();
    if (this.tr) { this.queue = d; return; }
    this.startStep(d);
  }
  togglePlay() {
    this.h.onGesture?.();
    if (this.playing) { this.playing = false; this.h.onUI?.(); return; }
    if (this.atEnd() && this.prog.steps.length) { // replay from the start
      const from = this.pose();
      this.idx = -1;
      this.tr = { tr: this.h.morph(from, this.prog.startPose, 0.6), i: -1, dir: 1, t: 0, after: () => { this.hold = 0.2; } };
      this.h.onShow?.(-1);
    }
    this.playing = this.prog.steps.length > 0; this.hold = Math.min(this.hold, 0.05);
    this.h.onUI?.();
  }
  // test hook: hold the picture at step i, time t
  freezeAt(i, t) {
    this.playing = false; this.freeze = true;
    this.tr = i < 0 ? null : { tr: this.trFor(i), i, dir: 1, t };
    if (i < 0) this.idx = -1;
    this.h.onShow?.(i); this.h.onUI?.();
  }
}

// How long to wait after a step while playing: a base per kind plus reading time.
export function readingHold(step, base, rate, reduced) {
  if (reduced) return 0.6;
  return (base[step.kind] ?? 0.3) + Math.min(1.5, ((step.head || '').length + (step.body || '').length) * (rate[step.kind] ?? 0.009));
}
