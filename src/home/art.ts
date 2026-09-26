// The landing page's drawings: a small AVL mobile that sways, a net that lifts
// off its plinth in order of distance, a chain whose pointers turn round, a clock
// whose hand winds a key round to its bucket, a key climbing a heap's pyramid, a
// loom weaving a sort, and a sunburst of words opening round a word being typed.
// Plain SVG, drawn in code.

import { hexOf, dye, shade } from '../chapters/sorting/palette';
import { SORTS, runSort, type Run } from '../chapters/sorting/sorts';
import { threadsOf } from '../chapters/sorting/threads';
import { RINGS, ringR } from '../chapters/trie/layout';
import { layoutOf } from '../chapters/trie/poses';
import { dictOf, shapeOf } from '../chapters/trie/trie';
import { glyphSVG, glyphWidth } from '../core/glyphs';
import { REDUCED } from '../core/prefs';

const INK = '#1B1A17',
  PAPER = '#F8F5EE',
  LIGHT = '#EFE8DA',
  YELLOW = '#E8A817',
  COBALT = '#2346A8',
  RED = '#D1361E',
  GRAPHITE = '#57524A',
  FAINT = '#8C857A';

function disc(x: number, y: number, r: number, fill: string, label: string, glyph: string): string {
  const h = r * (label.length > 2 ? 0.62 : label.length > 1 ? 0.78 : 0.95);
  const stroke = fill === PAPER ? ` stroke="${INK}" stroke-width="1.5"` : '';
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${stroke}/>${glyphSVG(label, x, y, h, glyph, 14)}`;
}

/* ---------------- No. 1: a small AVL mobile that sways ---------------- */

interface MobileNode {
  v: number;
  x: number;
  fill: string;
  kids?: MobileNode[];
}

export function drawMobile(svg: SVGSVGElement, { s = 1.15, cx = 160, top = 10, still = false } = {}): void {
  const R = 17 * s,
    WIRE = 26 * s;
  function node(v: number, x: number, y: number, fill: string, kids: MobileNode[], depth: number): string {
    const glyph = fill === YELLOW ? INK : LIGHT,
      hook = y - R - WIRE;
    let g = `<g class="${still ? '' : 'sway'}" style="transform-origin:${x}px ${hook}px;--d:${5 + depth * 1.3 + (v % 3) * 0.7}s;--a:${2.2 - depth * 0.6}deg">`;
    g += `<line x1="${x}" y1="${hook}" x2="${x}" y2="${y - R}" stroke="${INK}" stroke-width="1"/>`;
    if (kids.length) {
      const ay = y + R + 9 * s,
        tilt = fill === YELLOW ? 4 * s : 0; // a leaning node dips toward its taller side
      g += `<line x1="${x}" y1="${y + R}" x2="${x}" y2="${ay}" stroke="${INK}" stroke-width="1"/>`;
      g += `<line x1="${kids[0].x}" y1="${ay + tilt}" x2="${kids[1].x}" y2="${ay - tilt}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
      kids.forEach((k, i) => {
        g += node(k.v, k.x, ay + (i ? -tilt : tilt) + WIRE + R, k.fill, k.kids || [], depth + 1);
      });
    }
    g += `<circle cx="${x}" cy="${y}" r="${R}" fill="${fill}"/>${glyphSVG(String(v), x, y, R * 0.78, glyph, 14)}`;
    return g + '</g>';
  }
  const d1 = 72 * s,
    d2 = 36 * s;
  const kids: MobileNode[] = [
    {
      v: 20,
      x: cx - d1,
      fill: INK,
      kids: [
        { v: 11, x: cx - d1 - d2, fill: INK },
        { v: 29, x: cx - d1 + d2, fill: INK },
      ],
    },
    {
      v: 65,
      x: cx + d1,
      fill: YELLOW,
      kids: [
        { v: 50, x: cx + d1 - d2, fill: INK },
        { v: 91, x: cx + d1 + d2, fill: INK },
      ],
    },
  ];
  svg.innerHTML =
    `<circle cx="${cx}" cy="${top}" r="${3 * s}" fill="none" stroke="${INK}" stroke-width="1.2"/>` +
    node(41, cx, top + WIRE + R, INK, kids, 0);
}

/* ---------------- No. 2: a net that lifts off its plinth in order of distance ---------------- */

/** The textbook graph: [x, z, distance from A]. */
const NET = {
  nodes: {
    A: [-5.3, 0.2, 0],
    B: [-1.9, -2.0, 3],
    C: [-3.6, 2.2, 2],
    D: [-0.2, 0.4, 8],
    E: [0.8, 2.8, 10],
    F: [2.2, -2.0, 14],
    G: [3.4, 1.5, 13],
    H: [5.4, -0.1, 18],
  } as Record<string, [number, number, number]>,
  edges: [
    ['A', 'B', 4],
    ['A', 'C', 2],
    ['C', 'B', 1],
    ['B', 'D', 5],
    ['C', 'D', 8],
    ['C', 'E', 10],
    ['D', 'E', 2],
    ['D', 'F', 6],
    ['E', 'G', 3],
    ['F', 'G', 1],
    ['F', 'H', 4],
    ['G', 'H', 7],
    ['D', 'G', 9],
  ] as [string, string, number][],
  parent: { C: 'A', B: 'C', D: 'B', E: 'D', F: 'D', G: 'E', H: 'F' } as Record<string, string>,
  path: ['A', 'C', 'B', 'D', 'F', 'H'],
};

export function drawNet(svg: SVGSVGElement, { W = 320, H = 300, still = false, small = false } = {}): void {
  // plinth corners (front-left, front-right, back-right, back-left) in screen space
  const PW = Math.min(W - 40, 350),
    x0 = (W - PW) / 2 - 8;
  const FL = [x0, H - 44],
    FR = [x0 + PW, H - 44],
    BR = [x0 + PW + 24, H - 92],
    BL = [x0 + 26, H - 92];
  const at = (x: number, z: number): [number, number] => {
    const u = (x + 6.2) / 12.4,
      v = (z + 2.8) / 6.2;
    const bx = BL[0] + (BR[0] - BL[0]) * u,
      by = BL[1];
    const fx = FL[0] + (FR[0] - FL[0]) * u,
      fy = FL[1];
    return [bx + (fx - bx) * v, by + (fy - by) * v];
  };
  const T = 18,
    R = small ? 9 : 11,
    CLEAR = 6,
    S = (BL[1] - 2.6 * R - 20 - CLEAR) / T;
  const ids = Object.keys(NET.nodes);
  svg.innerHTML = `<polygon points="${FL} ${FR} ${FR[0]},${FR[1] + 12} ${FL[0]},${FL[1] + 12}" fill="#E4DDCF"/><polygon points="${FR} ${BR} ${BR[0]},${BR[1] + 12} ${FR[0]},${FR[1] + 12}" fill="#D9D1C1"/>
    <polygon points="${FL} ${FR} ${BR} ${BL}" fill="#F7F3EB" stroke="rgba(27,26,23,.1)"/><g data-part="edges"></g><g data-part="socks"></g><line data-part="wire" stroke="${INK}" stroke-width="1.2"/><g data-part="knots"></g>`;
  const part = <T extends Element>(name: string) => svg.querySelector(`[data-part="${name}"]`) as T;
  const eG = part<SVGGElement>('edges'),
    kG = part<SVGGElement>('knots'),
    sG = part<SVGGElement>('socks'),
    wire = part<SVGLineElement>('wire');
  const pathSet = new Set(NET.path.slice(1).map((n, i) => NET.path[i] + n));

  function draw(tau: number, showPath: boolean): void {
    const P: Record<string, { x: number; y: number; by: number; lifted: boolean; d: number }> = {};
    for (const id of ids) {
      const [x, z, d] = NET.nodes[id],
        [bx, by] = at(x, z);
      const over = tau - d,
        lift = over < 0 ? 0 : CLEAR * Math.min(1, over / 0.6) + over * S;
      P[id] = { x: bx, y: by - lift, by, lifted: over >= 0, d };
    }
    let e = '',
      socks = '';
    for (const [a, b, w] of NET.edges) {
      const A = P[a],
        B = P[b];
      const tree = NET.parent[b] === a || NET.parent[a] === b;
      const onPath = showPath && (pathSet.has(a + b) || pathSet.has(b + a));
      const hi = Math.max(A.by, B.by);
      const slack = A.lifted || B.lifted ? Math.max(0, w * S - Math.abs(A.y - B.y)) : 0;
      const sag = Math.min(40, slack * 0.34);
      const mx = (A.x + B.x) / 2,
        my = Math.min((A.y + B.y) / 2 + sag * 2, hi);
      const taut = tree && A.lifted && B.lifted;
      const col = onPath ? COBALT : taut ? INK : 'rgba(87,82,74,.7)';
      e += `<path d="M${A.x.toFixed(1)} ${A.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${onPath ? 2.6 : taut ? 1.6 : 1}"/>`;
    }
    let k = '';
    for (const id of ids.slice().sort((a, b) => P[a].y - P[b].y)) {
      const p = P[id];
      if (p.y < p.by - 1)
        socks += `<ellipse cx="${p.x}" cy="${p.by}" rx="${R * 0.7}" ry="${R * 0.3}" fill="none" stroke="rgba(27,26,23,.35)" stroke-dasharray="2.5 2.5"/>`;
      const waiting = !p.lifted && NET.edges.some(([a, b]) => (a === id && P[b].lifted) || (b === id && P[a].lifted));
      const fill = p.lifted ? (tau - p.d < 1.2 && p.d > 0 && tau < T ? COBALT : INK) : waiting ? YELLOW : PAPER;
      const glyph = fill === INK ? LIGHT : fill === COBALT ? '#fff' : INK;
      const cy = p.y - R - 5;
      k += `<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${cy + R}" stroke="${INK}" stroke-width="1.2"/><circle cx="${p.x}" cy="${p.y}" r="2" fill="${INK}"/>`;
      k += disc(p.x, cy, R, fill, id, glyph);
      if (id === 'H')
        k += `<circle cx="${p.x}" cy="${cy}" r="${R + 4}" fill="none" stroke="${RED}" stroke-width="1.6"${showPath ? '' : ' stroke-dasharray="3 2.5"'}/>`;
      if (id === 'A') {
        wire.setAttribute('x1', String(p.x));
        wire.setAttribute('x2', String(p.x));
        wire.setAttribute('y1', String(cy - R));
        wire.setAttribute('y2', '0');
      }
    }
    eG.innerHTML = e;
    kG.innerHTML = k;
    sG.innerHTML = socks;
    wire.style.opacity = tau > 0.05 ? '1' : '0';
  }

  if (still || REDUCED) {
    draw(T, true);
    return;
  }
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const cycle = 12;
  let visible = true;
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
  }).observe(svg);
  const frame = (now: number) => {
    if (visible) {
      const t = (now / 1000) % cycle;
      const tau = t < 1.2 ? 0 : t < 7.2 ? T * ease((t - 1.2) / 6) : t < 10 ? T : T * (1 - ease((t - 10) / 2));
      draw(tau, t > 7.2 && t < 10);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ---------------- No. 3: a chain whose pointers turn round, one by one ---------------- */

const CHAIN = ['4', '8', '15', '16', '23', '42'];

/**
 * A singly linked list being reversed. `phase` runs 0 → 1: each pointer swings up
 * over its node from the next node to the previous one, while PREV, CUR and NEXT
 * walk along; at 1 HEAD and TAIL have swapped ends.
 */
export function drawChain(svg: SVGSVGElement, { W = 640, H = 220, still = false, phase = 0.55 } = {}): void {
  const n = CHAIN.length,
    pad = W * 0.1,
    gap = (W - 2 * pad) / (n - 1),
    R = Math.min(17, gap * 0.2),
    cy = H * 0.52,
    knobY = cy - R - 3;
  const x = (i: number) => pad + i * gap;
  const ground = (gx: number, gy: number, col: string) =>
    `<path d="M${gx} ${gy} V${gy + 7} M${gx - 8} ${gy + 7} H${gx + 8} M${gx - 5} ${gy + 11} H${gx + 5} M${gx - 2} ${gy + 15} H${gx + 2}" stroke="${col}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
  const tag = (tx: number, ty: number, label: string, cobalt: boolean) => {
    const w = label.length * 9 + 14;
    return `<rect x="${tx - w / 2}" y="${ty - 9}" width="${w}" height="18" rx="9" fill="${cobalt ? COBALT : PAPER}" stroke="${cobalt ? COBALT : INK}" stroke-width="1.2"/>${glyphSVG(label, tx, ty, 8.5, cobalt ? '#fff' : INK, 16)}`;
  };
  /** The pointer from node i, turned by a (0: to the next node, 1: to the previous one or null). */
  const pointer = (i: number, a: number) => {
    const ox = x(i),
      oy = knobY;
    const toNext = i < n - 1 ? gap : gap * 0.55,
      toPrev = i > 0 ? gap : gap * 0.55;
    const th = Math.PI * a,
      len = (toNext * (1 - a) + toPrev * a) * (1 - 0.25 * Math.sin(th));
    const ex = ox + Math.cos(th) * len,
      ey = oy - Math.sin(th) * len * 0.8 + (a > 0.5 && i === 0 ? 14 * (a - 0.5) : 0);
    const mx = (ox + ex) / 2,
      my = (oy + ey) / 2;
    const dx = ex - ox,
      dy = ey - oy,
      d = Math.hypot(dx, dy) || 1,
      bow = Math.min(34, 0.3 * d);
    const cx = mx + (dy / d) * bow * (dx >= 0 ? 1 : -1),
      cyy = my - Math.abs(dx / d) * bow;
    const hot = a > 0.02 && a < 0.98;
    const col = hot ? COBALT : INK;
    const toNull = (a < 0.5 && i === n - 1) || (a >= 0.5 && i === 0);
    let out = `<path d="M${ox} ${oy} Q${cx.toFixed(1)} ${cyy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${hot ? 2.4 : 1.6}"/>`;
    if (toNull && !hot) out += ground(ex, ey, INK);
    else {
      const ang = Math.atan2(ey - cyy, ex - cx);
      const ax = ex - Math.cos(ang) * 2,
        ay = ey - Math.sin(ang) * 2;
      const p = (s: number, t: number) =>
        `${(ax + Math.cos(ang + s) * t).toFixed(1)},${(ay + Math.sin(ang + s) * t).toFixed(1)}`;
      if (!toNull)
        out += `<polygon points="${ax.toFixed(1)},${ay.toFixed(1)} ${p(Math.PI - 0.45, 9)} ${p(Math.PI + 0.45, 9)}" fill="${col}"/>`;
    }
    return out + `<circle cx="${ox}" cy="${oy}" r="3" fill="${INK}"/>`;
  };
  function draw(ph: number): void {
    // ph in [0, 1]: n swings, then HEAD and TAIL change ends
    const per = 0.85 / n;
    let g = `<path d="M${pad - 50} ${cy + R + 34} L${W - pad + 50} ${cy + R + 34} L${W - pad + 28} ${cy + R + 10} L${pad - 28} ${cy + R + 10} Z" fill="#F7F3EB" stroke="rgba(27,26,23,.1)"/>`;
    let cur = n;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, Math.min(1, (ph - i * per) / (per * 0.8)));
      const e = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2;
      g += pointer(i, e);
      if (cur === n && a < 1) cur = i;
    }
    const done = ph > 0.88;
    for (let i = 0; i < n; i++) {
      const px = x(i),
        inHand = i === cur && !done;
      g += `<line x1="${px}" y1="${cy + R}" x2="${px}" y2="${cy + R + 22}" stroke="${INK}" stroke-width="1.2"/><circle cx="${px}" cy="${cy + R + 22}" r="2.2" fill="${INK}"/>`;
      g += disc(px, cy, R, inHand ? COBALT : INK, CHAIN[i], inHand ? '#fff' : LIGHT);
    }
    const ty = cy + R + 48;
    const headAt = done ? n - 1 : 0,
      tailAt = done ? 0 : n - 1;
    g += tag(x(headAt), ty, 'HEAD', false) + tag(x(tailAt), ty, 'TAIL', false);
    if (!done && cur < n) {
      g += tag(x(cur) + (cur === 0 ? 34 : 0), ty + 24, 'CUR', true);
      if (cur > 0) g += tag(x(cur - 1), ty + 24, 'PREV', true);
      if (cur < n - 1) g += tag(x(cur + 1), ty + 24, 'NEXT', true);
    }
    svg.innerHTML = g;
  }
  if (still || REDUCED) {
    draw(phase);
    return;
  }
  const cycle = 14;
  let visible = true;
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
  }).observe(svg);
  const frame = (now: number) => {
    if (visible) {
      const t = (now / 1000) % cycle;
      // rest, turn every pointer, hold, then fade back to the start
      draw(t < 1.5 ? 0 : t < 10.5 ? (t - 1.5) / 9 : 1);
      svg.style.opacity =
        t > 13.2 ? String(Math.max(0.15, 1 - (t - 13.2) * 1.2)) : t < 0.6 ? String(0.15 + t * 1.4) : '1';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ---------------- No. 4: a key winds round the clock to its bucket ---------------- */

/** The opening table of Hash Clock: bucket → keys, bottom of the chain first. */
const CLOCK: Readonly<Record<number, readonly string[]>> = { 1: ['25', '33'], 3: ['59'], 4: ['12'], 6: ['46', '70'] };

/**
 * A hash table as a clock of eight buckets, seen from above and in front. `phase`
 * runs 0 → 1: 41 drops onto the hub, the hand winds 41 hours (five turns and one
 * more), and 41 flies out to the top of bucket 1's chain.
 */
export function drawClock(svg: SVGSVGElement, { W = 640, H = 200, still = false, phase = 1 } = {}): void {
  const cx = W / 2,
    cy = H * 0.66,
    RX = Math.min(W * (W < 400 ? 0.37 : 0.34), H * 0.95),
    RY = RX * 0.27,
    R = Math.min(15, RX * 0.085),
    step = R * 2.05;
  const at = (i: number, k = 1) => {
    const a = (i / 8) * Math.PI * 2;
    return { x: cx + RX * k * Math.sin(a), y: cy - RY * k * Math.cos(a) };
  };
  const wire = (x: number, y0: number, y1: number, col: string) =>
    `<path d="M${x + R * 0.95} ${y0} Q${x + R * 1.9} ${(y0 + y1) / 2} ${x + R * 0.95} ${y1 + 3}" fill="none" stroke="${col}" stroke-width="1.4"/><circle cx="${x + R * 0.95}" cy="${y0}" r="2" fill="${INK}"/>`;
  function draw(ph: number): void {
    const drop = Math.min(1, ph / 0.12),
      wind = Math.max(0, Math.min(1, (ph - 0.14) / 0.56)),
      fly = Math.max(0, Math.min(1, (ph - 0.74) / 0.22));
    const e = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let g = `<ellipse cx="${cx}" cy="${cy + 6}" rx="${RX + 34}" ry="${RY + 8}" fill="#E9E2D5"/><ellipse cx="${cx}" cy="${cy}" rx="${RX + 34}" ry="${RY + 8}" fill="#F7F3EB" stroke="rgba(27,26,23,.12)"/>`;
    // spokes and hours
    for (let i = 0; i < 8; i++) {
      const p = at(i, 0.62),
        q = at(i, 0.26);
      g += `<line x1="${q.x}" y1="${q.y}" x2="${p.x}" y2="${p.y}" stroke="#D3CABA" stroke-width="1"/>`;
      const n = at(i, 0.76);
      g += glyphSVG(String(i), n.x, n.y, 8, GRAPHITE, 15);
    }
    // the hub and its hand: 41 hours is five full turns and one more
    const turns = e(wind) * 41,
      ha = (turns / 8) * Math.PI * 2,
      hub = { x: cx, y: cy - 4 };
    g += `<ellipse cx="${cx}" cy="${cy + 2}" rx="${RX * 0.23}" ry="${RY * 0.23 + 3}" fill="#E5DED1"/><ellipse cx="${hub.x}" cy="${hub.y}" rx="${RX * 0.23}" ry="${RY * 0.23}" fill="#EFE9DD" stroke="${INK}" stroke-width="1"/>`;
    const hx = hub.x + RX * 0.42 * Math.sin(ha),
      hy = hub.y - RY * 0.42 * Math.cos(ha);
    g += `<line x1="${hub.x}" y1="${hub.y}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><circle cx="${hub.x}" cy="${hub.y}" r="3.2" fill="${INK}"/>`;
    // buckets and their chains, back to front
    const order = [0, 7, 1, 6, 2, 5, 3, 4];
    for (const i of order) {
      const p = at(i);
      const keys = [...(CLOCK[i] ?? [])];
      const landed = i === 1 && fly >= 1;
      if (landed) keys.push('41');
      g += `<rect x="${p.x - 17}" y="${p.y - 6}" width="34" height="12" rx="3" fill="${keys.length ? PAPER : '#E3DCCF'}" stroke="rgba(27,26,23,.18)"/>`;
      keys.forEach((k, j) => {
        const y = p.y - 14 - j * step;
        g += wire(p.x, j === 0 ? p.y - 2 : y + step - R * 0.3, y + R * 0.3, INK);
        const fresh = landed && k === '41';
        g += disc(p.x, y, R, fresh ? YELLOW : INK, k, fresh ? INK : LIGHT);
      });
    }
    // the key on its way
    if (ph > 0 && fly < 1) {
      const top = at(1),
        tx = top.x,
        ty = top.y - 14 - 2 * step;
      const u = e(fly),
        y0 = hub.y - 26 - (1 - drop) * 30;
      const x = hub.x + (tx - hub.x) * u,
        y = y0 + (ty - y0) * u - Math.sin(Math.PI * u) * 34;
      g += `<g opacity="${Math.min(1, drop * 1.5).toFixed(2)}">${fly === 0 ? `<line x1="${hub.x}" y1="${hub.y}" x2="${hub.x}" y2="${y0 + R}" stroke="${INK}" stroke-width="1.2"/>` : ''}${disc(x, y, R, YELLOW, '41', INK)}</g>`;
    }
    svg.innerHTML = g;
  }
  if (still || REDUCED) {
    draw(phase);
    return;
  }
  const cycle = 9;
  let visible = true;
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
  }).observe(svg);
  const frame = (now: number) => {
    if (visible) {
      const t = (now / 1000) % cycle;
      // rest, drop, wind, fly, hold, then fade back to the start
      draw(t < 1 ? 0 : t < 6 ? (t - 1) / 5 : 1);
      svg.style.opacity = t > 8 ? String(Math.max(0.15, 1 - (t - 8) * 1.2)) : t < 0.6 ? String(0.15 + t * 1.4) : '1';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ---------------- No. 5: a key climbs the pyramid, and the array swaps with it ---------------- */

/** The opening heap of Heap Pyramid, slot by slot. */
const PYRAMID = [4, 17, 9, 23, 18, 12, 31, 40, 26, 21];

/**
 * A heap as a pyramid standing over its array. `phase` runs 0 → 1: 5 drops into the
 * next free slot (10), its wire to 18 turns red, and it climbs two rows, swapping
 * first with 18 and then with 17, while the same two cells swap in the array below.
 */
export function drawPyramid(svg: SVGSVGElement, { W = 640, H = 200, still = false, phase = 1 } = {}): void {
  const cx = W / 2,
    top = 22,
    pitch = (H - 82) / 3,
    leafW = Math.min(310, W * 0.62, W - 60);
  const cp = Math.min(27, (W - 24) / 15),
    ay = H - 30;
  const R = Math.min(11, pitch * 0.3, leafW / 16 - 1.5),
    r = Math.min(R * 0.72, cp * 0.38);
  const node = (i: number) => {
    const row = Math.floor(Math.log2(i + 1)),
      j = i - (2 ** row - 1);
    return { x: cx - leafW / 2 + ((j + 0.5) * leafW) / 2 ** row, y: top + row * pitch };
  };
  const cell = (i: number) => ({ x: cx + (i - 7) * cp, y: ay });
  const e = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  // the two swaps: 5 climbs from slot 10 to 4, then from 4 to 1
  const MOVES = [
    { up: 10, to: 4, t0: 0.26, t1: 0.46 },
    { up: 4, to: 1, t0: 0.56, t1: 0.76 },
  ];
  function draw(ph: number): void {
    const drop = seg(ph, 0.02, 0.14);
    const slots = [...PYRAMID.map(String), '5'];
    const moving = new Map<string, { a: number; b: number; u: number; up: boolean }>();
    for (const m of MOVES) {
      const u = e(seg(ph, m.t0, m.t1));
      if (u <= 0) continue;
      const a = slots[m.up],
        b = slots[m.to];
      if (u < 1) {
        moving.set(a, { a: m.up, b: m.to, u, up: true });
        moving.set(b, { a: m.to, b: m.up, u, up: false });
      }
      slots[m.up] = b;
      slots[m.to] = a;
    }
    const at = (k: string, i: number, f: (j: number) => { x: number; y: number }, hopUp: number, hopDown: number) => {
      const m = moving.get(k);
      if (!m) return f(i);
      const A = f(m.a),
        B = f(m.b),
        w = Math.sin(Math.PI * m.u);
      return {
        x: A.x + (B.x - A.x) * m.u + (m.up ? -6 : 6) * w,
        y: A.y + (B.y - A.y) * m.u - (m.up ? hopUp : hopDown) * w,
      };
    };
    // which wire is broken, or being checked
    const bad = ph >= 0.14 && ph < 0.46 ? 10 : ph >= 0.46 && ph < 0.76 ? 4 : -1;
    const fix = ph >= 0.26 && ph < 0.46 ? seg(ph, 0.26, 0.46) : ph >= 0.56 && ph < 0.76 ? seg(ph, 0.56, 0.76) : 0;
    const arc =
      ph >= 0.14 && ph < 0.46 ? [10, 4] : ph >= 0.46 && ph < 0.76 ? [4, 1] : ph >= 0.76 && ph < 0.92 ? [1, 0] : null;
    let g = `<rect x="${cx - 7.5 * cp - 10}" y="${ay - 13}" width="${15 * cp + 20}" height="26" rx="6" fill="#EFE9DD" stroke="rgba(27,26,23,.12)"/>`;
    // the array: cells, their index, and a copy of every key
    for (let i = 0; i < 15; i++) {
      const c = cell(i),
        used = i < 10 || (i === 10 && drop > 0);
      g += `<rect x="${c.x - cp / 2 + 2}" y="${ay - 10}" width="${cp - 4}" height="20" rx="3.5" fill="${used ? PAPER : '#E6DFD2'}" stroke="rgba(27,26,23,${used ? 0.18 : 0.08})"/>`;
      g += glyphSVG(String(i), c.x, ay + 19, 6, used ? GRAPHITE : FAINT, 14);
    }
    // the tree's wires
    for (let i = 1; i <= 10; i++) {
      if (i === 10 && drop <= 0) continue;
      const p = node((i - 1) >> 1),
        q = node(i);
      const col = i === bad ? RED : i === 1 && ph >= 0.76 && ph < 0.92 ? COBALT : INK;
      const op = i === bad ? 1 - fix * 0.7 : 1;
      g += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${col}" stroke-width="${i === bad ? 2.2 : 1.3}" opacity="${op.toFixed(2)}"/>`;
    }
    if (drop <= 0) {
      const q = node(10),
        p = node(4);
      g += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${FAINT}" stroke-width="1.2" stroke-dasharray="3 3"/><circle cx="${q.x}" cy="${q.y}" r="${R}" fill="none" stroke="${FAINT}" stroke-width="1.2" stroke-dasharray="3 2.5"/>`;
    }
    // the arc of index arithmetic over the array
    if (arc) {
      const A = cell(arc[0]),
        B = cell(arc[1]),
        h = 10 + Math.abs(arc[0] - arc[1]) * 2.4;
      g += `<path d="M${A.x} ${ay - r - 2} Q${(A.x + B.x) / 2} ${ay - r - 2 - 2 * h} ${B.x} ${ay - r - 2}" fill="none" stroke="${COBALT}" stroke-width="1.4"/><circle cx="${B.x}" cy="${ay - r - 2}" r="2" fill="${COBALT}"/>`;
    }
    // keys: in the tree, then their copies in the array
    slots.forEach((k, i) => {
      if (i === 10 && drop <= 0 && k === '5') return;
      const fresh = k === '5',
        fill = fresh ? (ph < 0.9 ? YELLOW : INK) : INK;
      const glyph = fill === YELLOW ? INK : LIGHT;
      const dy = fresh && drop < 1 ? -(1 - drop) * 30 : 0;
      const t = at(k, i, node, 4, 0),
        c = at(k, i, cell, 12, 3);
      g += disc(t.x, t.y + dy, R, fill, k, glyph);
      g += `<g opacity="${fresh ? drop.toFixed(2) : 1}">${disc(c.x, c.y + dy * 0.5, r, fill, k, glyph)}</g>`;
    });
    svg.innerHTML = g;
  }
  if (still || REDUCED) {
    draw(phase);
    return;
  }
  const cycle = 8;
  let visible = true;
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
  }).observe(svg);
  const frame = (now: number) => {
    if (visible) {
      const t = (now / 1000) % cycle;
      // rest, drop and climb, hold, then fade back to the start
      draw(t < 0.8 ? 0 : t < 5.8 ? (t - 0.8) / 5 : 1);
      svg.style.opacity = t > 7 ? String(Math.max(0.15, 1 - (t - 7) * 1.2)) : t < 0.6 ? String(0.15 + t * 1.4) : '1';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ---------------- No. 6: a loom weaving a sort ---------------- */

const LOOM_KEYS = [5, 2, 7, 1, 8, 3, 6, 4];

/** Where each thread stands before each pick: where[p][t] is the slot of thread t. */
const slotsOf = (run: Run): number[][] =>
  run.states.map(arr => {
    const w = new Array<number>(arr.length);
    arr.forEach((id, s) => (w[id] = s));
    return w;
  });

/**
 * One cloth drawn flat, as seen from above: a thread per key running from the start
 * of the cloth (row 0) to row `rows`, bending wherever its key changed slot, with a
 * gold pick across each row. `y(r)` places row r, `x(s)` slot s.
 */
function clothSVG(run: Run, rows: number, x: (s: number) => number, y: (r: number) => number, sw: number): string {
  const where = slotsOf(run),
    th = run.threads;
  const at = (r: number, t: number) => where[Math.max(0, Math.min(where.length - 1, r - 1))][t];
  let g = '';
  const W = Math.floor(rows);
  // gold picks first, under the threads
  let p = 0;
  for (const ev of run.events) {
    if (ev.kind !== 'pick') continue;
    p++;
    if (p > W) break;
    g += `<line x1="${x(ev.i).toFixed(1)}" y1="${y(p).toFixed(1)}" x2="${x(ev.j).toFixed(1)}" y2="${y(p).toFixed(1)}" stroke="${YELLOW}" stroke-width="${(sw * 0.8).toFixed(2)}" opacity="0.85"/>`;
  }
  for (const t of th.list) {
    let d = `M${x(at(0, t.id)).toFixed(1)} ${y(0).toFixed(1)}`;
    for (let r = 1; r <= W; r++) {
      const a = at(r - 1, t.id),
        b = at(r, t.id);
      const y0 = y(r - 1),
        y1 = y(r);
      if (a === b) d += `L${x(b).toFixed(1)} ${y1.toFixed(1)}`;
      else {
        const m = (y0 + y1) / 2;
        d += `C${x(a).toFixed(1)} ${m.toFixed(1)} ${x(b).toFixed(1)} ${m.toFixed(1)} ${x(b).toFixed(1)} ${y1.toFixed(1)}`;
      }
    }
    g += `<path d="${d}" fill="none" stroke="${hexOf(dye(shade(t.v, th.top)))}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  return g;
}

/**
 * A loom as its two views, aligned slot by slot: the cloth from above, growing a
 * row per comparison, and the keys from the front as bars, moving as insertion
 * sort weaves them into order. `phase` runs 0 → 1 over the whole sort.
 */
export function drawLoom(svg: SVGSVGElement, { W = 320, H = 250, still = false, phase = 1 } = {}): void {
  const run = runSort('insertion', threadsOf(LOOM_KEYS)),
    where = slotsOf(run),
    n = LOOM_KEYS.length,
    C = run.comps;
  const pitch = Math.min(30, (W - 70) / n),
    x0 = W / 2 - ((n - 1) * pitch) / 2;
  const x = (s: number) => x0 + s * pitch;
  const base = H - 26,
    barTop = base - 78,
    clothBottom = barTop - 16,
    clothTop = 16;
  const dy = (clothBottom - clothTop) / C;
  const R = 5.2;
  function draw(ph: number): void {
    const rows = ph * C,
      k = Math.floor(rows),
      f = rows - k;
    const y = (r: number) => clothBottom - (rows - r) * dy;
    let g = `<rect x="${x(-0.6)}" y="${clothTop - 4}" width="${x(n - 0.4) - x(-0.6)}" height="${clothBottom - clothTop + 8}" rx="4" fill="#EDE5D3"/>`;
    g += clothSVG(run, rows, x, y, 1.9);
    // the start of the cloth: a heading bar
    g += `<line x1="${x(-0.55)}" y1="${y(0) - 2}" x2="${x(n - 0.45)}" y2="${y(0) - 2}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    // the front: cells, and a bar per key as high as its value
    g += `<line x1="${x(-0.7)}" y1="${base}" x2="${x(n - 0.3)}" y2="${base}" stroke="rgba(27,26,23,.25)" stroke-width="1.2"/>`;
    const A = where[Math.min(C, k)],
      B = where[Math.min(C, k + 1)];
    for (const t of run.threads.list) {
      const s = A[t.id] + (B[t.id] - A[t.id]) * (f * f * (3 - 2 * f));
      const hx = x(s),
        hy = base - 14 - ((t.v - 1) / (n - 1)) * (base - barTop - 22);
      const col = hexOf(dye(shade(t.v, n)));
      // the thread comes down from the cloth to its key
      g += `<line x1="${hx.toFixed(1)}" y1="${clothBottom}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${col}" stroke-width="1.2" opacity="0.35"/>`;
      g += `<line x1="${hx.toFixed(1)}" y1="${base}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${GRAPHITE}" stroke-width="1.3"/>`;
      g += disc(hx, hy, R * 1.6, col, String(t.v), shade(t.v, n) < 0.42 ? INK : '#FFFFFF');
    }
    svg.innerHTML = g;
  }
  if (still || REDUCED) {
    draw(phase);
    return;
  }
  const cycle = 9;
  let visible = true;
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
  }).observe(svg);
  const frame = (now: number) => {
    if (visible) {
      const t = (now / 1000) % cycle;
      // rest, weave, hold, then fade back to the start
      draw(t < 0.8 ? 0 : t < 6.8 ? (t - 0.8) / 6 : 1);
      svg.style.opacity =
        t > 8.2 ? String(Math.max(0.15, 1 - (t - 8.2) * 1.2)) : t < 0.6 ? String(0.15 + t * 1.4) : '1';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Six sorts' cloths, woven on the same ten keys and stood up side by side: their heights are their work. */
export function drawTapestries(svg: SVGSVGElement, { W = 480, H = 220 } = {}): void {
  const th = threadsOf([6, 2, 9, 4, 10, 1, 7, 3, 8, 5]);
  const runs = SORTS.map(k => runSort(k, th));
  const most = Math.max(...runs.map(r => r.comps));
  const n = th.n,
    gap = 12,
    panel = (W - 40 - gap * 5) / 6,
    base = H - 30,
    top = 14;
  const dy = (base - top) / most;
  let g = `<rect x="14" y="${base + 2}" width="${W - 28}" height="10" rx="3" fill="#EFE9DD" stroke="rgba(27,26,23,.12)"/>`;
  runs.forEach((run, k) => {
    const x0 = 20 + k * (panel + gap),
      px = panel / n;
    const x = (s: number) => x0 + (s + 0.5) * px;
    const C = run.comps;
    // stood up: the finished front at the bottom, the start of the cloth at the top
    const y = (r: number) => base - (C - r) * dy;
    g += `<rect x="${x0}" y="${y(0) - 3}" width="${panel}" height="${base - y(0) + 3}" rx="2" fill="#EDE5D3"/>`;
    g += clothSVG(run, C, x, y, 1.15);
    g += `<line x1="${x0}" y1="${y(0) - 3}" x2="${x0 + panel}" y2="${y(0) - 3}" stroke="${INK}" stroke-width="1.8"/>`;
    g += glyphSVG(String(C), x0 + panel / 2, base + 7, 7, INK, 14);
  });
  svg.innerHTML = g;
}

/* ---------------- No. 7: a sunburst of words, opening round a word being typed ---------------- */

/** Prefix Sunburst's twenty words. */
const SUN = dictOf('AN AND ANT BE BEE CAR CARD CARE CART CARTOON CAT DO DOG DOT TEA TEN TO TOE TOP TRY'.split(' '));

/**
 * The trie of twenty words as a sunburst: one ring per letter, words A to Z from
 * left to right, a gold ring where each word ends. `typed` letters light their
 * path in cobalt, and a gold wedge holds every word they could become. With
 * `list`, those words also drop down under the word box, as autocomplete shows them.
 */
function sunburstSVG(W: number, H: number, typed: string, list: boolean): string {
  const S = shapeOf(SUN);
  const L = layoutOf(S, typed || null);
  const left = list ? 150 : 0;
  const R = Math.min((W - left) / 2 - 10, H - 50) / (ringR(RINGS) + 0.4);
  const cx = left + (W - left) / 2,
    cy = H - 24;
  const at = (i: number): [number, number] => {
    const rr = ringR(S.depth[i]) * R;
    return [cx + rr * Math.cos(L.th[i]), cy - rr * Math.sin(L.th[i])];
  };
  const out = (ringR(RINGS) + 0.4) * R;
  const px0 = Math.max(4, cx - out - 16),
    px1 = Math.min(W - 4, cx + out + 16);
  let g = `<path d="M${px0} ${cy + 16} L${px1} ${cy + 16} L${px1 - 12} ${cy + 5} L${px0 + 12} ${cy + 5} Z" fill="#F7F3EB" stroke="rgba(27,26,23,.1)"/>`;
  // the guide rings, like a protractor's
  for (let k = 1; k <= RINGS; k++) {
    const r = ringR(k) * R;
    g += `<path d="M${(cx - r).toFixed(1)} ${cy} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + r).toFixed(1)} ${cy}" fill="none" stroke="#C9C0B0" stroke-width="0.8" stroke-dasharray="2 3"/>`;
  }
  const wi = typed ? S.index.get(typed) : undefined;
  if (wi != null) {
    // the wedge: every word under the letters typed
    const r0 = (ringR(S.depth[wi]) - 0.5) * R;
    const a0 = L.lo[wi],
      a1 = L.hi[wi];
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`;
    g += `<path d="M${p(r0, a0)} L${p(out, a0)} A${out.toFixed(1)} ${out.toFixed(1)} 0 0 0 ${p(out, a1)} L${p(r0, a1)} A${r0.toFixed(1)} ${r0.toFixed(1)} 0 0 1 ${p(r0, a0)} Z" fill="${YELLOW}" fill-opacity="0.2"/>`;
  }
  const onPath = (i: number) => !!typed && typed.startsWith(S.ids[i]);
  for (let i = 1; i < S.ids.length; i++) {
    const [x, y] = at(i),
      [px, py] = S.parent[i] > 0 ? at(S.parent[i]) : [cx, cy];
    const hot = onPath(i);
    g += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${hot ? COBALT : INK}" stroke-width="${hot ? 2.2 : 1}" opacity="${hot ? 1 : 0.8}"/>`;
  }
  const rd = Math.min(8.5, 0.42 * R);
  for (let i = 1; i < S.ids.length; i++) {
    const [x, y] = at(i);
    const hot = typed === S.ids[i];
    const inside = !!typed && S.ids[i].startsWith(typed);
    const dim = !!typed && !onPath(i) && !inside;
    if (S.word[i])
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rd + 2.4).toFixed(1)}" fill="none" stroke="${YELLOW}" stroke-width="1.8" opacity="${dim ? 0.45 : 1}"/>`;
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rd.toFixed(1)}" fill="${hot ? COBALT : INK}" opacity="${dim ? 0.45 : 1}"/>`;
    g += glyphSVG(S.ch[i], x, y, rd * 0.95, hot ? '#fff' : LIGHT, 15);
  }
  g += `<circle cx="${cx}" cy="${cy}" r="${(rd * 1.25).toFixed(1)}" fill="${YELLOW}"/>`;
  // the word box, with the letters typed so far, and what autocomplete offers under it
  const box = list ? 118 : Math.max(64, 18 + 13 * Math.max(3, typed.length));
  if (list && typed) {
    const words = S.ids.filter((id, i) => S.word[i] && id.startsWith(typed));
    const h = 17;
    g += `<rect x="12" y="36" width="${box}" height="${words.length * h + 8}" rx="6" fill="${PAPER}" stroke="rgba(27,26,23,.22)"/>`;
    words.forEach((w, k) => {
      const y = 44 + k * h + h / 2 - 1,
        gh = 8.5;
      const x0 = 24;
      const wt = glyphWidth(typed, gh),
        wr = glyphWidth(w.slice(typed.length), gh);
      g += glyphSVG(typed, x0 + wt / 2, y, gh, INK, 17);
      if (wr > 0) g += glyphSVG(w.slice(typed.length), x0 + wt + 0.12 * gh + wr / 2, y, gh, FAINT, 15);
    });
  }
  g += `<rect x="12" y="10" width="${box}" height="24" rx="7" fill="${PAPER}" stroke="${COBALT}" stroke-width="1.3"/>`;
  [...typed].forEach((ch, k) => (g += glyphSVG(ch, 25 + k * 13, 22, 11, INK, 14)));
  g += `<line x1="${20 + typed.length * 13}" y1="15" x2="${20 + typed.length * 13}" y2="29" stroke="${COBALT}" stroke-width="1.6"/>`;
  return g;
}

/** The sunburst, with a word typed into it a letter at a time: C, CA, CAR, CART. */
export function drawSunburst(svg: SVGSVGElement, { W = 320, H = 250, still = false, typed = 'CA' } = {}): void {
  if (still || REDUCED) {
    svg.innerHTML = sunburstSVG(W, H, typed, W >= 420);
    return;
  }
  const WORD = 'CART',
    cycle = 9;
  let visible = true;
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
  }).observe(svg);
  let shown = '';
  svg.innerHTML = sunburstSVG(W, H, shown, W >= 420);
  const frame = (now: number) => {
    if (visible) {
      const t = (now / 1000) % cycle;
      // rest, type a letter every second and a half, hold, then fade back to the start
      const k = t < 1 ? 0 : Math.min(WORD.length, 1 + Math.floor((t - 1) / 1.5));
      const typedNow = WORD.slice(0, k);
      if (typedNow !== shown) {
        shown = typedNow;
        svg.innerHTML = sunburstSVG(W, H, typedNow, W >= 420);
      }
      svg.style.opacity =
        t > cycle - 0.8 ? String(Math.max(0.15, 1 - (t - cycle + 0.8) * 1.2)) : t < 0.6 ? String(0.15 + t * 1.4) : '1';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ---------------- the colophon: the collection as a sunburst of its own ---------------- */

/** The seven works as rays from one gold centre, numbered in learning order; the last carries a word mark. */
export function colophonSVG(nos: readonly number[], W = 480, H = 220): string {
  const cx = W / 2,
    cy = H - 22,
    R = Math.min(W * 0.36, H - 58);
  const n = nos.length;
  let g = '';
  for (let k = 1; k <= 3; k++) {
    const r = (R * k) / 3;
    g += `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="rgba(239,232,218,.16)" stroke-width="1" stroke-dasharray="2 4"/>`;
  }
  nos.forEach((no, k) => {
    const a = Math.PI - 0.32 - ((Math.PI - 0.64) * k) / Math.max(1, n - 1);
    const x = cx + R * Math.cos(a),
      y = cy - R * Math.sin(a);
    const last = k === n - 1;
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(239,232,218,.45)" stroke-width="1.3"/>`;
    if (last)
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="20" fill="none" stroke="${YELLOW}" stroke-width="2.4"/>`;
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="${PAPER}"/>${glyphSVG(String(no), x, y, 13, INK, 14)}`;
  });
  g += `<circle cx="${cx}" cy="${cy}" r="11" fill="${YELLOW}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg>`;
}

/* ---------------- the catalogue's thumbnails ---------------- */

/** A thumbnail per chapter slug. */
export const THUMBNAILS: Readonly<Record<string, (svg: SVGSVGElement) => void>> = {
  avl: s => drawMobile(s, { s: 0.74, cx: 240, top: 14 }),
  graphs: s => drawNet(s, { W: 480, H: 220, still: true, small: true }),
  lists: s => drawChain(s, { W: 480, H: 220, still: true, phase: 0.42 }),
  hashing: s => drawClock(s, { W: 480, H: 220, still: true }),
  heap: s => drawPyramid(s, { W: 480, H: 220, still: true, phase: 0.2 }),
  sorting: s => drawTapestries(s, { W: 480, H: 220 }),
  trie: s => drawSunburst(s, { W: 480, H: 220, still: true, typed: 'CA' }),
};
