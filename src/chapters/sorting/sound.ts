// What each Sorting Loom step sounds like. Every key has a note, higher for bigger
// keys, so a comparison plays its two keys, a sorted row plays a rising scale, and
// a shuffled one a jumble: the sound of sorting.

import { sound } from '../../core/sound';
import type { Recording, Step } from './diagram';

const note = (v: number, top: number): number => sound.pitch(v - 1, Math.max(1, top - 1));

export function playStepSound(rec: Recording, st: Step, prev: Step | null, dur: number, speed: number): void {
  if (!sound.ready()) return;
  const S = dur / speed,
    th = rec.threads,
    V = (id: number) => th.list[id].v;
  switch (st.kind) {
    case 'pick': {
      const [a, b] = st.looms[0].glow;
      if (a == null || b == null) break;
      sound.tink(note(V(a), th.top), 0.14, 0.08 * S, 0.35);
      sound.tink(note(V(b), th.top), 0.14, 0.2 * S, 0.35);
      const moved = prev ? prev.looms[0].arr.some((id, s) => st.looms[0].arr[s] !== id) : st.looms[0].rows > 0;
      if (moved) sound.hiss(0.45 * S, 600, 1800, 0.03, 0.35 * S);
      break;
    }
    case 'move':
      sound.hiss(0.6 * S, 500, 1600, 0.04);
      sound.thud(0.7 * S, 140, 0.08);
      break;
    case 'done': {
      // the finished row, played smallest to biggest
      const arr = st.looms[0].arr;
      const step = Math.min(0.07, (0.9 * S) / Math.max(1, arr.length));
      arr.forEach((id, k) => sound.tink(note(V(id), th.top), 0.09, 0.1 * S + k * step, 0.5));
      sound.chime(0.15 * S + arr.length * step);
      break;
    }
    case 'weave': {
      const before = prev ? prev.looms : rec.start;
      st.looms.forEach((l, k) => {
        if (l.done && !before[k].done) sound.chime(0.9 * S);
      });
      for (let k = 0; k < 6; k++) sound.tink(sound.pitch((k * 3) % 8, 8), 0.05, (0.1 + 0.14 * k) * S, 0.25);
      break;
    }
    case 'stand':
      sound.hiss(1.4 * S, 250, 1200, 0.06, 0.1 * S);
      sound.chime(0.85 * S);
      break;
    default:
      break;
  }
}
