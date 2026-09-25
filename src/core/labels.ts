// Labels: every letter, number, pill and ring in one draw call. Wire glyphs live
// in a small texture atlas; pills and rings are drawn as signed distances, so they
// stay crisp at any size. Quads face the camera unless drawn flat on the floor.

import * as THREE from 'three';
import type { RGB } from './color';
import { GLYPH, glyphLayout, glyphWidth } from './glyphs';

/** Shape modes understood by the shader: text, filled pill, outlined pill, ring (dashed if dashes > 0), soft glow ring. */
export const MODE = { text: 0, fill: 1, outline: 2, ring: 3, glow: 4 } as const;
export type LabelMode = (typeof MODE)[keyof typeof MODE];

const MAX_LABELS = 9000;

function buildAtlas(): {
  texture: THREE.CanvasTexture;
  cells: Record<string, readonly [number, number, number, number]>;
} {
  const chars = Object.keys(GLYPH).filter(c => c !== ' ');
  const C = 128,
    W = 1024,
    H = 1024,
    cols = W / C;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) throw new Error('Canvas 2D is not available');
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 13;
  const cells: Record<string, readonly [number, number, number, number]> = {};
  chars.forEach((ch, i) => {
    const x = (i % cols) * C,
      y = Math.floor(i / cols) * C;
    g.save();
    g.translate(x + 16, y + 16);
    g.scale(0.96, 0.96);
    g.stroke(new Path2D(GLYPH[ch]));
    g.restore();
    cells[ch] = [x / W, 1 - (y + C) / H, (x + C) / W, 1 - y / H];
  });
  const texture = new THREE.CanvasTexture(cv);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return { texture, cells };
}

const VERTEX = /* glsl */ `
  attribute vec3 iPos; attribute vec4 iOff; attribute vec4 iPar; attribute vec4 iCol; attribute vec2 iMode;
  varying vec2 vUv; varying vec2 vQ; varying vec2 vHalf; varying vec4 vPar; varying vec4 vCol; varying float vMode;
  void main() {
    vec2 q = position.xy;
    vec3 Rt, Up;
    if (iMode.y > 0.5) { Rt = vec3(1.0, 0.0, 0.0); Up = vec3(0.0, 0.0, -1.0); }
    else { Rt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); Up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
    vec2 local = q * iOff.xy + iOff.zw;
    vec3 p = iPos + Rt * local.x + Up * local.y;
    if (iMode.y < 0.5) p += normalize(cameraPosition - iPos) * 0.09;
    vHalf = iOff.xy * 0.5; vQ = q * iOff.xy;
    vUv = mix(iPar.xy, iPar.zw, q + 0.5);
    vPar = iPar; vCol = iCol; vMode = iMode.x;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv; varying vec2 vQ; varying vec2 vHalf; varying vec4 vPar; varying vec4 vCol; varying float vMode;
  float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + vec2(r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float cover(float d) { float w = max(fwidth(d), 1e-5) * 0.8; return 1.0 - smoothstep(-w, w, d); }
  void main() {
    float a;
    if (vMode < 0.5) a = texture2D(map, vUv).a;
    else if (vMode < 1.5) { float r = min(vHalf.x, vHalf.y) * vPar.x; a = cover(sdRR(vQ, vHalf, r)); }
    else if (vMode < 2.5) { float sw = vPar.y; float r = min(vHalf.x, vHalf.y) * vPar.x; a = cover(abs(sdRR(vQ, vHalf - vec2(sw * 0.5), max(0.0, r - sw * 0.5))) - sw * 0.5); }
    else if (vMode < 3.5) {
      float sw = vPar.y; float rad = vHalf.x - sw * 0.5;
      a = cover(abs(length(vQ) - rad) - sw * 0.5);
      if (vPar.z > 0.5) { float f = fract(atan(vQ.y, vQ.x) / 6.2831853 * vPar.z + vPar.w); float dw = max(fwidth(f), 1e-4) * 1.2; a *= smoothstep(0.0, dw, f) * (1.0 - smoothstep(0.56 - dw, 0.56, f)); }
    } else { float d = abs(length(vQ) - vPar.y) / vPar.z; a = 1.0 - smoothstep(0.0, 1.0, d); }
    gl_FragColor = vec4(vCol.rgb, vCol.a * a);
    if (gl_FragColor.a < 0.004) discard;
  }`;

const SIZES = { iPos: 3, iOff: 4, iPar: 4, iCol: 4, iMode: 2 } as const;
type AttrName = keyof typeof SIZES;

/** A run of label pieces that share an anchor and are depth-sorted together. */
interface Group {
  x: number;
  y: number;
  z: number;
  s: number;
  e: number;
  d: number;
}

export class LabelBatch {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly attr = {} as Record<AttrName, THREE.InstancedBufferAttribute>;
  private readonly staging = {} as Record<AttrName, Float32Array>;
  private readonly cells: Record<string, readonly [number, number, number, number]>;
  private readonly groups: Group[] = [];
  private gc = 0;
  private n = 0;
  private cur: Group | null = null;

  constructor(scene: THREE.Scene) {
    const atlas = buildAtlas();
    this.cells = atlas.cells;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const k of Object.keys(SIZES) as AttrName[]) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LABELS * SIZES[k]), SIZES[k]);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k, a);
      this.attr[k] = a;
      this.staging[k] = new Float32Array(MAX_LABELS * SIZES[k]);
    }
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        uniforms: { map: { value: atlas.texture } },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }

  get count(): number {
    return this.geo.instanceCount;
  }

  begin(): void {
    this.n = 0;
    this.gc = 0;
    this.cur = null;
  }

  /** Start a group anchored at (x, y, z); everything drawn until the next group sorts with it. */
  group(x: number, y: number, z: number): void {
    let g = this.groups[this.gc];
    if (!g) g = this.groups[this.gc] = { x, y, z, s: 0, e: 0, d: 0 };
    g.x = x;
    g.y = y;
    g.z = z;
    g.s = g.e = this.n;
    this.gc++;
    this.cur = g;
  }

  private raw(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    oR: number,
    oU: number,
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    col: RGB,
    a: number,
    mode: LabelMode,
    flat: 0 | 1,
  ): void {
    if (this.n >= MAX_LABELS || a < 0.004 || !this.cur) return;
    // direct writes: this runs thousands of times a frame, so nothing is allocated here
    const i = this.n++,
      S = this.staging,
      i3 = i * 3,
      i4 = i * 4;
    S.iPos[i3] = x;
    S.iPos[i3 + 1] = y;
    S.iPos[i3 + 2] = z;
    S.iOff[i4] = w;
    S.iOff[i4 + 1] = h;
    S.iOff[i4 + 2] = oR;
    S.iOff[i4 + 3] = oU;
    S.iPar[i4] = p0;
    S.iPar[i4 + 1] = p1;
    S.iPar[i4 + 2] = p2;
    S.iPar[i4 + 3] = p3;
    S.iCol[i4] = col[0];
    S.iCol[i4 + 1] = col[1];
    S.iCol[i4 + 2] = col[2];
    S.iCol[i4 + 3] = Math.min(1, a);
    S.iMode[i * 2] = mode;
    S.iMode[i * 2 + 1] = flat;
    this.cur.e = this.n;
  }

  /**
   * A shape of size w × h, offset (oR, oU) along the camera's right and up.
   * p0: corner roundness (1 = pill); p1: stroke width (outline, ring) or radius (glow);
   * p2: dash count (ring) or width (glow); p3: dash phase.
   */
  shape(
    mode: LabelMode,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    col: RGB,
    a: number,
    oR = 0,
    oU = 0,
    p0 = 1,
    p1 = 0,
    p2 = 0,
    p3 = 0,
    flat: 0 | 1 = 0,
  ): void {
    this.raw(x, y, z, w, h, oR, oU, p0, p1, p2, p3, col, a, mode, flat);
  }

  text(
    str: string,
    x: number,
    y: number,
    z: number,
    h: number,
    col: RGB,
    a: number,
    oR = 0,
    oU = 0,
    flat: 0 | 1 = 0,
  ): void {
    for (const { ch, x: gx, k } of glyphLayout(str, h)) {
      const c = this.cells[ch];
      if (!c) continue;
      const sz = 133.333 * k;
      this.raw(x, y, z, sz, sz, oR + gx + 50 * k, oU, c[0], c[1], c[2], c[3], col, a, MODE.text, flat);
    }
  }

  /** Text on a pill with an optional border. Returns the pill's width. */
  pill(
    x: number,
    y: number,
    z: number,
    str: string,
    h: number,
    oR: number,
    oU: number,
    bg: RGB,
    border: RGB,
    bw: number,
    fg: RGB,
    a: number,
    corner = 1,
  ): number {
    const W = glyphWidth(str, h) + h * 1.05,
      H = h * 1.8;
    this.shape(MODE.fill, x, y, z, W, H, bg, a, oR, oU, corner);
    if (bw > 0) this.shape(MODE.outline, x, y, z, W, H, border, a, oR, oU, corner, bw);
    this.text(str, x, y, z, h, fg, a, oR, oU);
    return W;
  }

  /** Sort groups far to near, so nearer labels draw over farther ones, and upload. */
  end(camera: THREE.Camera): void {
    const cp = camera.position,
      gs = this.groups.slice(0, this.gc);
    for (const g of gs) g.d = (g.x - cp.x) ** 2 + (g.y - cp.y) ** 2 + (g.z - cp.z) ** 2;
    gs.sort((a, b) => b.d - a.d);
    let o = 0;
    for (const g of gs) {
      const cnt = g.e - g.s;
      if (!cnt) continue;
      for (const k of Object.keys(SIZES) as AttrName[]) {
        const n = SIZES[k];
        (this.attr[k].array as Float32Array).set(this.staging[k].subarray(g.s * n, g.e * n), o * n);
      }
      o += cnt;
    }
    for (const k of Object.keys(SIZES) as AttrName[]) {
      const a = this.attr[k];
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, o) * SIZES[k]);
      a.needsUpdate = true;
    }
    this.geo.instanceCount = o;
  }
}
