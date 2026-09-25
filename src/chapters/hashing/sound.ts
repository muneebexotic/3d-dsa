// What each Hash Clock step sounds like. The hand ratchets once for every full
// turn it winds, the landing note is pitched by the bucket, and a rehash pours
// out as a run of notes, one per key.

import { sound } from '../../core/sound';
import type { Step } from './diagram';

/** The key a step is about, if it has one. */
function keyOf(st: Step): number {
  const it = st.focus ? st.diag.items.find(i => i.id === st.focus) : undefined;
  return it ? it.key : 0;
}

/** Clicks spread over a window, like a ratchet. */
function ratchet(turns: number, from: number, to: number): void {
  const n = Math.min(12, turns);
  for (let k = 0; k < n; k++) sound.tink(1500, 0.05, from + ((to - from) * k) / Math.max(1, n), 0.05);
}

export function playStepSound(st: Step, dur: number, speed: number): void {
  if (!sound.ready()) return;
  const S = dur / speed,
    m = st.diag.m;
  const bucketNote = sound.pitch(st.diag.hand, Math.max(1, m - 1));
  const keyNote = sound.pitch(keyOf(st), 99);
  const turns = Math.floor((st.wind ?? 0) / Math.max(1, m));
  switch (st.kind) {
    case 'hash':
      sound.thud(0.2 * S, 150, 0.1);
      ratchet(turns, 0.32 * S, 0.8 * S);
      sound.tink(bucketNote, 0.26, 0.9 * S, 0.6);
      break;
    case 'jump':
      sound.hiss(0.5 * S, 600, 2400, 0.05);
      sound.tink(bucketNote, 0.2, 0.7 * S, 0.4);
      break;
    case 'compare':
    case 'hop':
      sound.hiss(0.3 * S, 900, 2200, 0.025);
      sound.tink(keyNote, 0.14, 0.6 * S, 0.3);
      break;
    case 'link':
    case 'place':
      sound.tink(keyNote, 0.28, 0.4 * S, 0.6);
      sound.thud(0.45 * S, 150, 0.12);
      break;
    case 'found':
      sound.tink(keyNote, 0.3, 0.55 * S, 0.8);
      break;
    case 'missing':
    case 'refuse':
      sound.thud(0.1 * S, 95, 0.28);
      break;
    case 'unlink':
      sound.hiss(0.6 * S, 500, 1600, 0.05, 0.1 * S);
      sound.tink(880, 0.1, 0.8 * S, 0.3);
      break;
    case 'free':
    case 'tomb':
      sound.hiss(0.5 * S, 1800, 400, 0.05);
      sound.thud(0.7 * S, 90, 0.2);
      break;
    case 'full':
      sound.wobble();
      break;
    case 'grow':
    case 'lift':
      sound.hiss(0.9 * S, 250, 1200, 0.07);
      break;
    case 'rehash':
      sound.hiss(0.3 * S, 1200, 500, 0.04);
      ratchet(turns, 0.35 * S, 0.6 * S);
      sound.tink(bucketNote, 0.24, 0.95 * S, 0.5);
      break;
    case 'fountain': {
      const n = st.wave?.length ?? 0;
      for (let k = 0; k < n; k++)
        sound.tink(sound.pitch(k, Math.max(1, n - 1)), 0.14, ((k / Math.max(1, n - 1)) * 0.55 + 0.35) * S, 0.4);
      break;
    }
    case 'retire':
      sound.thud(0.4 * S, 110, 0.2);
      break;
    case 'put':
      sound.thud(0.15 * S, 150, 0.08);
      ratchet(turns, 0.2 * S, 0.44 * S);
      sound.tink(bucketNote, 0.22, 0.6 * S, 0.4);
      sound.thud(0.95 * S, 150, 0.1);
      break;
    case 'done':
      sound.chime(0.2 * S);
      break;
  }
}
