// The Hash Clock scene: a round plinth on a plaster floor, a hub with a clock hand,
// rings of buckets with their hours printed round them, keys stacked in chains or
// standing in slots, chain pointers as wires, tombstones, and a load gauge beside
// it all. draw() renders any Pose. Pointers name what they point at; the scene
// finds those things each frame, so a wire never comes loose from its key.

import * as THREE from 'three';
import { mix3, type RGB } from '../../core/color';
import { InstancedBatch, WireKit } from '../../core/instances';
import { LabelBatch, MODE } from '../../core/labels';
import { clamp01, lerp } from '../../core/math';
import { createStage, plasterTexture, type FrameBox, type Stage } from '../../core/stage';
import { fmtLoad } from './ops';
import * as Lay from './layout';
import { COL } from './palette';
import type { LinkPose, Pose, RingPose } from './poses';
import { MAX_LOAD } from './table';

const UP = new THREE.Vector3(0, 1, 0);

/** Interaction state the scene needs to draw, owned by the page. */
export interface DrawView {
  /** The disc being inspected. */
  selected: string | null;
  clock: number;
}

interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Where a disc was drawn this frame. */
export interface ItemWorld extends V3 {
  r: number;
  key: string;
}

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

export class HashScene {
  readonly stage: Stage;
  /** Where each disc was drawn this frame, by item key. */
  readonly itemWorld = new Map<string, ItemWorld>();
  private readonly plinth: THREE.Mesh;
  private readonly hub: THREE.Mesh;
  private readonly kit: WireKit;
  private readonly boxes: InstancedBatch;
  private readonly labels: LabelBatch;
  private readonly camUp = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly camBack = new THREE.Vector3();
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();
  private readonly _v = new THREE.Vector3();
  private readonly arc: V3[] = Array.from({ length: 13 }, () => v3(0, 0, 0));
  private pose: Pose | null = null;
  private plinthR = 5;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage({
      canvas,
      background: 0xe2dacb,
      keyDir: [-0.45, 1, 0.5],
      cameraPos: [-2, 14, 18],
      target: [0, 0.8, 0],
      controls: {
        minPolarAngle: 0.2,
        maxPolarAngle: 1.48,
        minAzimuthAngle: -Infinity,
        maxAzimuthAngle: Infinity,
        minDistance: 5,
        maxDistance: 120,
      },
    });
    const { scene } = this.stage;
    scene.fog = new THREE.Fog(0xe2dacb, 120, 300);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({
        map: plasterTexture({ base: '#DCD3C3', repeat: [26, 26], seed: 31 }),
        roughness: 0.97,
        metalness: 0,
        envMapIntensity: 0.3,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -Lay.PH;
    floor.receiveShadow = true;
    scene.add(floor);
    const paper = (color: number, roughness = 0.88) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, envMapIntensity: 0.5 });
    this.plinth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128), paper(0xf7f3eb));
    this.plinth.castShadow = true;
    this.plinth.receiveShadow = true;
    scene.add(this.plinth);
    this.hub = new THREE.Mesh(
      new THREE.CylinderGeometry(Lay.HUB_R, Lay.HUB_R * 1.04, Lay.HUB_H, 64),
      paper(0xefe9dd, 0.8),
    );
    this.hub.position.y = Lay.HUB_H / 2;
    this.hub.castShadow = true;
    this.hub.receiveShadow = true;
    scene.add(this.hub);
    const tuned: Record<'rod' | 'ball' | 'cone' | 'disc', THREE.MeshStandardMaterialParameters> = {
      disc: { roughness: 0.72, metalness: 0, envMapIntensity: 0.4 },
      rod: { roughness: 0.42, metalness: 0.25 },
      ball: { roughness: 0.4, metalness: 0.15 },
      cone: { roughness: 0.45, metalness: 0.1 },
    };
    this.kit = new WireKit(scene, {
      material: kind =>
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.45,
          metalness: 0.08,
          envMapIntensity: 0.55,
          ...tuned[kind],
        }),
      discRadius: Lay.R,
      max: { discs: 80, rods: 3000, balls: 900, cones: 120 },
    });
    this.boxes = new InstancedBatch(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.45 }),
      120,
    );
    this.boxes.mesh.receiveShadow = true;
    this.labels = new LabelBatch(scene);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.stage.camera;
  }

  render(): void {
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  counts(): { rods: number; discs: number; cones: number; labels: number; boxes: number } {
    return {
      rods: this.kit.rods.n,
      discs: this.kit.discs.n,
      cones: this.kit.cones.n,
      labels: this.labels.count,
      boxes: this.boxes.n,
    };
  }

  /* ---------- resolving references ---------- */

  private ringOf(key: string): RingPose | undefined {
    return this.pose?.rings.get(key);
  }

  /** The centre of a bucket's top face. */
  private bucketTop(ring: string, index: number): V3 | null {
    const r = this.ringOf(ring);
    if (!r) return null;
    const ang = (index / r.m) * Math.PI * 2;
    return v3(r.r * Math.sin(ang), Lay.CELL_H * r.a, -r.r * Math.cos(ang));
  }

  /** The centre of the disc, bucket, tombstone or gauge a reference names, as drawn this frame. */
  private refPos(ref: string | null): V3 | null {
    if (ref == null || !this.pose) return null;
    const it = this.itemWorld.get(ref);
    if (it) return it;
    const parts = ref.split(':');
    if (parts[0] === 'b') return this.bucketTop(parts[1], Number(parts[2]));
    if (parts[0] === 'x') {
      const b = this.bucketTop(parts[1], Number(parts[2]));
      return b ? v3(b.x, Lay.SLOT_Y, b.z) : null;
    }
    if (ref === 'gauge') {
      const g = Lay.gaugeAt(this.plinthR);
      return v3(g.x, Lay.GAUGE_H * 0.8 - Lay.PH, g.z);
    }
    if (ref === 'hub') return v3(0, Lay.HUB_Y, 0);
    return null;
  }

  /** Screen position (CSS px) of a disc, bucket or tombstone, or null if it is not on screen. */
  refScreen(ref: string): { x: number; y: number } | null {
    const p = this.refPos(ref);
    return p ? this.toScreen(p.x, p.y, p.z) : null;
  }

  toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    this._v.set(x, y, z).project(this.camera);
    if (this._v.z > 1) return null;
    return { x: ((this._v.x + 1) / 2) * innerWidth, y: ((1 - this._v.y) / 2) * innerHeight };
  }

  /** Where a callout for this reference should sit. */
  anchorOf(ref: string): (V3 & { r: number }) | null {
    const p = this.refPos(ref);
    if (!p) return null;
    const it = this.itemWorld.get(ref);
    return { ...p, r: it ? it.r : ref === 'gauge' ? Lay.GAUGE_W : Lay.R };
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
    this.itemWorld.clear();
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camBack);

    this.plinthR = P.plinthR;
    this.plinth.position.set(0, -Lay.PH / 2, 0);
    this.plinth.scale.set(P.plinthR, Lay.PH, P.plinthR);
    // the rim of the clock face, engraved just inside the plinth's edge
    LB.group(0, 0.005, 0);
    LB.shape(
      MODE.ring,
      0,
      0.004,
      0,
      2 * (P.plinthR - 0.25),
      2 * (P.plinthR - 0.25),
      COL.ink,
      0.22,
      0,
      0,
      1,
      0.025,
      0,
      0,
      1,
    );

    for (const r of P.rings.values()) this.drawRing(r, P);
    this.drawHub(P);
    this.drawGauge(P);

    // discs first, so pointers and labels can find them
    for (const it of P.items.values()) {
      if (it.s < 0.01) continue;
      const s = it.s,
        r = Lay.R * s;
      this.itemWorld.set(it.key, { x: it.x, y: it.y, z: it.z, r, key: it.key });
      kit.disc(it.x, it.y, it.z, s, it.fill, camera.quaternion);
      LB.group(it.x, it.y, it.z);
      if (it.halo > 0.01)
        LB.shape(
          MODE.glow,
          it.x,
          it.y,
          it.z,
          2 * (r + 0.5),
          2 * (r + 0.5),
          COL.cobalt,
          0.32 * it.halo * (0.85 + 0.15 * Math.sin(view.clock * 4)),
          0,
          0,
          0,
          r + 0.16,
          0.2,
        );
      LB.shape(MODE.ring, it.x, it.y, it.z, 2 * r, 2 * r, it.rim, 1, 0, 0, 1, it.rimW * s);
      LB.text(it.label, it.x, it.y, it.z, (it.label.length > 1 ? 0.3 : 0.36) * s, it.glyph, 1);
      if (view.selected === it.key)
        LB.shape(MODE.ring, it.x, it.y, it.z, 2 * (r + 0.12), 2 * (r + 0.12), COL.cobalt, 1, 0, 0, 1, 0.04);
    }
    for (const t of P.tombs.values()) this.drawTomb(t.ring, t.index, t.a);
    for (const l of P.links.values()) this.drawLink(l);
    for (const b of P.beads) {
      if (b.a < 0.01) continue;
      const p = this.linkPoint(b.link, b.u);
      if (p) kit.ball(p.x, p.y, p.z, b.r * Math.min(1, b.a * 1.5), b.col);
    }
    for (const rp of P.ripples) {
      const p = this.refPos(rp.at);
      if (!p || rp.a < 0.01) continue;
      const y = rp.at === 'gauge' ? 0.02 - Lay.PH : 0.02;
      LB.group(p.x, y, p.z);
      LB.shape(MODE.ring, p.x, y, p.z, 2 * rp.r, 2 * rp.r, rp.col, rp.a, 0, 0, 1, 0.04, 0, 0, 1);
    }
    kit.end();
    this.boxes.end();
    LB.end(camera);
  }

  private box(x: number, y: number, z: number, w: number, h: number, d: number, rot: number, col: RGB): void {
    this._q.setFromAxisAngle(UP, rot);
    this._p.set(x, y, z);
    this._s.set(w, h, d);
    this.boxes.add(this._m.compose(this._p, this._q, this._s), col);
  }

  /** A ring of buckets: the cells, their hours, and the spokes from the hub. */
  private drawRing(ring: RingPose, P: Pose): void {
    const a = ring.a;
    if (a < 0.01) return;
    const LB = this.labels,
      kit = this.kit;
    const live = ring.live,
      small = ring.m > 16;
    // the hours are printed inside the ring, at the end of each spoke, where no bucket hides them
    const nr = Lay.numeralRadius(ring.m);
    const inner = Lay.HUB_R + 0.12,
      outer = nr - (small ? 0.26 : 0.32);
    const h = Math.max(0.01, Lay.CELL_H * a);
    for (let i = 0; i < ring.m; i++) {
      const ang = (i / ring.m) * Math.PI * 2,
        sx = Math.sin(ang),
        cz = -Math.cos(ang);
      const x = ring.r * sx,
        z = ring.r * cz;
      const used = ring.used[i] ?? 0;
      this.box(
        x,
        h / 2,
        z,
        Lay.CELL_W * (0.6 + 0.4 * a) * (small ? 0.94 : 1),
        h,
        Lay.CELL_D * (0.6 + 0.4 * a),
        -ang,
        mix3(mix3(COL.paper, COL.faint, 0.26), COL.cell, used),
      );
      // the spoke from the hub: every bucket is the same distance away
      if (live > 0.02 && outer > inner)
        kit.rod(inner * sx, 0.012, inner * cz, outer * sx, 0.012, outer * cz, 0.012 * a * live, COL.spoke);
      LB.group(nr * sx, 0.01, nr * cz);
      LB.text(String(i), nr * sx, 0.012, nr * cz, small ? 0.22 : 0.27, COL.ink, (0.35 + 0.55 * live) * a, 0, 0, 1);
    }
    if (P.strategy === 'probe' && live > 0.5) this.drawRuns(ring);
    for (const l of P.lits.values()) {
      if (l.ring !== ring.key || l.a < 0.01) continue;
      const ang = (l.index / ring.m) * Math.PI * 2,
        sx = Math.sin(ang),
        cz = -Math.cos(ang);
      kit.rod(
        inner * sx,
        0.02,
        inner * cz,
        outer * sx,
        0.02,
        outer * cz,
        0.035 * l.a,
        mix3(COL.spoke, COL.cobalt, l.a),
      );
      kit.cone(outer * sx, 0.02, outer * cz, sx, 0, cz, 0.08 * l.a, 0.22, COL.cobalt);
    }
  }

  /**
   * Probing: a bracket along the outer edge of every run of three or more full
   * slots (keys or tombstones). A key that lands anywhere in a run walks to its end.
   */
  private drawRuns(ring: RingPose): void {
    const m = ring.m,
      full = (i: number) => (ring.used[((i % m) + m) % m] ?? 0) > 0.5;
    if (!full(0) || [...Array(m).keys()].some(i => !full(i))) {
      // start just after an empty slot, so no run is split by the wrap from m − 1 to 0
      let s = 0;
      while (full(s) && s < m) s++;
      const kit = this.kit,
        LB = this.labels,
        pitch = (Math.PI * 2) / m;
      const rr = ring.r + Lay.CELL_D / 2 + 0.08,
        y = Lay.CELL_H * ring.a + 0.05;
      for (let j = 0; j < m;) {
        const i = s + j;
        if (!full(i)) {
          j++;
          continue;
        }
        let len = 0;
        while (len < m && full(i + len)) len++;
        j += len;
        if (len < 3) continue;
        const a0 = (i - 0.42) * pitch,
          a1 = (i + len - 1 + 0.42) * pitch,
          n = Math.max(4, len * 4);
        let px = rr * Math.sin(a0),
          pz = -rr * Math.cos(a0);
        for (let k = 1; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n,
            x = rr * Math.sin(a),
            z = -rr * Math.cos(a);
          kit.rod(px, y, pz, x, y, z, 0.022, COL.graphite);
          px = x;
          pz = z;
        }
        for (const a of [a0, a1])
          kit.rod(
            rr * Math.sin(a),
            y,
            -rr * Math.cos(a),
            (rr - 0.22) * Math.sin(a),
            y,
            -(rr - 0.22) * Math.cos(a),
            0.022,
            COL.graphite,
          );
        const mid = (a0 + a1) / 2,
          lr = rr + 0.42;
        LB.group(lr * Math.sin(mid), y + 0.2, -lr * Math.cos(mid));
        LB.pill(
          lr * Math.sin(mid),
          y + 0.2,
          -lr * Math.cos(mid),
          `RUN ${len}`,
          0.15,
          0,
          0,
          COL.paper,
          COL.graphite,
          0.012,
          COL.graphite,
          0.95,
        );
      }
    }
  }

  /** The hub: the hours of the live ring round its top edge, and the hand. */
  private drawHub(P: Pose): void {
    const kit = this.kit,
      LB = this.labels;
    const top = Lay.HUB_H + 0.004;
    LB.group(0, top, 0);
    LB.shape(
      MODE.ring,
      0,
      top,
      0,
      2 * (Lay.HUB_R - 0.03),
      2 * (Lay.HUB_R - 0.03),
      COL.ink,
      0.8,
      0,
      0,
      1,
      0.02,
      0,
      0,
      1,
    );
    for (const r of P.rings.values()) {
      const w = r.a * r.live;
      if (w < 0.02) continue;
      for (let i = 0; i < r.m; i++) {
        const ang = (i / r.m) * Math.PI * 2,
          sx = Math.sin(ang),
          cz = -Math.cos(ang);
        const r0 = Lay.HUB_R - (i === 0 ? 0.26 : 0.17),
          r1 = Lay.HUB_R - 0.06;
        kit.rod(r0 * sx, top, r0 * cz, r1 * sx, top, r1 * cz, 0.016 * w, COL.ink);
      }
    }
    // the hand, with a short tail and a cap on the pivot
    const { ang, len } = P.hand,
      sx = Math.sin(ang),
      cz = -Math.cos(ang),
      y = Lay.HAND_Y;
    kit.rod(-0.32 * sx, y, -0.32 * cz, (len - 0.2) * sx, y, (len - 0.2) * cz, 0.042, COL.ink);
    kit.cone(len * sx, y, len * cz, sx, 0, cz, 0.12, 0.34, COL.ink);
    kit.ball(0, y, 0, 0.11, COL.ink);
    kit.ball(-0.32 * sx, y, -0.32 * cz, 0.07, COL.ink);
    // a thin stalk carries a key waiting on the hub
    for (const it of P.items.values())
      if (it.s > 0.01 && Math.hypot(it.x, it.z) < 0.05 && it.y > y + 0.2)
        kit.rod(0, y, 0, 0, it.y - Lay.R * it.s, 0, 0.018 * it.s, COL.ink);
  }

  /** The load gauge: a column that fills to α = n / m, with a red collar at ¾. */
  private drawGauge(P: Pose): void {
    const g = Lay.gaugeAt(P.plinthR),
      LB = this.labels;
    const H = Lay.GAUGE_H,
      W = Lay.GAUGE_W,
      base = -Lay.PH;
    const load = P.gauge.load,
      over = load > MAX_LOAD + 1e-9;
    const fill = Math.min(1, load) * H;
    const flash = P.gauge.flash;
    const col = mix3(over ? COL.red : COL.cobalt, COL.white, 0.35 * flash);
    this.box(g.x, base + 0.06, g.z, W + 0.5, 0.12, W + 0.5, 0, COL.paper);
    if (fill > 0.005) this.box(g.x, base + 0.12 + fill / 2, g.z, W, fill, W, 0, col);
    if (H - fill > 0.005)
      this.box(
        g.x,
        base + 0.12 + fill + (H - fill) / 2,
        g.z,
        W * 0.94,
        H - fill,
        W * 0.94,
        0,
        mix3(COL.paper, COL.faint, 0.18),
      );
    // the threshold collar at three quarters, and a cap
    const ty = base + 0.12 + MAX_LOAD * H;
    this.box(g.x, ty, g.z, W + 0.2, 0.05, W + 0.2, 0, COL.red);
    this.box(g.x, base + 0.12 + H + 0.03, g.z, W + 0.1, 0.06, W + 0.1, 0, COL.ink);
    const lx = g.x,
      ly = base + 0.12 + H + 0.95,
      lz = g.z;
    LB.group(lx, ly, lz);
    LB.text('LOAD', lx, ly + 0.46, lz, 0.17, COL.graphite, 1);
    LB.text(fmtLoad(P.gauge.n, P.gauge.m), lx, ly, lz, 0.36, over ? COL.red : COL.ink, 1);
    LB.text(`${P.gauge.n}/${P.gauge.m}`, lx, ly - 0.42, lz, 0.19, COL.graphite, 1);
    // the collar's value, beside it
    LB.group(lx, ty, lz);
    LB.text('.75', lx, ty, lz, 0.15, COL.red, 0.9, W / 2 + 0.34, 0);
  }

  private drawTomb(ring: string, index: number, a: number): void {
    if (a < 0.01) return;
    const b = this.bucketTop(ring, index);
    if (!b) return;
    const y = Lay.SLOT_Y,
      LB = this.labels;
    LB.group(b.x, y, b.z);
    LB.shape(MODE.ring, b.x, y, b.z, 2 * Lay.R, 2 * Lay.R, COL.red, 0.8 * a, 0, 0, 1, 0.03, 12, 0);
    LB.text('DEL', b.x, y, b.z, 0.16, COL.red, 0.9 * a);
  }

  /* ---------- chain pointers ---------- */

  /** Where a pointer leaves a disc (or a bucket), and where it arrives: on the side facing the camera's right. */
  private linkEnd(ref: string, arriving: boolean): V3 | null {
    const it = this.itemWorld.get(ref),
      R = this.camRight;
    if (it) {
      const d = it.r + Lay.KNOB * 0.6;
      return v3(it.x + R.x * d, it.y + (arriving ? -0.12 : 0.12) * (it.r / Lay.R), it.z + R.z * d);
    }
    const p = this.refPos(ref);
    return p ? v3(p.x + R.x * 0.3, p.y + 0.01, p.z + R.z * 0.3) : null;
  }

  /** Fill this.arc with points along a pointer; returns the number of segments. */
  private linkArc(l: LinkPose): number {
    const o = this.linkEnd(l.from, false);
    if (!o) return 0;
    const tNew = this.linkEnd(l.to, true);
    let t = tNew;
    if (l.k < 1 && l.was !== l.to) {
      const tOld = this.linkEnd(l.was, true);
      if (tOld && tNew) t = v3(lerp(tOld.x, tNew.x, l.k), lerp(tOld.y, tNew.y, l.k), lerp(tOld.z, tNew.z, l.k));
    }
    if (!t) return 0;
    const R = this.camRight,
      d = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z) || 1;
    const bow = Math.min(0.7, 0.18 + 0.16 * d);
    const n = 12;
    for (let k = 0; k <= n; k++) {
      const u = k / n,
        b = 4 * bow * u * (1 - u);
      const p = this.arc[k];
      p.x = o.x + (t.x - o.x) * u + R.x * b;
      p.y = o.y + (t.y - o.y) * u;
      p.z = o.z + (t.z - o.z) * u + R.z * b;
    }
    return n;
  }

  /** A point part-way along a pointer, for beads. */
  private linkPoint(key: string, u: number): V3 | null {
    const l = this.pose?.links.get(key);
    if (!l) return null;
    const n = this.linkArc(l);
    if (!n) return null;
    const f = clamp01(u) * n,
      k = Math.min(n - 1, Math.floor(f)),
      r = f - k;
    const A = this.arc[k],
      B = this.arc[k + 1];
    return v3(lerp(A.x, B.x, r), lerp(A.y, B.y, r), lerp(A.z, B.z, r));
  }

  private drawLink(l: LinkPose): void {
    if (l.s < 0.01) return;
    const n = this.linkArc(l);
    if (!n) return;
    const kit = this.kit,
      A = this.arc;
    const col = mix3(COL.ink, COL.cobalt, Math.max(l.hot, 0.85 * l.trail));
    const r = (0.02 + 0.012 * l.hot) * Math.min(1, l.s * 1.5);
    // drawn from the origin outward, so a new pointer grows toward its key
    const upto = n * clamp01(l.s);
    for (let k = 0; k < n && k < upto; k++) {
      const f = Math.min(1, upto - k);
      kit.rod(
        A[k].x,
        A[k].y,
        A[k].z,
        lerp(A[k].x, A[k + 1].x, f),
        lerp(A[k].y, A[k + 1].y, f),
        lerp(A[k].z, A[k + 1].z, f),
        r,
        col,
      );
      if (k > 0) kit.ball(A[k].x, A[k].y, A[k].z, r, col);
    }
    kit.ball(A[0].x, A[0].y, A[0].z, Lay.KNOB * Math.min(1, l.s * 2), COL.ink);
    if (l.s < 0.98) return;
    const P1 = A[n],
      P0 = A[n - 1];
    const dx = P1.x - P0.x,
      dy = P1.y - P0.y,
      dz = P1.z - P0.z,
      L = Math.hypot(dx, dy, dz) || 1;
    const back = Lay.KNOB * 0.5;
    kit.cone(P1.x - (dx / L) * back, P1.y - (dy / L) * back, P1.z - (dz / L) * back, dx, dy, dz, 0.07, 0.2, col);
  }

  /* ---------- camera and lights ---------- */

  /**
   * The extent of everything worth keeping on screen, measured across and up the
   * current view. Worked out from a pose, so the page can frame where a step will
   * come to rest rather than chase it.
   */
  frameBox(P: Pose): FrameBox {
    const pts: [number, number, number][] = [];
    const R = P.plinthR;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      pts.push([R * Math.sin(a), 0, -R * Math.cos(a)], [R * Math.sin(a), -Lay.PH, -R * Math.cos(a)]);
    }
    let top = 1.6;
    for (const it of P.items.values()) {
      if (it.s < 0.05) continue;
      pts.push([it.x, it.y + Lay.R + 0.2, it.z]);
      top = Math.max(top, it.y + Lay.R);
    }
    const g = Lay.gaugeAt(R),
      gt = Lay.GAUGE_H + 1.9 - Lay.PH;
    pts.push([g.x + 0.75, gt, g.z], [g.x - 0.75, gt, g.z], [g.x, -Lay.PH, g.z + 0.6]);
    pts.push([0, top, 0]);
    const c = [0, 0.8, 0];
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
      hw: Math.max(3, (r1 - r0) / 2 + 0.3),
      hh: Math.max(2, (u1 - u0) / 2 + 0.25),
      depth: f1 * 0.2,
    };
  }

  /** The key light and its shadow camera follow the plinth. */
  fitLights(): void {
    const { key, pool, KEY_DIR } = this.stage;
    const half = this.plinthR + 4;
    key.target.position.set(0, 0, 0);
    key.position.copy(key.target.position).addScaledVector(KEY_DIR, 40);
    const sc = key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 4;
    sc.far = 90;
    sc.updateProjectionMatrix();
    pool.position.set(-2, 26, 12);
    pool.target.position.set(0, 0, 0);
    pool.angle = Math.min(1.1, Math.atan((half + 2) / 28));
  }

  /** The camera's right vector this frame. */
  get right(): THREE.Vector3 {
    return this.camRight;
  }
}
