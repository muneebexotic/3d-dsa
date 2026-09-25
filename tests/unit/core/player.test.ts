import { describe, expect, it, vi } from 'vitest';
import { lerp } from '@/core/math';
import { Player, readingHold, type PlayerHooks, type Program, type Transition } from '@/core/player';

// A toy chapter: the pose is a number, and step i moves it to steps[i] in one second.
type Prog = Program<number, number>;
const line = (a: number, b: number, dur: number): Transition<number> => ({ dur, pose: t => lerp(a, b, t) });

function setup(steps = [10, 20, 30], startPose = 0) {
  const hooks = {
    build: (prog: Prog, i: number) => line(i === 0 ? prog.startPose : prog.steps[i - 1], prog.steps[i], 1),
    morph: (a: number, b: number, dur: number) => line(a, b, dur),
    holdFor: () => 0.5,
    onUI: vi.fn(),
    onShow: vi.fn(),
  } satisfies PlayerHooks<number, number, Prog>;
  const player = new Player<number, number, Prog>(hooks, { steps, startPose });
  /** Advance the clock in small ticks, as the frame loop would. */
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.05) player.tick(0.05);
  };
  return { player, hooks, run };
}

describe('Player', () => {
  it('rests at the start pose before the first step', () => {
    const { player } = setup();
    expect(player.idx).toBe(-1);
    expect(player.pose()).toBe(0);
    expect(player.atEnd()).toBe(false);
  });

  it('steps forward and back through the same motion', () => {
    const { player, run } = setup();
    player.stepBy(1);
    run(0.5);
    expect(player.pose()).toBeCloseTo(5);
    run(0.6);
    expect(player.idx).toBe(0);
    expect(player.pose()).toBe(10);

    player.stepBy(-1);
    run(0.5);
    expect(player.pose()).toBeCloseTo(5);
    run(0.6);
    expect(player.idx).toBe(-1);
    expect(player.pose()).toBe(0);
  });

  it('queues a step pressed mid-motion instead of dropping it', () => {
    const { player, run } = setup();
    player.stepBy(1);
    run(0.3);
    player.stepBy(1);
    run(2.2);
    expect(player.idx).toBe(1);
  });

  it('plays to the end, holding after each step, then stops', () => {
    const { player, hooks, run } = setup();
    player.togglePlay();
    expect(player.playing).toBe(true);
    run(3 * 1 + 3 * 0.5 + 0.5);
    expect(player.atEnd()).toBe(true);
    expect(player.playing).toBe(false);
    expect(player.pose()).toBe(30);
    expect(hooks.onUI).toHaveBeenCalled();
  });

  it('replays from the start when play is pressed at the end', () => {
    const { player, run } = setup();
    player.seek(2);
    run(1);
    expect(player.atEnd()).toBe(true);
    player.togglePlay();
    run(0.7);
    expect(player.idx).toBe(-1);
    expect(player.pose()).toBe(0);
  });

  it('seeks with a smooth move to the rest pose of any step', () => {
    const { player, run } = setup();
    player.seek(1);
    expect(player.pose()).toBe(0);
    run(0.25);
    expect(player.pose()).toBeGreaterThan(0);
    expect(player.pose()).toBeLessThan(20);
    run(0.3);
    expect(player.pose()).toBe(20);
    expect(player.playing).toBe(false);
  });

  it('plays faster at a higher speed', () => {
    const { player, run } = setup();
    player.speed = 4;
    player.stepBy(1);
    run(0.3);
    expect(player.idx).toBe(0);
  });

  it('morphs from where it was when a new program loads mid-way', () => {
    const { player, run } = setup();
    player.stepBy(1);
    run(0.5);
    player.load({ steps: [100], startPose: 50 }, { catchDur: 0.4, autoplay: false });
    expect(player.pose()).toBeCloseTo(5);
    run(0.45);
    expect(player.pose()).toBe(50);
    expect(player.idx).toBe(-1);
  });
});

describe('readingHold', () => {
  const step = { kind: 'k', head: 'x'.repeat(40), body: 'y'.repeat(60) };
  it('waits a base time plus reading time, capped', () => {
    expect(readingHold(step, { k: 0.5 }, { k: 0.01 }, false)).toBeCloseTo(1.5);
    expect(readingHold({ ...step, body: 'y'.repeat(1000) }, { k: 0.5 }, { k: 0.01 }, false)).toBeCloseTo(2);
  });
  it('uses a flat pause when motion is reduced', () => {
    expect(readingHold(step, { k: 0.5 }, { k: 0.01 }, true)).toBe(0.6);
  });
});
