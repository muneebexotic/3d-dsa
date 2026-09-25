// What each Graph Net step sounds like.

import { sound } from '../../core/sound';
import type { ProgramStep } from './program';

export function playStepSound(st: ProgramStep, dur: number, speed: number): void {
  if (!sound.ready()) return;
  const S = dur / speed,
    p = (v: number) => sound.pitch(v, 30);
  if (st.kind === 'tick') {
    sound.tink(660, 0.12, 0, 0.3);
    if (st.hit) sound.chime(0.4 * S);
    return;
  }
  const tagOf = (id: number | null | undefined) => (id == null ? 0 : Number(st.tag[id]) || 0);
  switch (st.kind) {
    case 'start':
      sound.tink(523, 0.3, 0, 0.7);
      break;
    case 'dequeue':
      sound.tink(p(tagOf(st.focus) * 4), 0.28);
      sound.hiss(0.4, 700, 1800, 0.025);
      break;
    case 'discover':
      sound.tink(p(tagOf(st.to) * 4 + 2), 0.2, 0.3 * S, 0.4);
      break;
    case 'skip':
    case 'keep':
      sound.tink(1320, 0.05, 0, 0.15);
      break;
    case 'dive':
      sound.hiss(0.35 * S, 900, 2600, 0.035);
      sound.tink(p(Math.min(30, tagOf(st.to))), 0.22, 0.4 * S, 0.5);
      break;
    case 'back':
      sound.hiss(0.3 * S, 2200, 700, 0.03);
      break;
    case 'extract':
      sound.hiss(0.8 * S, 300, 900, 0.05);
      sound.tink(p(Math.min(30, st.tau)), 0.3, 0.68 * S, 0.8);
      break;
    case 'improve':
      sound.tink(880, 0.18, 0.45 * S, 0.4);
      break;
    case 'found':
    case 'path':
      sound.tink(784, 0.2, 0.2 * S);
      sound.tink(988, 0.2, 0.45 * S);
      sound.chime(0.75 * S);
      break;
    case 'lift':
      sound.hiss(2.2 * S, 250, 1100, 0.07, 0.3 * S);
      sound.chime(0.95 * S);
      break;
    case 'unreachable':
      sound.thud(0, 90, 0.3);
      break;
    case 'done':
      sound.chime();
      break;
  }
}
