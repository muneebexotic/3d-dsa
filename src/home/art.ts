// The landing page's drawings: a small AVL mobile that sways, a net that lifts
// off its plinth in order of distance, and sketches of the chapters to come.
// Plain SVG, drawn in code.

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

/* ---------------- sketches of the chapters to come ---------------- */

const SKETCH = `fill="none" stroke="${FAINT}" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round"`;
const sketchDisc = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#EFE9DD" stroke="${FAINT}" stroke-width="1.5" stroke-dasharray="4 3"/>`;

/** A thumbnail per chapter slug. */
export const THUMBNAILS: Readonly<Record<string, (svg: SVGSVGElement) => void>> = {
  avl: s => drawMobile(s, { s: 0.74, cx: 240, top: 14 }),
  graphs: s => drawNet(s, { W: 480, H: 220, still: true, small: true }),
  lists: s => {
    let g = '';
    ['4', '8', '15', '16'].forEach((v, i) => {
      const x = 36 + i * 70;
      g += `<rect x="${x}" y="84" width="44" height="32" rx="6" ${SKETCH}/>${glyphSVG(v, x + 22, 100, 14, GRAPHITE, 14)}`;
      if (i < 3) g += `<path d="M${x + 48} 100 H${x + 64} M${x + 58} 95 L${x + 64} 100 L${x + 58} 105" ${SKETCH}/>`;
    });
    g += `<text x="36" y="72" font-size="11" font-weight="600" fill="${FAINT}" font-family="Avenir Next,Segoe UI,sans-serif" letter-spacing="1">HEAD</text>`;
    s.innerHTML = g;
  },
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
