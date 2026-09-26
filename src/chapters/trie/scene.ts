// The Prefix Sunburst scene: a long plinth on a plaster floor, and standing on it
// one sunburst (or three side by side). Its gold centre is the root; the letters
// of every word run out from it along rays, one ring per letter, with faint guide
// rings like a protractor's and a gold ring round every node where a word ends.
// What an operation lights is drawn over that: the path in cobalt, the wedge of
// words under a prefix in gold with the words read out at the rim, new nodes in
// yellow, nodes going away in red. In the Memory view, every node's 26 slots
// unfold in a row behind it. draw() renders any Pose.

import * as THREE from 'three';
import { mix3, type RGB } from '../../core/color';
import { glyphWidth } from '../../core/glyphs';
import { InstancedBatch, WireKit } from '../../core/instances';
import { LabelBatch, MODE } from '../../core/labels';
import { createStage, plasterTexture, type FrameBox, type Stage } from '../../core/stage';
import * as Lay from './layout';
import { COL } from './palette';
import type { FanPose, Pose } from './poses';
import { slotOf } from './trie';

/** Interaction state the scene needs to draw, owned by the page. */
export interface DrawView {
  /** The node in the inspector: sunburst index and node id. */
  selected: { fan: string; id: string } | null;
  clock: number;
  /** How far the rows of slots have unfolded: 0 in the Letters view, 1 in Memory. */
  mem: number;
}

/** Where a node's disc was drawn this frame. */
export interface NodeWorld extends Lay.P3 {
  r: number;
  fan: string;
  id: string;
}

const WEDGE_SEGS = 72;

export class SunburstScene {
  readonly stage: Stage;
  private readonly plinth: THREE.Mesh;
  private readonly kit: WireKit;
  private readonly boxes: InstancedBatch;
  private readonly labels: LabelBatch;
  private readonly wedges: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly camUp = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly camBack = new THREE.Vector3();
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();
  private readonly _v = new THREE.Vector3();
  private pose: Pose | null = null;
  /** Node positions this frame, per sunburst, for picking and callouts. */
  private xs: Float32Array[] = [];
  private ys: Float32Array[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage({
      canvas,
      background: 0xe2dacb,
      keyDir: [-0.45, 0.9, 0.85],
      cameraPos: [-3, 5, 26],
      target: [0, 3.2, 0],
      controls: {
        minPolarAngle: 0.35,
        maxPolarAngle: 1.62,
        minAzimuthAngle: -1.35,
        maxAzimuthAngle: 1.35,
        minDistance: 3,
        maxDistance: 160,
      },
    });
    const { scene } = this.stage;
    scene.fog = new THREE.Fog(0xe2dacb, 120, 300);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({
        map: plasterTexture({ base: '#DCD3C3', repeat: [30, 30], seed: 71 }),
        roughness: 0.97,
        metalness: 0,
        envMapIntensity: 0.3,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -Lay.PH;
    floor.receiveShadow = true;
    scene.add(floor);
    this.plinth = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xf7f3eb, roughness: 0.88, metalness: 0, envMapIntensity: 0.5 }),
    );
    this.plinth.castShadow = true;
    this.plinth.receiveShadow = true;
    scene.add(this.plinth);
    const tuned: Record<'rod' | 'ball' | 'cone' | 'disc', THREE.MeshStandardMaterialParameters> = {
      disc: { roughness: 0.62, metalness: 0, envMapIntensity: 0.45 },
      rod: { roughness: 0.5, metalness: 0.1 },
      ball: { roughness: 0.35, metalness: 0.15 },
      cone: { roughness: 0.45, metalness: 0.1 },
    };
    this.kit = new WireKit(scene, {
      material: kind =>
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.5,
          metalness: 0.05,
          envMapIntensity: 0.55,
          ...tuned[kind],
        }),
      discRadius: 1,
      discDepth: 0.14,
      max: { discs: 1600, rods: 26000, balls: 400, cones: 8 },
    });
    // a sunburst stands upright, so its shadow would only smear across the plinth behind it
    for (const b of [this.kit.discs, this.kit.rods, this.kit.balls, this.kit.cones]) b.mesh.castShadow = false;
    this.boxes = new InstancedBatch(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, envMapIntensity: 0.45 }),
      16000,
    );
    this.boxes.mesh.castShadow = false;
    this.boxes.mesh.receiveShadow = true;
    for (let k = 0; k < 3; k++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((WEDGE_SEGS + 1) * 2 * 3), 3));
      const idx: number[] = [];
      for (let s = 0; s < WEDGE_SEGS; s++) {
        const a = s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      g.setIndex(idx);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setRGB(COL.gold[0], COL.gold[1], COL.gold[2], THREE.SRGBColorSpace),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.frustumCulled = false;
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      this.wedges.push(m);
    }
    this.labels = new LabelBatch(scene);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.stage.camera;
  }

  render(): void {
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  counts(): { rods: number; discs: number; balls: number; labels: number; boxes: number } {
    return {
      rods: this.kit.rods.n,
      discs: this.kit.discs.n,
      balls: this.kit.balls.n,
      labels: this.labels.count,
      boxes: this.boxes.n,
    };
  }

  toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    this._v.set(x, y, z).project(this.camera);
    if (this._v.z > 1) return null;
    return { x: ((this._v.x + 1) / 2) * innerWidth, y: ((1 - this._v.y) / 2) * innerHeight };
  }

  /* ---------- drawing ---------- */

  draw(P: Pose, view: DrawView): void {
    this.pose = P;
    const kit = this.kit,
      LB = this.labels,
      camera = this.camera;
    kit.begin();
    this.boxes.begin();
    LB.begin();
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camBack);
    const x0 = P.x0 - 0.4,
      x1 = P.x1 + 0.4;
    this.plinth.position.set((x0 + x1) / 2, -Lay.PH / 2, (Lay.PLINTH_Z0 + Lay.PLINTH_Z1) / 2);
    this.plinth.scale.set(x1 - x0, Lay.PH, Lay.PLINTH_Z1 - Lay.PLINTH_Z0);
    this.xs.length = this.ys.length = P.fans.length;
    P.fans.forEach((F, k) => {
      const n = F.uni.ids.length;
      if (!this.xs[k] || this.xs[k].length !== n) {
        this.xs[k] = new Float32Array(n);
        this.ys[k] = new Float32Array(n);
      }
      const X = this.xs[k],
        Y = this.ys[k];
      for (let i = 0; i < n; i++) {
        X[i] = Lay.polarX(F.cx, F.th[i], F.rr[i]);
        Y[i] = F.cy + Lay.polarY(F.th[i], F.rr[i]);
      }
      this.drawWedge(k, F);
      if (F.a < 0.01) return;
      this.drawStand(F);
      this.drawWires(F, X, Y);
      this.drawNodes(F, X, Y, view);
      this.drawGhost(F, X, Y);
      this.drawRim(F, X, Y);
      this.drawFx(F, X, Y);
      if (view.mem > 0.01) this.drawSlots(F, X, Y, view.mem);
      this.drawPlate(F);
    });
    if (P.fans.length > 1) this.drawRack(P);
    for (let k = P.fans.length; k < this.wedges.length; k++) this.wedges[k].visible = false;
    kit.end();
    this.boxes.end();
    LB.end(camera);
  }

  /** A colour faded toward the room by f (0 = itself, 1 = gone). */
  private fade(c: RGB, f: number): RGB {
    return f <= 0 ? c : mix3(c, COL.back, Math.min(1, f));
  }

  /** The stand: a baseline at the centre's height, the guide rings, and the posts that carry them. */
  private drawStand(F: FanPose): void {
    const kit = this.kit,
      LB = this.labels,
      cx = F.cx,
      a = F.a,
      hy = F.cy + Lay.HUB_Y;
    const R = Lay.ringR(Lay.RINGS) + 0.35;
    const guide = this.fade(COL.guide, 1 - a),
      post = this.fade(COL.wire, 1 - a);
    kit.rod(cx - R, hy, -0.02, cx + R, hy, -0.02, 0.022 * a, guide);
    for (const x of [cx - R, cx + R]) kit.rod(x, F.cy, -0.02, x, hy, -0.02, 0.03 * a, post);
    kit.rod(cx, F.cy, -0.02, cx, hy, -0.02, 0.07 * a, post);
    // a sunburst above the plinth stands on a shelf of its own
    if (F.cy > 0.01) this.box(cx, F.cy - 0.05, -0.1, 2 * Lay.HALF_W - 0.6, 0.1, 1.5, this.fade(COL.plinth, 1 - a));
    const N = 44;
    for (let k = 1; k <= Lay.RINGS; k++) {
      const rr = Lay.ringR(k);
      let px = cx + rr,
        py = hy;
      for (let s = 1; s <= N; s++) {
        const th = (s / N) * Math.PI;
        const x = cx + rr * Math.cos(th),
          y = hy + rr * Math.sin(th);
        kit.rod(px, py, -0.05, x, y, -0.05, 0.0085 * a, guide);
        px = x;
        py = y;
      }
      // the ring's number, under its right foot: the k-th letter of every word
      LB.group(cx + rr, hy - 0.26, 0.02);
      LB.text(String(k), cx + rr, hy - 0.26, 0.02, 0.2, COL.graphite, 0.75 * a);
    }
  }

  /** Three sunbursts share a rack: two uprights behind them, from the plinth to the top shelf. */
  private drawRack(P: Pose): void {
    const top = Math.max(...P.fans.map(F => F.cy));
    const a = Math.min(...P.fans.map(F => F.a));
    if (top < 0.01 || a < 0.01) return;
    const x = Lay.HALF_W - 0.5,
      c = this.fade(COL.wire, 1 - a);
    for (const s of [-1, 1]) this.kit.rod(s * x, 0, -0.75, s * x, top + 0.1, -0.75, 0.06 * a, c);
  }

  /** The gold wedge behind every word under a prefix. */
  private drawWedge(k: number, F: FanPose): void {
    const m = this.wedges[k];
    if (!m) return;
    const W = F.wedge;
    if (!W || W.a * F.a < 0.01) {
      m.visible = false;
      return;
    }
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    const r1 = Lay.RIM + 0.42;
    for (let s = 0; s <= WEDGE_SEGS; s++) {
      const th = W.th0 + ((W.th1 - W.th0) * s) / WEDGE_SEGS;
      const c = Math.cos(th),
        sn = Math.sin(th);
      pos.setXYZ(s * 2, F.cx + W.r0 * c, F.cy + Lay.HUB_Y + W.r0 * sn, -0.1);
      pos.setXYZ(s * 2 + 1, F.cx + r1 * c, F.cy + Lay.HUB_Y + r1 * sn, -0.1);
    }
    pos.needsUpdate = true;
    m.material.opacity = 0.17 * W.a * F.a;
    m.visible = true;
  }

  /** Every wire from a node to its parent. */
  private drawWires(F: FanPose, X: Float32Array, Y: Float32Array): void {
    const kit = this.kit,
      n = F.uni.ids.length,
      a = F.a;
    for (let i = 1; i < n; i++) {
      const al = F.al[i];
      if (al < 0.01) continue;
      const p = F.up[i];
      if (p < 0) continue;
      const hot = Math.min(F.path[i], F.path[p]);
      let c: RGB = COL.wire;
      if (F.seen[i] > 0.01) c = mix3(c, COL.cobalt, 0.55 * F.seen[i]);
      if (F.cut[i] > 0.01) c = mix3(c, COL.cut, F.cut[i]);
      if (F.fresh[i] > 0.01) c = mix3(c, COL.yellowDeep, F.fresh[i]);
      if (hot > 0.01) c = mix3(c, COL.cobalt, hot);
      if (F.doom[i] > 0.01) c = mix3(c, COL.red, F.doom[i]);
      c = this.fade(c, F.dim[i] * 0.72 * (1 - hot) + (1 - al) * 0.6 + (1 - a));
      const base = Math.min(0.024, Math.max(0.0035, F.r[i] * 0.075));
      const r = base * (1 + 1.6 * hot) * Math.sqrt(al) * a;
      kit.rod(X[p], Y[p], 0, X[i], Y[i], 0, r, c);
    }
  }

  /** Discs and letters, word marks, and what is lit. */
  private drawNodes(F: FanPose, X: Float32Array, Y: Float32Array, view: DrawView): void {
    const kit = this.kit,
      LB = this.labels,
      cam = this.camera.quaternion,
      n = F.uni.ids.length,
      a = F.a;
    // the centre: the root, the empty beginning every word shares
    const hubGlow = Math.max(F.glow[0], F.path[0] * 0.5),
      hy = F.cy + Lay.HUB_Y;
    kit.disc(F.cx, hy, 0, Lay.HUB_R * a, this.fade(mix3(COL.gold, COL.cobalt, F.glow[0] * 0.8), 1 - a), cam);
    LB.group(F.cx, hy, 0);
    if (hubGlow > 0.01)
      LB.shape(MODE.glow, F.cx, hy, 0, 2.2, 2.2, COL.cobalt, 0.45 * hubGlow * a, 0, 0, 0, Lay.HUB_R + 0.12, 0.22);
    if (this.isSelected(view, F, 0))
      LB.shape(
        MODE.ring,
        F.cx,
        hy,
        0,
        2 * (Lay.HUB_R + 0.16),
        2 * (Lay.HUB_R + 0.16),
        COL.ink,
        a,
        0,
        0,
        1,
        0.03,
        12,
        view.clock * 0.3,
      );
    // small nodes are points where wires meet: one group for all of them
    LB.group(F.cx, hy + 3, 0);
    for (let i = 1; i < n; i++) {
      const al = F.al[i];
      if (al < 0.01 || F.r[i] > Lay.DOT_MAX) continue;
      const w = F.word[i] * al,
        lit = F.lit[i];
      const r = Math.max(0.012, F.r[i] * 1.25);
      if (w > 0.01) {
        const c = this.fade(mix3(COL.goldDeep, COL.gold, lit), F.dim[i] * 0.6 * (1 - lit));
        LB.shape(MODE.fill, X[i], Y[i], 0, 2 * r * (1 + lit), 2 * r * (1 + lit), c, w * a);
      }
      if (lit > 0.01) LB.shape(MODE.glow, X[i], Y[i], 0, 0.5, 0.5, COL.gold, 0.55 * lit * a, 0, 0, 0, r + 0.04, 0.08);
      if (F.glow[i] > 0.01)
        LB.shape(MODE.glow, X[i], Y[i], 0, 0.6, 0.6, COL.cobalt, 0.6 * F.glow[i] * a, 0, 0, 0, r + 0.04, 0.1);
    }
    for (let i = 1; i < n; i++) {
      const al = F.al[i];
      if (al < 0.01 || F.r[i] <= Lay.DOT_MAX) continue;
      const hot = F.glow[i];
      let fill: RGB = COL.ink;
      if (F.seen[i] > 0.01) fill = mix3(fill, COL.cobalt, 0.45 * F.seen[i]);
      if (F.cut[i] > 0.01) fill = mix3(fill, COL.cut, F.cut[i]);
      if (F.fresh[i] > 0.01) fill = mix3(fill, COL.yellow, F.fresh[i] * (1 - hot));
      if (hot > 0.01) fill = mix3(fill, COL.cobalt, hot);
      if (F.doom[i] > 0.01) fill = mix3(fill, COL.red, F.doom[i]);
      const dim = F.dim[i] * (1 - hot) * (1 - F.lit[i] * 0.7);
      fill = this.fade(fill, dim * 0.66 + (1 - a));
      const r = F.r[i] * (0.3 + 0.7 * al) * a;
      const x = X[i],
        y = Y[i];
      kit.disc(x, y, 0, r, fill, cam);
      LB.group(x, y, 0);
      const vis = al * a;
      if (hot > 0.01)
        LB.shape(MODE.glow, x, y, 0, 2 * (r + 0.5), 2 * (r + 0.5), COL.cobalt, 0.5 * hot * vis, 0, 0, 0, r + 0.1, 0.22);
      if (F.lit[i] > 0.01)
        LB.shape(
          MODE.glow,
          x,
          y,
          0,
          2 * (r + 0.5),
          2 * (r + 0.5),
          COL.gold,
          0.55 * F.lit[i] * vis,
          0,
          0,
          0,
          r + 0.12,
          0.2,
        );
      const w = F.word[i];
      if (w > 0.01) {
        const rr = r * 1.22 + 0.035,
          sw = Math.max(0.018, r * 0.16) * (1 + 0.5 * F.lit[i]);
        LB.shape(MODE.ring, x, y, 0, 2 * rr, 2 * rr, this.fade(COL.gold, dim * 0.55), w * vis, 0, 0, 1, sw);
      }
      if (F.r[i] >= Lay.LETTER_MIN) {
        const glyph = mix3(COL.light, COL.ink, F.fresh[i] * (1 - hot));
        LB.text(F.uni.ch[i], x, y, 0, r * 0.95, this.fade(glyph, dim * 0.5), vis);
      }
      if (this.isSelected(view, F, i))
        LB.shape(MODE.ring, x, y, 0, 2 * (r + 0.2), 2 * (r + 0.2), COL.ink, vis, 0, 0, 1, 0.028, 12, view.clock * 0.3);
    }
  }

  private isSelected(view: DrawView, F: FanPose, i: number): boolean {
    return !!view.selected && view.selected.fan === F.key && view.selected.id === F.uni.ids[i];
  }

  /** Where the path ran out: a dashed red slot where the missing letter would have gone. */
  private drawGhost(F: FanPose, X: Float32Array, Y: Float32Array): void {
    const g = F.miss;
    if (!g || g.a < 0.01 || g.node < 0) return;
    const LB = this.labels,
      kit = this.kit;
    const x = Lay.polarX(F.cx, g.th, g.rr),
      y = F.cy + Lay.polarY(g.th, g.rr);
    const px = X[g.node],
      py = Y[g.node];
    const a = g.a * F.a,
      r = 0.26;
    // a dashed wire toward the empty slot
    const N = 7;
    for (let s = 0; s < N; s += 2) {
      const u0 = s / N,
        u1 = (s + 1) / N;
      kit.rod(px + (x - px) * u0, py + (y - py) * u0, 0, px + (x - px) * u1, py + (y - py) * u1, 0, 0.014 * a, COL.red);
    }
    LB.group(x, y, 0);
    LB.shape(MODE.fill, x, y, 0, 2 * r, 2 * r, COL.paper, 0.9 * a);
    LB.shape(MODE.ring, x, y, 0, 2 * r, 2 * r, COL.red, a, 0, 0, 1, 0.035, 10, 0);
    LB.text(g.ch, x, y, 0, r * 0.9, COL.red, a);
  }

  /** Words read out beyond the last ring, each tied to its node by a fine gold line. */
  private drawRim(F: FanPose, X: Float32Array, Y: Float32Array): void {
    const LB = this.labels,
      kit = this.kit;
    for (const l of F.labels) {
      const a = l.a * F.a;
      if (a < 0.01) continue;
      const c = Math.cos(l.th),
        s = Math.sin(l.th);
      const x = F.cx + Lay.RIM * c,
        y = F.cy + Lay.HUB_Y + Lay.RIM * s;
      if (l.node >= 0) {
        const nx = X[l.node],
          ny = Y[l.node];
        const dx = x - nx,
          dy = y - ny,
          d = Math.hypot(dx, dy);
        const r0 = F.r[l.node] * 1.3 + 0.06,
          r1 = Math.min(d, 0.34 + (glyphWidth(l.text, Lay.PILL_H) / 2) * Math.abs(c));
        if (d > r0 + r1 + 0.05)
          kit.rod(
            nx + (dx / d) * r0,
            ny + (dy / d) * r0,
            -0.01,
            x - (dx / d) * r1,
            y - (dy / d) * r1,
            -0.01,
            0.009 * a,
            this.fade(COL.goldDeep, 1 - a),
          );
      }
      LB.group(x, y, 0.05);
      LB.pill(x, y, 0.05, l.text, Lay.PILL_H, 0, 0, COL.paper, COL.gold, 0.035, COL.ink, a);
    }
  }

  /** Sparks running along wires, rings widening round a node, a spell check's sweep. */
  private drawFx(F: FanPose, X: Float32Array, Y: Float32Array): void {
    const LB = this.labels,
      kit = this.kit;
    const tone = (t: 'cobalt' | 'red' | 'gold') => (t === 'red' ? COL.red : t === 'gold' ? COL.gold : COL.cobalt);
    for (const s of F.sparks) {
      if (s.a < 0.01) continue;
      let tx: number, ty: number;
      if (s.to >= 0) {
        tx = X[s.to];
        ty = Y[s.to];
      } else if (F.miss) {
        tx = Lay.polarX(F.cx, F.miss.th, F.miss.rr);
        ty = F.cy + Lay.polarY(F.miss.th, F.miss.rr);
      } else continue;
      const x = X[s.from] + (tx - X[s.from]) * s.s,
        y = Y[s.from] + (ty - Y[s.from]) * s.s;
      kit.ball(x, y, 0.06, 0.1 * s.a, tone(s.tone));
      LB.group(x, y, 0.06);
      LB.shape(MODE.glow, x, y, 0.06, 1.2, 1.2, tone(s.tone), 0.6 * s.a, 0, 0, 0, 0.12, 0.2);
    }
    for (const p of F.pulses) {
      if (p.a < 0.01) continue;
      const x = p.node === 0 ? F.cx : X[p.node],
        y = p.node === 0 ? F.cy + Lay.HUB_Y : Y[p.node];
      const r = (p.node === 0 ? Lay.HUB_R : F.r[p.node]) + 0.08 + 0.75 * p.s;
      LB.group(x, y, 0);
      LB.shape(MODE.ring, x, y, 0, 2 * r, 2 * r, tone(p.tone), p.a * (1 - p.s), 0, 0, 1, 0.05);
    }
    if (F.ripple && F.ripple.a > 0.01) {
      const rr = F.ripple.rr,
        N = 40;
      let px = F.cx + rr,
        py = F.cy + Lay.HUB_Y;
      for (let s = 1; s <= N; s++) {
        const th = (s / N) * Math.PI;
        const x = F.cx + rr * Math.cos(th),
          y = F.cy + Lay.HUB_Y + rr * Math.sin(th);
        kit.rod(px, py, -0.03, x, y, -0.03, 0.03 * F.ripple.a, mix3(COL.back, COL.cobalt, F.ripple.a));
        px = x;
        py = y;
      }
    }
  }

  /**
   * Memory: behind every node, its 26 slots in a row, A at the front. The slots
   * that hold a child are ink (cobalt on the path); the rest are empty, and there
   * are far more of those.
   */
  private drawSlots(F: FanPose, X: Float32Array, Y: Float32Array, mem: number): void {
    const n = F.uni.ids.length,
      a = F.a * mem;
    const used = new Uint32Array(n);
    for (let i = 1; i < n; i++) {
      const p = F.up[i];
      if (p >= 0 && F.al[i] > 0.5) used[p] |= 1 << slotOf(F.uni.ch[i]);
    }
    const LB = this.labels;
    for (let i = 0; i < n; i++) {
      const al = F.al[i];
      if (al < 0.5) continue;
      const r = i === 0 ? 0.3 : F.r[i];
      const cell = Lay.cellOf(r) * Math.min(1, mem * 1.4);
      const x = i === 0 ? F.cx : X[i],
        y = i === 0 ? F.cy + Lay.HUB_Y : Y[i];
      const z0 = -(i === 0 ? 0.16 : Lay.STRIP_GAP + 0.07);
      const len = Lay.SLOT_ROWS * cell * mem;
      const dim = F.dim[i] * 0.6;
      const bits = used[i];
      const big = cell >= 0.07;
      // the empty slots: one by one where there is room to see them, else the whole row as a bar
      const empty = this.fade(COL.slotEdge, dim + (1 - a));
      if (cell >= 0.045)
        for (let s = 0; s < Lay.SLOT_ROWS; s++) {
          if (bits & (1 << s)) continue;
          this.box(x, y - cell * 0.18, z0 - (s + 0.5) * cell * mem, cell * 0.8, cell * 0.36, cell * 0.78 * mem, empty);
        }
      else this.box(x, y, z0 - len / 2, cell * 0.92, cell * 0.5, len, empty);
      if (!bits) continue;
      for (let s = 0; s < Lay.SLOT_ROWS; s++) {
        if (!(bits & (1 << s))) continue;
        const z = z0 - (s + 0.5) * cell * mem;
        const onPath = F.path[i] > 0.5;
        const c = this.fade(onPath ? COL.cobalt : COL.ink, dim + (1 - a));
        this.box(x, y, z, cell * 0.96, cell * 0.96, cell * 0.8 * mem, c);
        if (big && mem > 0.6) {
          LB.group(x, y + cell * 0.9, z);
          LB.text(String.fromCharCode(65 + s), x, y + cell * 0.95, z, cell * 0.9, COL.ink, (mem - 0.6) * 2.5 * a);
        }
      }
    }
  }

  private box(x: number, y: number, z: number, w: number, h: number, d: number, col: RGB): void {
    this._q.identity();
    this._p.set(x, y, z);
    this._s.set(w, h, d);
    this.boxes.add(this._m.compose(this._p, this._q, this._s), col);
  }

  /** The plate under the baseline, left of the centre: how many words, and how many nodes they took. */
  private drawPlate(F: FanPose): void {
    const LB = this.labels;
    let nodes = 0;
    for (let i = 1; i < F.al.length; i++) if (F.al[i] > 0.5) nodes++;
    const words = F.dict.words.length;
    const x = F.cx - Lay.ringR(4),
      y = F.cy + Lay.HUB_Y - 0.3,
      z = 0.12;
    const h = 0.24,
      a = F.a;
    const top = `${words} WORDS`,
      bottom = `${nodes} NODES`;
    const gap = h * 1.1;
    const wt = glyphWidth(top, h),
      wb = glyphWidth(bottom, h);
    const w = wt + gap + wb;
    LB.group(x, y, z);
    LB.text(top, x, y, z, h, COL.ink, a, -w / 2 + wt / 2, 0);
    LB.shape(MODE.fill, x, y, z, h * 0.26, h * 0.26, COL.goldDeep, a, -w / 2 + wt + gap / 2, 0);
    LB.text(bottom, x, y, z, h, COL.graphite, a, w / 2 - wb / 2, 0);
  }

  /* ---------- callout, picking, camera ---------- */

  /** The point the callout hangs over: just above its node. */
  calloutAnchor(): Lay.P3 | null {
    const P = this.pose,
      c = P?.callout;
    if (!P || !c) return null;
    const F = P.fans[c.fan],
      X = this.xs[c.fan],
      Y = this.ys[c.fan];
    if (!F || !X) return null;
    const r = c.node === 0 ? Lay.HUB_R : F.r[c.node];
    return { x: X[c.node], y: Y[c.node] + r + 0.22, z: 0 };
  }

  /** Where the light is in a pose worth leaning the camera toward, if anywhere: one sunburst only. */
  focusOf(P: Pose): { x: number; y: number; w: number; zoom: number } | null {
    if (P.fans.length !== 1) return null;
    const F = P.fans[0];
    let best = -1,
      v = 0.5;
    for (let i = 1; i < F.glow.length; i++)
      if (F.glow[i] > v) {
        v = F.glow[i];
        best = i;
      }
    if (best < 0) return null;
    const x = Lay.polarX(F.cx, F.th[best], F.rr[best]),
      y = F.cy + Lay.polarY(F.th[best], F.rr[best]);
    return { x: (x + F.cx) / 2, y: (y + F.cy + Lay.HUB_Y + 2) / 2, w: 0.7, zoom: 0.16 };
  }

  /** The nearest node under a screen point, if any disc is big enough to hit. */
  pick(sx: number, sy: number): { fan: string; id: string } | null {
    const P = this.pose;
    if (!P) return null;
    let best: { fan: string; id: string } | null = null,
      bd = Infinity;
    P.fans.forEach((F, k) => {
      if (F.a < 0.5) return;
      const X = this.xs[k],
        Y = this.ys[k];
      for (let i = 0; i < F.al.length; i++) {
        if (F.al[i] < 0.5) continue;
        const r = i === 0 ? Lay.HUB_R : Math.max(F.r[i], 0.05);
        const c = this.toScreen(X[i], Y[i], 0);
        if (!c) continue;
        const e = this.toScreen(X[i] + this.camRight.x * r, Y[i] + this.camRight.y * r, this.camRight.z * r);
        if (!e) continue;
        const pr = Math.hypot(e.x - c.x, e.y - c.y),
          d = Math.hypot(sx - c.x, sy - c.y);
        if (d < pr + 5 && d < bd) {
          bd = d;
          best = { fan: F.key, id: F.uni.ids[i] };
        }
      }
    });
    return best;
  }

  /** Screen position of a node, by sunburst key and id. */
  nodeScreen(fan: string, id: string): { x: number; y: number } | null {
    const P = this.pose;
    if (!P) return null;
    const k = P.fans.findIndex(F => F.key === fan);
    if (k < 0) return null;
    const i = P.fans[k].uni.index.get(id);
    if (i == null || !this.xs[k]) return null;
    return this.toScreen(this.xs[k][i], this.ys[k][i], 0);
  }

  /** Where a node stands this frame. */
  nodeWorld(fan: string, id: string): NodeWorld | null {
    const P = this.pose;
    if (!P) return null;
    const k = P.fans.findIndex(F => F.key === fan);
    const i = k >= 0 ? P.fans[k].uni.index.get(id) : undefined;
    if (i == null || !this.xs[k]) return null;
    return { x: this.xs[k][i], y: this.ys[k][i], z: 0, r: P.fans[k].r[i], fan, id };
  }

  /**
   * The extent of everything worth keeping on screen, measured across and up the
   * current view, from a pose (so the page can frame where a step will come to rest).
   */
  frameBox(P: Pose, mem: number): FrameBox {
    const pts: [number, number, number][] = [];
    const shown = P.fans.filter(F => F.a >= 0.3),
      fans = shown.length ? shown : P.fans;
    const back = -(Lay.STRIP_GAP + Lay.SLOT_ROWS * 0.16) * mem;
    for (const F of fans) {
      const w = Lay.HALF_W;
      const hy = F.cy + Lay.HUB_Y;
      pts.push(
        [F.cx - w, F.cy, 0],
        [F.cx + w, F.cy, 0],
        [F.cx, hy + Lay.RIM + 0.5, 0],
        [F.cx - w * 0.7, hy + Lay.RIM * 0.72, 0],
        [F.cx + w * 0.7, hy + Lay.RIM * 0.72, 0],
      );
      if (F.cy < 0.01) pts.push([F.cx - w, -Lay.PH, Lay.PLINTH_Z1], [F.cx + w, -Lay.PH, Lay.PLINTH_Z1]);
      if (mem > 0.01)
        pts.push([F.cx, hy + Lay.RIM * 0.8, back], [F.cx - w * 0.8, hy + 1, back], [F.cx + w * 0.8, hy + 1, back]);
    }
    const c = [0, 3.5, 0];
    let r0 = Infinity,
      r1 = -Infinity,
      u0 = Infinity,
      u1 = -Infinity,
      f1 = 0;
    for (const p of pts) {
      this._v.set(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      const r = this._v.dot(this.camRight),
        u = this._v.dot(this.camUp),
        f = this._v.dot(this.camBack);
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      f1 = Math.max(f1, f);
    }
    const mr = (r0 + r1) / 2,
      mu = (u0 + u1) / 2,
      cr = this.camRight,
      cu = this.camUp;
    return {
      cx: c[0] + cr.x * mr + cu.x * mu,
      cy: c[1] + cr.y * mr + cu.y * mu,
      cz: c[2] + cr.z * mr + cu.z * mu,
      hw: Math.max(4, (r1 - r0) / 2 + 0.2),
      hh: Math.max(3, (u1 - u0) / 2 + 0.2),
      depth: f1 * 0.1,
    };
  }

  /** The key light and its shadow camera follow the plinth. */
  fitLights(): void {
    const { key, pool, KEY_DIR } = this.stage;
    const P = this.pose;
    const cx = P ? (P.x0 + P.x1) / 2 : 0;
    const half = P ? (P.x1 - P.x0) / 2 + 4 : 12;
    key.target.position.set(cx, 3, 0);
    key.position.copy(key.target.position).addScaledVector(KEY_DIR, 44);
    const sc = key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 4;
    sc.far = 110;
    sc.updateProjectionMatrix();
    pool.position.set(cx - 2, 30, 14);
    pool.target.position.set(cx, 2, 0);
    pool.angle = Math.min(1.1, Math.atan((half + 2) / 30));
  }
}
