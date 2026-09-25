import { describe, expect, it } from 'vitest';
import { MAX_EDGES, MAX_NODES, RUN } from '@/chapters/graphs/algorithms';
import { PRESETS } from '@/chapters/graphs/presets';

describe.each(Object.entries(PRESETS))('preset %s', (_key, preset) => {
  const g = preset.make();

  it('fits on the plinth, with unique labels', () => {
    expect(g.size).toBeGreaterThan(0);
    expect(g.size).toBeLessThanOrEqual(MAX_NODES);
    expect(g.edges.size).toBeLessThanOrEqual(MAX_EDGES);
    const labels = [...g.nodes.values()].map(n => n.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('names a start and target that exist', () => {
    expect(g.byLabel(preset.start)).not.toBeNull();
    if (preset.target) expect(g.byLabel(preset.target)).not.toBeNull();
  });

  it('runs every algorithm to completion', () => {
    const s = g.byLabel(preset.start) as number,
      t = preset.target ? g.byLabel(preset.target) : null;
    for (const run of Object.values(RUN)) expect(run(g, s, t).length).toBeGreaterThan(1);
  });

  it.runIf(preset.random)('repeats a shuffle from the same seed, and varies across seeds', () => {
    const json = (seed: number) => JSON.stringify(preset.make(seed).toJSON());
    expect(json(42)).toBe(json(42));
    expect(new Set([1, 2, 3, 4, 5].map(json)).size).toBeGreaterThan(1);
  });
});

it('the islands preset shows a target that cannot be reached', () => {
  const g = PRESETS.islands.make();
  const steps = RUN.dijkstra(
    g,
    g.byLabel(PRESETS.islands.start) as number,
    g.byLabel(PRESETS.islands.target ?? '') as number,
  );
  expect(steps[steps.length - 1].kind).toBe('unreachable');
});

it('the large preset fills the plinth', () => {
  const g = PRESETS.large.make();
  expect(g.size).toBe(MAX_NODES);
});
