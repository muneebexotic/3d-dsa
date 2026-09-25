// The step player shared by every chapter.
//
// An algorithm runs instantly and records a list of steps. A chapter describes
// each step as a transition: { dur, pose(t) } with t in [0, 1]. The player walks
// through those transitions: forward plays t from 0 to 1, back plays the same
// motion from 1 to 0, so rewinding never needs its own animation.

import { clamp01 } from './math';

export interface Transition<P> {
  dur: number;
  pose(t: number): P;
}

export interface Program<S, P> {
  steps: S[];
  startPose: P;
}

export interface PlayerHooks<S, P, G extends Program<S, P>> {
  /** The transition for step i. */
  build(prog: G, i: number): Transition<P>;
  /** A transition between two arbitrary poses (seek, catch-up, replay). */
  morph(from: P, to: P, dur: number): Transition<P>;
  /** Seconds to wait after a step while playing. */
  holdFor?(step: S): number;
  /** A step is about to be shown (i = -1 before the first step). */
  onShow?(i: number): void;
  /** A step starts playing forward. */
  onStep?(step: S, i: number, tr: Transition<P>): void;
  /** Step i starts playing in reverse. */
  onBack?(i: number): void;
  /** A transition finished; the rest state changed. */
  onRefresh?(): void;
  /** Playing, paused or end state changed. */
  onUI?(): void;
  /** A new program was loaded. */
  onLoad?(): void;
  /** A user action that may start audio. */
  onGesture?(): void;
}

export interface ActiveTransition<P> {
  tr: Transition<P>;
  /** The step this motion belongs to (-1 for intros and catch-ups). */
  i: number;
  dir: 1 | -1;
  t: number;
  /** Runs instead of the reading hold when the motion ends. */
  after?: () => void;
}

export interface LoadOptions {
  /** Seconds to morph from the old pose when the previous program was left mid-way. */
  catchDur?: number;
  autoplay?: boolean;
}

export class Player<S, P, G extends Program<S, P> = Program<S, P>> {
  prog: G;
  /** Index of the last completed step (-1 = before the first). */
  idx = -1;
  tr: ActiveTransition<P> | null = null;
  playing = false;
  hold = 0;
  speed = 1;
  /** A step requested while a transition was running. */
  queue = 0;
  /** Test hook: stop advancing time. */
  freeze = false;
  private readonly cache = new Map<number, Transition<P>>();
  private readonly hooks: PlayerHooks<S, P, G>;

  constructor(hooks: PlayerHooks<S, P, G>, prog: G) {
    this.hooks = hooks;
    this.prog = prog;
  }

  get steps(): S[] {
    return this.prog.steps;
  }

  trFor(i: number): Transition<P> {
    let t = this.cache.get(i);
    if (!t) {
      t = this.hooks.build(this.prog, i);
      this.cache.set(i, t);
    }
    return t;
  }

  restPose(): P {
    return this.idx >= 0 ? this.trFor(this.idx).pose(1) : this.prog.startPose;
  }

  pose(): P {
    const T = this.tr;
    return T ? T.tr.pose(clamp01(T.t)) : this.restPose();
  }

  atEnd(): boolean {
    return !this.tr && this.idx >= this.prog.steps.length - 1;
  }

  /** The step whose motion is on screen right now, or the last completed one. */
  activeIndex(): number {
    return this.tr ? this.tr.i : this.idx;
  }

  startStep(dir: 1 | -1): boolean {
    const steps = this.prog.steps;
    if (dir > 0) {
      const i = this.idx + 1;
      if (i >= steps.length) return false;
      const tr = this.trFor(i);
      this.tr = { tr, i, dir: 1, t: 0 };
      this.hooks.onShow?.(i);
      this.hooks.onStep?.(steps[i], i, tr);
    } else {
      if (this.idx < 0) return false;
      const i = this.idx;
      this.tr = { tr: this.trFor(i), i, dir: -1, t: 1 };
      this.hooks.onShow?.(i - 1);
      this.hooks.onBack?.(i);
    }
    return true;
  }

  tick(dt: number): void {
    if (this.freeze) return;
    const T = this.tr;
    if (T) {
      T.t += (T.dir * dt * this.speed) / T.tr.dur;
      if (T.dir > 0 && T.t >= 1) {
        this.tr = null;
        this.idx = T.i;
        if (T.after) T.after();
        else if (T.i >= 0 && this.prog.steps[T.i])
          this.hold = this.hooks.holdFor ? this.hooks.holdFor(this.prog.steps[T.i]) : 0.4;
        this.hooks.onRefresh?.();
      } else if (T.dir < 0 && T.t <= 0) {
        this.tr = null;
        this.idx = T.i - 1;
        this.hooks.onRefresh?.();
      }
      return;
    }
    if (this.queue) {
      const q = this.queue > 0 ? 1 : -1;
      this.queue = 0;
      this.startStep(q);
      return;
    }
    if (this.playing) {
      this.hold -= dt * this.speed;
      if (this.hold <= 0 && !this.startStep(1)) {
        this.playing = false;
        this.hooks.onUI?.();
      }
    }
  }

  /** Load a new program. If the previous one was mid-way, morph to the new start first. */
  load(prog: G, { catchDur = 0.45, autoplay = true }: LoadOptions = {}): void {
    const needCatch = !!this.tr || this.idx < this.prog.steps.length - 1;
    const from = this.pose();
    this.prog = prog;
    this.cache.clear();
    this.idx = -1;
    this.queue = 0;
    this.tr = needCatch
      ? { tr: this.hooks.morph(from, prog.startPose, catchDur), i: -1, dir: 1, t: 0, after: () => (this.hold = 0.1) }
      : null;
    this.playing = autoplay && prog.steps.length > 0;
    this.hold = 0.12;
    this.hooks.onLoad?.();
    this.hooks.onShow?.(-1);
    this.hooks.onUI?.();
  }

  /** Play an opening move (such as lowering the piece into view) without steps. */
  intro(tr: Transition<P>): void {
    this.tr = { tr, i: -1, dir: 1, t: 0, after() {} };
  }

  seek(i: number): void {
    const from = this.pose();
    this.idx = i;
    const to = this.restPose();
    this.tr = { tr: this.hooks.morph(from, to, 0.5), i, dir: 1, t: 0, after() {} };
    this.playing = false;
    this.queue = 0;
    this.hooks.onShow?.(i);
    this.hooks.onUI?.();
  }

  stepBy(d: 1 | -1): void {
    this.playing = false;
    this.hooks.onUI?.();
    if (this.tr) {
      this.queue = d;
      return;
    }
    this.startStep(d);
  }

  togglePlay(): void {
    this.hooks.onGesture?.();
    if (this.playing) {
      this.playing = false;
      this.hooks.onUI?.();
      return;
    }
    if (this.atEnd() && this.prog.steps.length) {
      // replay from the start
      const from = this.pose();
      this.idx = -1;
      this.tr = {
        tr: this.hooks.morph(from, this.prog.startPose, 0.6),
        i: -1,
        dir: 1,
        t: 0,
        after: () => (this.hold = 0.2),
      };
      this.hooks.onShow?.(-1);
    }
    this.playing = this.prog.steps.length > 0;
    this.hold = Math.min(this.hold, 0.05);
    this.hooks.onUI?.();
  }

  /** Test hook: hold the picture at step i, time t. */
  freezeAt(i: number, t: number): void {
    this.playing = false;
    this.freeze = true;
    this.tr = i < 0 ? null : { tr: this.trFor(i), i, dir: 1, t };
    if (i < 0) this.idx = -1;
    this.hooks.onShow?.(i);
    this.hooks.onUI?.();
  }
}

export interface ReadableStep {
  kind: string;
  head?: string;
  body?: string;
}

/** How long to wait after a step while playing: a base per kind plus reading time. */
export function readingHold(
  step: ReadableStep,
  base: Readonly<Record<string, number>>,
  rate: Readonly<Record<string, number>>,
  reduced: boolean,
): number {
  if (reduced) return 0.6;
  const chars = (step.head || '').length + (step.body || '').length;
  return (base[step.kind] ?? 0.3) + Math.min(1.5, chars * (rate[step.kind] ?? 0.009));
}
