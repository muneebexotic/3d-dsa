// The landing page's drawings: a small AVL mobile that sways, a net that lifts
// off its plinth in order of distance, a chain whose pointers turn round, and
// sketches of the chapters to come. Plain SVG, drawn in code.

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

/* ---------------- sketches of the chapters to come ---------------- */

const SKETCH = `fill="none" stroke="${FAINT}" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round"`;
const sketchDisc = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#EFE9DD" stroke="${FAINT}" stroke-width="1.5" stroke-dasharray="4 3"/>`;

/** A thumbnail per chapter slug. */
export const THUMBNAILS: Readonly<Record<string, (svg: SVGSVGElement) => void>> = {
  avl: s => drawMobile(s, { s: 0.74, cx: 240, top: 14 }),
  graphs: s => drawNet(s, { W: 480, H: 220, still: true, small: true }),
  lists: s => drawChain(s, { W: 480, H: 220, still: true, phase: 0.42 }),
  hashing: s => {
    let g = '';
    for (let i = 0; i < 5; i++) {
      const y = 30 + i * 30;
      g += `<rect x="70" y="${y}" width="30" height="24" rx="5" ${SKETCH}/>${glyphSVG(String(i), 85, y + 12, 11, FAINT, 14)}`;
    }
    const chains: [number, string[]][] = [
      [0, ['A']],
      [2, ['K', 'Q', 'Z']],
      [3, ['M']],
      [4, ['R', 'T']],
    ];
    for (const [b, ks] of chains)
      ks.forEach((k, j) => {
        const x = 130 + j * 44,
          y = 42 + b * 30;
        g += `<path d="M${x - 26} ${y} H${x - 13}" ${SKETCH}/><circle cx="${x}" cy="${y}" r="12" ${SKETCH}/>${glyphSVG(k, x, y, 11, GRAPHITE, 14)}`;
      });
    s.innerHTML = g;
  },
  heap: s => {
    const pos = [
        [160, 36],
        [100, 86],
        [220, 86],
        [70, 140],
        [130, 140],
        [190, 140],
        [250, 140],
      ],
      v = ['2', '5', '3', '9', '6', '8', '7'];
    let g = '';
    for (const [a, b] of [
      [0, 1],
      [0, 2],
      [1, 3],
      [1, 4],
      [2, 5],
      [2, 6],
    ])
      g += `<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}" ${SKETCH}/>`;
    pos.forEach(([x, y], i) => {
      g += sketchDisc(x, y, 15) + glyphSVG(v[i], x, y, 13, GRAPHITE, 14);
    });
    s.innerHTML = g;
  },
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
