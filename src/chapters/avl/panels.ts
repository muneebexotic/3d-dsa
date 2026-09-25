// The AVL page's inspector card and legend.

import { glyphSVG, numeralHeight } from '../../core/glyphs';
import { fmtBf, type Snap } from './engine';
import { R, STEM, subtreeIds } from './layout';
import { stateOf, type DiscState } from './poses';
import { tiltFor } from './scene';

const FILL_HEX: Readonly<Record<Exclude<DiscState, 'cobalt'>, string>> = {
  ink: '#1B1A17',
  yellow: '#E8A817',
  red: '#D1361E',
};
const RIM_HEX: Readonly<Record<Exclude<DiscState, 'cobalt'>, string>> = {
  ink: '#000',
  yellow: '#C48A0A',
  red: '#A82812',
};
const NUM_HEX: Readonly<Record<Exclude<DiscState, 'cobalt'>, string>> = {
  ink: '#EFE8DA',
  yellow: '#1B1A17',
  red: '#FFF6EA',
};

export interface InspectorView {
  disc: string;
  state: string;
  height: string;
  balance: string;
  size: string;
  depth: string;
  note: string;
}

/** What the inspector shows for node id in this snapshot, or null if it is gone. */
export function inspect(snap: Snap, id: number): InspectorView | null {
  const o = snap.n[id];
  if (!o) return null;
  let depth = 0,
    c = snap.root;
  while (c != null && c !== id) {
    const k = snap.n[c];
    c = o.v < k.v ? k.l : k.r;
    depth++;
  }
  const size = subtreeIds(snap, id).size;
  const hl = o.l != null ? snap.n[o.l].h : 0,
    hr = o.r != null ? snap.n[o.r].h : 0;
  const st = stateOf(o.bf) as Exclude<DiscState, 'cobalt'>;
  const disc = `<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${FILL_HEX[st]}" stroke="${RIM_HEX[st]}" stroke-width="1.2"/>${glyphSVG(o.v, 32, 32, numeralHeight(o.v) * 60, NUM_HEX[st], 14)}</svg>`;
  const label =
    o.bf === 0
      ? ['Level', 'both sides equally tall']
      : Math.abs(o.bf) === 1
        ? [`Leaning ${o.bf > 0 ? 'left' : 'right'}`, 'allowed, within ±1']
        : ['Out of balance', 'must rotate'];
  const fresh = o.h === 1 + Math.max(hl, hr) && o.bf === hl - hr;
  return {
    disc,
    state: `<b>${o.v} · ${label[0]}</b><span>${label[1]}</span>`,
    height: String(o.h),
    balance: fmtBf(o.bf),
    size: String(size),
    depth: String(depth),
    note: fresh
      ? `Left height ${hl}, right height ${hr}, so balance is ${hl} − ${hr} = ${fmtBf(hl - hr)}.`
      : `Not updated yet: the walk back up has not reached ${o.v}. Its children now say ${hl} − ${hr} = ${fmtBf(hl - hr)}.`,
  };
}

/** A small drawing of a disc on its arm, tilted by its balance. */
function legendRig(st: Exclude<DiscState, 'cobalt'>, bf: number, label: string, sub: string, small: boolean): string {
  const fill = FILL_HEX[st];
  const phi = tiltFor(bf, 1.02),
    s = 26,
    cx = 32,
    cy = 16;
  const py = cy + (R + STEM) * s,
    dy = 1.02 * s * Math.tan(phi);
  return `<div class="lg"><svg width="${small ? 32 : 64}" height="${small ? 28 : 56}" viewBox="0 0 64 56" aria-hidden="true">
<line x1="${cx}" y1="${cy + R * s}" x2="${cx}" y2="${py}" stroke="#1B1A17" stroke-width="1"/>
<line x1="${cx - 1.02 * s}" y1="${py + dy}" x2="${cx + 1.02 * s}" y2="${py - dy}" stroke="#1B1A17" stroke-width="1.6" stroke-linecap="round"/>
<line x1="${cx - 1.02 * s}" y1="${py + dy}" x2="${cx - 1.02 * s}" y2="54" stroke="#1B1A17" stroke-width="1"/>
<line x1="${cx + 1.02 * s}" y1="${py - dy}" x2="${cx + 1.02 * s}" y2="54" stroke="#1B1A17" stroke-width="1"/>
<circle cx="${cx}" cy="${cy}" r="${R * s}" fill="${fill}"/></svg><div><b>${label}</b><span>${sub}</span></div></div>`;
}

export function legendHTML(small: boolean): string {
  return (
    legendRig('ink', 0, small ? 'Level 0' : 'Level', 'balance 0', small) +
    legendRig('yellow', -1, small ? 'Leaning ±1' : 'Leaning', 'balance ±1 · allowed', small) +
    legendRig('red', -2, small ? 'Must rotate ±2' : 'Must rotate', 'balance ±2', small) +
    `<div class="lg"><svg width="${small ? 30 : 64}" height="24" viewBox="0 0 ${small ? 30 : 64} 24" aria-hidden="true"><line x1="${small ? 3 : 10}" y1="12" x2="${small ? 20 : 52}" y2="12" stroke="#2346A8" stroke-width="2.4" stroke-linecap="round"/><circle cx="${small ? 22 : 54}" cy="12" r="${small ? 5 : 6}" fill="#2346A8"/></svg><div><b>Path</b><span>the value in hand and its wires</span></div></div>`
  );
}
