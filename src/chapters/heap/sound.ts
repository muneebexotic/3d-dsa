// What each Heap Pyramid step sounds like. A key's note is pitched by the row it
// reaches, higher toward the top: a climb rises through the scale and a sink falls
// through it. The top coming off rings like a bell.

import { sound } from '../../core/sound';
import type { Step } from './diagram';
import { rowOf } from './heap';

/** A note for a slot: the top row highest. */
const rowNote = (slot: number): number => sound.pitch(Math.max(0, 5 - rowOf(Math.max(0, slot))), 5);

export function playStepSound(st: Step, dur: number, speed: number): void {
  if (!sound.ready()) return;
  const S = dur / speed;
  const path = st.path ?? [];
  switch (st.kind) {
    case 'arcs':
      for (let k = 0; k < 6; k++) sound.tink(sound.pitch(k, 6), 0.12, (0.1 + 0.12 * k) * S, 0.4);
      break;
    case 'fold':
      sound.hiss(0.8 * S, 300, 1400, 0.06);
      sound.chime(0.9 * S);
      break;
    case 'append':
      sound.thud(0.45 * S, 150, 0.12);
      sound.tink(rowNote(st.from ?? 0), 0.22, 0.5 * S, 0.5);
      break;
    case 'up':
    case 'down':
      sound.tink(rowNote(st.from ?? 0), 0.12, 0.3 * S, 0.25);
      break;
    case 'swap':
      sound.hiss(0.5 * S, 700, 2000, 0.03);
      sound.tink(rowNote(st.from ?? 0), 0.2, 0.8 * S, 0.45);
      break;
    case 'stay':
      sound.tink(rowNote(st.from ?? 0), 0.26, 0.4 * S, 0.7);
      break;
    case 'take':
      sound.chime(0.25 * S);
      break;
    case 'last':
      sound.hiss(0.6 * S, 400, 1800, 0.05, 0.1 * S);
      sound.thud(0.85 * S, 140, 0.12);
      break;
    case 'push':
    case 'relower':
      sound.thud(0.25 * S, 150, 0.08);
      path.forEach((slot, k) =>
        sound.tink(rowNote(slot), 0.16, (0.32 + (0.63 * k) / Math.max(1, path.length)) * S, 0.35),
      );
      break;
    case 'pop':
      sound.tink(1320, 0.14, 0.15 * S, 0.5);
      path.forEach((slot, k) =>
        sound.tink(rowNote(slot), 0.14, (0.55 + (0.4 * k) / Math.max(1, path.length)) * S, 0.3),
      );
      break;
    case 'scatter':
      sound.hiss(0.9 * S, 250, 1200, 0.06);
      for (let k = 0; k < 8; k++) sound.tink(sound.pitch((k * 5) % 9, 9), 0.08, (0.35 + 0.06 * k) * S, 0.3);
      break;
    case 'leaves':
      sound.tink(sound.pitch(1, 5), 0.16, 0.2 * S, 0.8);
      sound.tink(sound.pitch(3, 5), 0.12, 0.35 * S, 0.8);
      break;
    case 'keep':
    case 'full':
    case 'empty':
      sound.thud(0.1 * S, 95, 0.25);
      break;
    case 'done':
      sound.chime(0.2 * S);
      break;
    default:
      break;
  }
}
