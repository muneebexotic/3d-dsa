// What each AVL step sounds like.

import { sound } from '../../core/sound';
import type { AvlStep } from './engine';

export function playStepSound(st: AvlStep, dur: number, speed: number): void {
  if (!sound.ready()) return;
  const v = st.visitor ? st.visitor.v : 0,
    S = dur / speed;
  switch (st.kind) {
    case 'start':
      sound.tink(sound.pitch(v), 0.25, 0, 0.6);
      break;
    case 'compare':
      if (st.cmp) sound.tink(sound.pitch(st.cmp.b), 0.4);
      break;
    case 'descend':
      sound.hiss(0.35, 2400, 900, 0.035);
      break;
    case 'place':
      if (st.placed != null) sound.tink(sound.pitch(st.snap.n[st.placed].v) / 2, 0.45, 0.4 * S, 0.5);
      sound.thud(0.4 * S, 140, 0.18);
      break;
    case 'update':
      if (st.co && Math.abs(st.co.bf) >= 2) sound.wobble();
      else sound.tink(1320, 0.07, 0, 0.25);
      break;
    case 'imbalance':
      sound.wobble();
      break;
    case 'rotate':
      sound.hiss(0.6 * S, 380, 1300, 0.09, 0.2 * S);
      sound.thud(0.82 * S, 150, 0.2);
      sound.tink(523, 0.22, 0.86 * S);
      sound.tink(659, 0.2, 0.92 * S);
      break;
    case 'found':
      sound.tink(988, 0.35);
      sound.tink(1319, 0.3, 0.09);
      break;
    case 'missing':
    case 'duplicate':
      sound.thud(0.45 * S, 100, 0.25);
      break;
    case 'remove':
    case 'replace':
    case 'clear':
      sound.hiss(0.5, 600, 2400, 0.05);
      break;
    case 'done':
      sound.chime();
      break;
  }
}
