// What each Pointer Chain step sounds like. Values set the pitch, so pushing 1 to 5
// plays a rising phrase, and popping them plays it back falling: you hear LIFO.

import { sound } from '../../core/sound';
import type { Step } from './diagram';

/** The value on the disc a step is about, if it has one. */
function valueOf(st: Step): number {
  const it = st.focus ? st.diag.items.find(i => i.id === st.focus) : undefined;
  const n = it ? parseInt(it.label, 10) : NaN;
  if (!Number.isNaN(n)) return n;
  return it ? (it.label.charCodeAt(0) - 64) * 3 : 0;
}

export function playStepSound(st: Step, dur: number, speed: number): void {
  if (!sound.ready()) return;
  const v = valueOf(st),
    S = dur / speed;
  // small values each get their own note, so 1 to 5 is a clear rising phrase
  const p = v <= 14 ? sound.pitch(v, 14) : sound.pitch(Math.min(99, v), 99);
  switch (st.kind) {
    case 'start':
    case 'save':
      sound.tink(660, 0.12, 0, 0.3);
      break;
    case 'hop':
    case 'scan':
      sound.hiss(0.35 * S, 900, 2400, 0.03);
      sound.tink(p, 0.18, 0.7 * S, 0.35);
      break;
    case 'alloc':
    case 'write':
    case 'put':
      sound.tink(p, 0.3, 0.45 * S, 0.6);
      sound.thud(0.5 * S, 150, 0.12);
      break;
    case 'link':
    case 'swing':
    case 'swap':
      sound.hiss(0.6 * S, 500, 1600, 0.06, 0.1 * S);
      sound.tink(880, 0.14, 0.8 * S, 0.4);
      break;
    case 'move':
    case 'advance':
      sound.tink(990, 0.08, 0.3 * S, 0.25);
      break;
    case 'free':
    case 'lift':
    case 'skip':
      sound.hiss(0.5 * S, 1800, 400, 0.05);
      sound.thud(0.75 * S, 90, 0.2);
      break;
    case 'jump':
      sound.hiss(0.5 * S, 600, 2600, 0.05);
      sound.tink(p, 0.3, 0.75 * S, 0.6);
      break;
    case 'shift':
    case 'copy':
      sound.tink(p, 0.1, 0.4 * S, 0.2);
      break;
    case 'read':
    case 'found':
      sound.tink(p, 0.3, 0.1 * S, 0.7);
      break;
    case 'out':
    case 'take':
      sound.tink(p, 0.32, 0.6 * S, 0.8);
      break;
    case 'grow':
      sound.hiss(0.8 * S, 300, 900, 0.06);
      break;
    case 'retire':
      sound.thud(0.5 * S, 110, 0.2);
      break;
    case 'turn':
      sound.hiss(1.6 * S, 300, 1100, 0.07, 0.1 * S);
      sound.chime(1.7 * S);
      break;
    case 'missing':
    case 'empty':
    case 'overflow':
    case 'underflow':
      sound.thud(0, 95, 0.28);
      break;
    case 'tidy':
    case 'done':
      sound.chime(0.2 * S);
      break;
  }
}
