// The landing page's drawings: a small AVL mobile that sways, a net that lifts
// off its plinth in order of distance, a chain whose pointers turn round, a clock
// whose hand winds a key round to its bucket, a key climbing a heap's pyramid,
// and sketches of the chapters to come. Plain SVG, drawn in code.

import { glyphSVG } from '../core/glyphs';
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

/* ---------------- sketches of the chapters to come ---------------- */

const SKETCH = `fill="none" stroke="${FAINT}" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round"`;
const sketchDisc = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#EFE9DD" stroke="${FAINT}" stroke-width="1.5" stroke-dasharray="4 3"/>`;

/** A thumbnail per chapter slug. */
export const THUMBNAILS: Readonly<Record<string, (svg: SVGSVGElement) => void>> = {
  avl: s => drawMobile(s, { s: 0.74, cx: 240, top: 14 }),
  graphs: s => drawNet(s, { W: 480, H: 220, still: true, small: true }),
  lists: s => drawChain(s, { W: 480, H: 220, still: true, phase: 0.42 }),
  hashing: s => drawClock(s, { W: 480, H: 220, still: true }),
  heap: s => drawPyramid(s, { W: 480, H: 220, still: true, phase: 0.2 }),
  sorting: s => {
    const hs = [60, 110, 40, 130, 80, 150, 25, 95, 120];
    s.innerHTML =
      hs.map((h, i) => `<rect x="${44 + i * 27}" y="${176 - h}" width="17" height="${h}" rx="3" ${SKETCH}/>`).join('') +
      `<line x1="34" y1="178" x2="286" y2="178" stroke="${FAINT}" stroke-width="1.2"/>`;
  },
  trie: s => {
    const N: Record<string, [number, number, string]> = {
      r: [160, 30, ''],
      c: [110, 76, 'C'],
      d: [214, 76, 'D'],
      a: [110, 122, 'A'],
      o: [214, 122, 'O'],
      t: [80, 168, 'T'],
      r2: [140, 168, 'R'],
      g: [214, 168, 'G'],
    };
    let g = '';
    for (const [a, b] of [
      ['r', 'c'],
      ['r', 'd'],
      ['c', 'a'],
      ['d', 'o'],
      ['a', 't'],
      ['a', 'r2'],
      ['o', 'g'],
    ])
      g += `<line x1="${N[a][0]}" y1="${N[a][1]}" x2="${N[b][0]}" y2="${N[b][1]}" ${SKETCH}/>`;
    for (const [x, y, l] of Object.values(N))
      g += sketchDisc(x, y, 14) + (l ? glyphSVG(l, x, y, 12, GRAPHITE, 14) : '');
    s.innerHTML = g;
  },
};
