// A program is what the player plays: one algorithm on one plinth, or a race of
// two on two plinths driven by one clock. Also the narration for races and intros.

import { plural } from '../../core/math';
import { ALGOS, TICK_KINDS, type AlgoKey, type Graph, type NodeId, type Step, type StepKind } from './algorithms';
import { makeCtx, netStatic, type NetCtx, type ScenePose } from './poses';

export type Mode = 'single' | 'race';

export interface RaceStatus {
  kind: StepKind;
  /** The tick on which this algorithm finished (1-based). */
  tick: number;
  strings: number;
  cost: number;
  visited: number;
}
/** One tick of a race: each algorithm visits one knot. */
export interface RaceStep {
  kind: 'tick';
  k: number;
  head: string;
  body: string;
  /** Some algorithm reached the target on this tick. */
  hit: boolean;
  status: (RaceStatus | null)[];
  visited: number[];
}
export type ProgramStep = Step | RaceStep;

export interface GraphProgram {
  mode: Mode;
  nets: NetCtx[];
  steps: ProgramStep[];
  title: string;
  graph: Graph;
  startPose: ScenePose;
  intro: { head: string; body: string };
}

export interface ProgramSpec {
  graph: Graph;
  mode: Mode;
  algo: AlgoKey;
  race: readonly [AlgoKey, AlgoKey];
  start: NodeId | null;
  target: NodeId | null;
  gen: number;
}

export const INTRO: Readonly<Record<AlgoKey, string>> = {
  bfs: 'Breadth-first search visits knots in rings: everything one string away, then two, then three. Weights are ignored; every string counts as one step. Its queue is on the right.',
  dfs: 'Depth-first search follows one thread as deep as it can and backs up only at a dead end. Its stack is the thread.',
  dijkstra:
    'Dijkstra finds the cheapest route when strings have weights. Watch the net lift off the plinth in order of distance.',
};
const SHAPE: Readonly<Record<AlgoKey, string>> = {
  bfs: 'BFS spreads a layer at a time',
  dfs: 'DFS follows one thread as deep as it goes',
  dijkstra: 'Dijkstra always settles the cheapest knot next',
};

/** The fine-step range of tick k on a race plinth, or null once it has finished. */
export function tickRange(ctx: NetCtx, k: number): [number, number] | null {
  const ticks = ctx.ticks ?? [];
  if (k >= ticks.length) return null;
  return [k ? ticks[k - 1] + 1 : 0, ticks[k]];
}
/** The last fine step shown after tick k (-1 before the first). */
export function tickEnd(ctx: NetCtx, k: number): number {
  const ticks = ctx.ticks ?? [];
  return k < 0 ? -1 : ticks[Math.min(k, ticks.length - 1)];
}

const isEnd = (s: Step) => s.kind === 'found' || s.kind === 'path' || s.kind === 'unreachable' || s.kind === 'done';
const reachedTarget = (s: RaceStatus | null) => !!s && (s.kind === 'found' || s.kind === 'path');

function raceSteps(ctxs: NetCtx[]): RaceStep[] {
  const K = Math.max(...ctxs.map(c => (c.ticks ?? []).length));
  const status: (RaceStatus | null)[] = ctxs.map(() => null);
  const steps: RaceStep[] = [];
  for (let k = 0; k < K; k++) {
    const parts: string[] = [];
    let hit = false;
    ctxs.forEach((c, j) => {
      const r = tickRange(c, k);
      if (!r) return;
      const L = (id: NodeId | null | undefined) => (id == null ? '?' : c.g.label(id)),
        name = ALGOS[c.algo].name;
      const sub = c.steps.slice(r[0], r[1] + 1);
      const lead = sub.find(s => TICK_KINDS[c.algo].has(s.kind)) || sub[0];
      let text =
        lead.kind === 'dequeue'
          ? `${name} takes ${L(lead.focus)} off the queue`
          : lead.kind === 'dive'
            ? `${name} dives to ${L(lead.to)}`
            : lead.kind === 'start'
              ? `${name} starts at ${L(lead.focus)}`
              : lead.kind === 'extract'
                ? `${name} settles ${L(lead.focus)} at ${lead.tau}`
                : `${name} ${lead.head.charAt(0).toLowerCase()}${lead.head.slice(1).replace(/\.$/, '')}`;
      const end = sub.find(isEnd);
      if (end) {
        let cost = 0;
        for (let q = 1; q < end.path.length; q++) cost += c.g.findEdge(end.path[q - 1], end.path[q])?.w ?? 0;
        status[j] = {
          kind: end.kind,
          tick: k + 1,
          strings: Math.max(0, end.path.length - 1),
          cost,
          visited: end.visited,
        };
        if (end.kind === 'found' || end.kind === 'path') {
          text += ` and reaches ${L(c.target)}`;
          hit = true;
        } else if (c.target != null) text += `, and ${L(c.target)} is out of reach`;
        else text += ' and is done';
      }
      parts.push(text);
    });
    const names = ctxs.map(c => ALGOS[c.algo].name);
    let body =
      k === 0
        ? `One tick is one knot visited, on both plinths at once. Watch the shapes: ${SHAPE[ctxs[0].algo]}; ${SHAPE[ctxs[1].algo]}.`
        : `Knots visited so far: ${ctxs.map((c, j) => `${names[j]} ${c.steps[tickEnd(c, k)].visited}`).join(', ')}.`;
    if (k === K - 1) body = raceSummary(ctxs, status);
    steps.push({
      kind: 'tick',
      k,
      head: parts.join('; ') + '.',
      body,
      hit,
      status: status.map(s => s && { ...s }),
      visited: ctxs.map(c => c.steps[tickEnd(c, k)].visited),
    });
  }
  return steps;
}

function raceSummary(ctxs: NetCtx[], status: (RaceStatus | null)[]): string {
  const out: string[] = [];
  const L = (id: NodeId | null) => (id == null ? '?' : ctxs[0].g.label(id));
  const weighted = ctxs.some(x => x.algo === 'dijkstra');
  ctxs.forEach((c, j) => {
    const s = status[j],
      name = ALGOS[c.algo].name;
    if (!s) return;
    if (reachedTarget(s))
      out.push(
        `${name} reached ${L(c.target)} after ${plural(s.tick, 'tick')}, by a route of ${plural(s.strings, 'string')}${weighted ? ` costing ${s.cost}` : ''}.`,
      );
    else if (c.target != null) out.push(`${name} could not reach ${L(c.target)}.`);
    else out.push(`${name} visited ${plural(s.visited, 'knot')} in ${plural(s.tick, 'tick')}.`);
  });
  const algos = ctxs.map(c => c.algo);
  if (ctxs[0].target != null && status.every(reachedTarget)) {
    if (algos.includes('bfs') && algos.includes('dfs'))
      out.push('Both find a route, but only BFS promises the fewest strings.');
    else if (algos.includes('dijkstra'))
      out.push('Dijkstra’s route is the cheapest by weight; BFS and DFS ignore weights.');
  }
  return out.join(' ');
}

export function makeProgram(spec: ProgramSpec): GraphProgram {
  const { graph: g, mode, algo, race, start, target, gen } = spec;
  let nets: NetCtx[], steps: ProgramStep[], title: string;
  if (mode === 'race') {
    nets = race.map((a, j) => makeCtx({ g, algo: a, j, count: 2, gen, start, target }));
    steps = nets[0].steps.length ? raceSteps(nets) : [];
    title = `Race · ${ALGOS[race[0]].name} vs ${ALGOS[race[1]].name}`;
  } else {
    nets = [makeCtx({ g, algo, j: 0, count: 1, gen, start, target })];
    steps = nets[0].steps;
    title =
      start != null && g.nodes.has(start)
        ? `${ALGOS[algo].name} from ${g.label(start)}${target != null ? ` to ${g.label(target)}` : ''}`
        : ALGOS[algo].long;
  }
  const startPose: ScenePose = { nets: nets.map(c => netStatic(c, -1)), callout: null, focus: null };
  return { mode, nets, steps, title, graph: g, startPose, intro: introText(spec, title) };
}

function introText({ graph: g, mode, algo, race, target }: ProgramSpec, title: string): { head: string; body: string } {
  if (!g.size)
    return {
      head: 'The plinth is empty.',
      body: 'Choose + Node and click the plinth to add knots, then + Edge to tie strings between them. Or pick a graph from the list.',
    };
  if (mode === 'race') {
    const t = target != null ? g.label(target) : null;
    return {
      head: `${title}${t ? `, to ${t}` : ''}.`,
      body: `Two plinths, one clock: each tick, both algorithms visit one knot. ${SHAPE[race[0]]}; ${SHAPE[race[1]]}. Press play${t ? ` to see which reaches ${t} first` : ''}.`,
    };
  }
  return { head: `${title}.`, body: `${INTRO[algo]} Press play.` };
}

/** The algorithm step a race plinth shows after program step i (or the step itself in single mode). */
export function fineIndex(prog: GraphProgram, ctx: NetCtx, i: number): number {
  return prog.mode === 'race' ? (i >= 0 ? tickEnd(ctx, i) : -1) : i;
}
