// The step player's promise: every step starts exactly where the previous one
// came to rest, so playing, stepping and rewinding never jump.

import { describe, expect, it } from 'vitest';
import type { AlgoKey } from '@/chapters/graphs/algorithms';
import { buildTransition } from '@/chapters/graphs/motion';
import type { ScenePose } from '@/chapters/graphs/poses';
import { PRESETS, type PresetKey } from '@/chapters/graphs/presets';
import { makeProgram, type Mode } from '@/chapters/graphs/program';

/** The geometry of a scene: where every knot sits and how much of every string is drawn. */
function geometry(P: ScenePose): Record<string, number> {
  const out: Record<string, number> = {};
  for (const N of P.nets) {
    out[`${N.key}.tau`] = N.tau;
    for (const [k, n] of N.nodes)
      Object.assign(out, { [`${k}.x`]: n.x, [`${k}.z`]: n.z, [`${k}.h`]: n.h, [`${k}.s`]: n.s });
    for (const [k, e] of N.edges) Object.assign(out, { [`${k}.s`]: e.s, [`${k}.tree`]: e.tree, [`${k}.path`]: e.path });
  }
  return out;
}

function expectSameGeometry(a: ScenePose, b: ScenePose, where: string): void {
  const A = geometry(a),
    B = geometry(b);
  expect(Object.keys(A).sort(), where).toEqual(Object.keys(B).sort());
  for (const k of Object.keys(A)) expect(A[k], `${where}: ${k}`).toBeCloseTo(B[k], 6);
}

const SHOWN: readonly PresetKey[] = ['textbook', 'contrast', 'islands', 'sparse'];
const RUNS: readonly [Mode, AlgoKey][] = [
  ['single', 'bfs'],
  ['single', 'dfs'],
  ['single', 'dijkstra'],
  ['race', 'bfs'],
];

describe.each(SHOWN)('%s', key => {
  it.each(RUNS)('%s %s: each step starts where the last one rested', (mode, algo) => {
    const preset = PRESETS[key],
      graph = preset.make();
    const prog = makeProgram({
      graph,
      mode,
      algo,
      race: preset.race ?? ['bfs', 'dfs'],
      start: graph.byLabel(preset.start),
      target: preset.target ? graph.byLabel(preset.target) : null,
      gen: 1,
    });
    expect(prog.steps.length).toBeGreaterThan(1);
    let rest = prog.startPose;
    for (let i = 0; i < prog.steps.length; i++) {
      const tr = buildTransition(prog, i);
      expect(tr.dur).toBeGreaterThan(0);
      expectSameGeometry(tr.pose(0), rest, `step ${i} (${String(prog.steps[i].kind)})`);
      rest = tr.pose(1);
    }
  });
});
