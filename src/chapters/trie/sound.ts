// What each Prefix Sunburst step sounds like. Every letter has a note, A lowest
// and Z highest, so a word is a little tune: following it plays the tune one note
// per step, words that share a beginning share the opening of their tune, and the
// words under a prefix play as a run of the ways it can go on.

import { sound } from '../../core/sound';
import type { Step } from './diagram';
import { slotOf } from './trie';

const note = (ch: string): number => sound.pitch(slotOf(ch), 25);

export function playStepSound(st: Step, prev: Step | null, dur: number, speed: number): void {
  if (!sound.ready()) return;
  const S = dur / speed;
  const f = st.fans[st.fans.length - 1],
    last = f.path[f.path.length - 1];
  switch (st.kind) {
    case 'walk':
    case 'keep':
      if (last) sound.tink(note(last), 0.2, 0.45 * S, 0.5);
      else sound.tink(440, 0.12, 0.4 * S, 0.4);
      break;
    case 'grow':
      sound.hiss(0.5 * S, 500, 1800, 0.035, 0.1 * S);
      if (last) sound.tink(note(last), 0.22, 0.65 * S, 0.6);
      break;
    case 'miss':
      sound.tink(f.miss ? note(f.miss.ch) : 330, 0.1, 0.3 * S, 0.2);
      sound.thud(0.55 * S, 100, 0.22);
      break;
    case 'found':
    case 'mark': {
      // the word's tune, then a bell
      const w = f.lit[0] ?? f.path;
      const step = Math.min(0.09, (0.5 * S) / Math.max(1, w.length));
      [...w].forEach((ch, k) => sound.tink(note(ch), 0.14, 0.15 * S + k * step, 0.45));
      sound.chime(0.2 * S + w.length * step);
      break;
    }
    case 'prefix':
      sound.tink(last ? note(last) : 440, 0.16, 0.3 * S, 0.5);
      sound.tink(196, 0.1, 0.55 * S, 0.5);
      break;
    case 'unmark':
      sound.tink(note(f.path[f.path.length - 1] ?? 'A') / 2, 0.14, 0.3 * S, 0.5);
      break;
    case 'prune':
      sound.hiss(0.45 * S, 1600, 500, 0.035, 0.25 * S);
      if (st.fans[0].doomed) sound.tink(note(st.fans[0].doomed.slice(-1)) / 2, 0.12, 0.2 * S, 0.3);
      break;
    case 'spell': {
      sound.hiss(0.8 * S, 300, 1200, 0.03);
      const before = new Set(prev ? (prev.fans[0].lit ?? []) : []);
      st.fans[0].lit
        .filter(w => !before.has(w))
        .slice(0, 4)
        .forEach((w, k) => sound.tink(note(w[0]), 0.14, (0.6 + 0.1 * k) * S, 0.5));
      break;
    }
    case 'suggest':
      f.lit.slice(0, 6).forEach((w, k) => sound.tink(note(w[w.length - 1]), 0.12, (0.2 + 0.1 * k) * S, 0.5));
      sound.chime(0.9 * S);
      break;
    case 'zip': {
      // the letters this ring shares, as a chord that rolls from A to Z
      const ring = f.zip ?? 99;
      const letters = [
        ...new Set(f.dict.words.filter(w => w.length >= Math.min(ring, 7)).map(w => w[Math.min(ring, w.length) - 1])),
      ].slice(0, 8);
      letters.forEach((ch, k) => sound.tink(note(ch), 0.08, (0.55 + 0.06 * k) * S, 0.6));
      if (f.zip == null) sound.chime(0.9 * S);
      break;
    }
    default:
      break;
  }
}
