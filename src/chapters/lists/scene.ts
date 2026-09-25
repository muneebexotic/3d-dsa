// The Pointer Chain scene: a plinth on a plaster floor, discs on pegs, wire
// pointers with arrowheads, cells, a tray, and named pointers on stalks. draw()
// renders any Pose. Pointers name what they point at; the scene finds those
// things each frame, so a wire never comes loose from its node.

import * as THREE from 'three';
import { mix3, type RGB } from '../../core/color';
import { glyphWidth } from '../../core/glyphs';
import { InstancedBatch, WireKit } from '../../core/instances';
import { LabelBatch, MODE } from '../../core/labels';
import { clamp01, lerp } from '../../core/math';
import { createStage, plasterTexture, type FrameBox, type Stage } from '../../core/stage';
import * as Lay from './layout';
import { MEM_SLOTS, SLOT_BYTES, addrText } from './memory';
import { COL } from './palette';
import type { BlockPose, FlagPose, Pose, Rect, Spot, WirePose } from './poses';

const UP = new THREE.Vector3(0, 1, 0);

/** Interaction state the scene needs to draw, owned by the page. */
export interface DrawView {
  /** 0: the ordinary view; 1: memory view. Eased by the page. */
  mem: number;
  /** The disc or cell being inspected. */
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
const at = (p: Spot, m: number): V3 => v3(lerp(p.x, p.mx, m), lerp(p.y, p.my, m), lerp(p.z, p.mz, m));

export class ListScene {
  readonly stage: Stage;
  /** Where each disc was drawn this frame, by item key. */
  readonly itemWorld = new Map<string, ItemWorld>();
  private readonly plinth: THREE.Mesh;
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
  private readonly arc: V3[] = Array.from({ length: 17 }, () => v3(0, 0, 0));
  private mem = 0;
  private pose: Pose | null = null;
  private plinthRect: Rect = { cx: 0, cz: 0, w: 8, d: 5 };

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage({
      canvas,
      background: 0xe2dacb,
      keyDir: [-0.4, 1, 0.55],
      cameraPos: [-3, 12, 22],
      target: [0, 0.6, 0],
      controls: {
        minPolarAngle: 0.25,
        maxPolarAngle: 1.5,
        minAzimuthAngle: -1.3,
        maxAzimuthAngle: 1.3,
        minDistance: 5,
        maxDistance: 110,
      },
    });
    const { scene } = this.stage;
    scene.fog = new THREE.Fog(0xe2dacb, 120, 300);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({
        map: plasterTexture({ base: '#DCD3C3', repeat: [26, 26], seed: 23 }),
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
      max: { discs: 80, rods: 5000, balls: 1400, cones: 160 },
    });
    this.boxes = new InstancedBatch(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.45 }),
      80,
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

  counts(): { rods: number; discs: number; cones: number; labels: number } {
    return { rods: this.kit.rods.n, discs: this.kit.discs.n, cones: this.kit.cones.n, labels: this.labels.count };
  }

  /* ---------- resolving what things point at ---------- */

  /** The centre of the disc, cell or knot a reference names, as drawn this frame. */
  private refPos(ref: string | null): V3 | null {
    if (ref == null || !this.pose) return null;
    const it = this.itemWorld.get(ref);
    if (it) return it;
    if (ref.startsWith('c:')) {
      const [, block, idx] = ref.split(':');
      const b = this.pose.blocks.get(block),
        c = b?.cells[Number(idx)];
      return c ? { ...at(c, this.mem), y: Lay.CELL_Y } : null;
    }
    if (ref.startsWith('g:')) {
      const k = this.pose.net?.knots.get(ref);
      return k ? v3(k.x, Lay.KNOT_Y, k.z) : null;
    }
    return null;
  }

  /** Screen position (CSS px) of a disc, cell or knot, or null if it is not on screen. */
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
    return { ...p, r: it ? it.r : Lay.R };
  }

  /* ---------- drawing ---------- */

  draw(P: Pose, view: DrawView): void {
    this.pose = P;
    this.mem = view.mem;
    const m = view.mem,
      kit = this.kit,
      LB = this.labels,
      camera = this.camera;
    kit.begin();
    this.boxes.begin();
    LB.begin();
    this.itemWorld.clear();
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camBack);

    const pr = (this.plinthRect = {
      cx: lerp(P.plinth.cx, P.mplinth.cx, m),
      cz: lerp(P.plinth.cz, P.mplinth.cz, m),
      w: lerp(P.plinth.w, P.mplinth.w, m),
      d: lerp(P.plinth.d, P.mplinth.d, m),
    });
    this.plinth.position.set(pr.cx, -Lay.PH / 2, pr.cz);
    this.plinth.scale.set(pr.w, Lay.PH, pr.d);

    if (m * P.grid > 0.01) this.drawMemoryFloor(m * P.grid);
    for (const b of P.blocks.values()) this.drawBlock(b, m, view);
    if (P.tray && P.tray.a > 0.01) this.drawTray(P, m);
    if (P.stand && P.stand.a > 0.01) this.drawStand(P.stand.h, P.stand.a, m);
    if (P.net && P.net.a > 0.01) this.drawNet(P);

    // discs first, so pointers and labels can find them
    for (const it of P.items.values()) {
      if (it.s < 0.01) continue;
      const p = at(it, m),
        s = it.s,
        r = Lay.R * s;
      this.itemWorld.set(it.key, { ...p, r, key: it.key });
      kit.disc(p.x, p.y, p.z, s, it.fill, camera.quaternion);
      if (it.peg > 0.01) {
        const foot = Math.max(0, p.y - r - 0.02);
        kit.rod(p.x, 0, p.z, p.x, foot, p.z, 0.022 * it.peg, COL.ink);
        kit.ball(p.x, 0.02, p.z, 0.055 * it.peg, COL.ink);
      }
      LB.group(p.x, p.y, p.z);
      if (it.halo > 0.01)
        LB.shape(
          MODE.glow,
          p.x,
          p.y,
          p.z,
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
      LB.shape(MODE.ring, p.x, p.y, p.z, 2 * r, 2 * r, it.rim, 1, 0, 0, 1, it.rimW * s);
      LB.text(it.label, p.x, p.y, p.z, (it.label.length > 1 ? 0.3 : 0.36) * s, it.glyph, 1);
      if (view.selected === it.key)
        LB.shape(MODE.ring, p.x, p.y, p.z, 2 * (r + 0.12), 2 * (r + 0.12), COL.cobalt, 1, 0, 0, 1, 0.04);
      const aA = it.addrA * (1 - m) * clamp01(s);
      if (aA > 0.01 && it.peg > 0.5) {
        LB.group(p.x, 0.01, p.z + 0.62);
        LB.text(it.addr, p.x, 0.012, p.z + 0.62, 0.17, COL.graphite, aA * 0.9, 0, 0, 1);
      }
    }
    for (const w of P.wires.values()) this.drawWire(w);
    for (const f of P.flags.values()) this.drawFlag(f, m);
    for (const b of P.beads) {
      if (b.a < 0.01) continue;
      const p = b.kind === 'wire' && b.wire ? this.wirePoint(b.wire, b.u) : this.jumpPoint(b.from, b.to, b.u);
      if (!p) continue;
      kit.ball(p.x, p.y, p.z, b.r * Math.min(1, b.a * 1.5), b.col);
      if (b.kind === 'jump' && b.a > 0.3) {
        // the leap leaves a thin trail: one jump, where a list would hop node by node
        let q = this.jumpPoint(b.from, b.to, 0);
        for (let k = 1; k <= 16 && q; k++) {
          const nq = this.jumpPoint(b.from, b.to, (b.u * k) / 16);
          if (nq) kit.rod(q.x, q.y, q.z, nq.x, nq.y, nq.z, 0.02, b.col);
          q = nq;
        }
      }
    }
    for (const rp of P.ripples) {
      const p = this.refPos(rp.at);
      if (!p || rp.a < 0.01) continue;
      LB.group(p.x, 0.02, p.z);
      LB.shape(MODE.ring, p.x, 0.02, p.z, 2 * rp.r, 2 * rp.r, rp.col, rp.a, 0, 0, 1, 0.04, 0, 0, 1);
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

  private drawMemoryFloor(a: number): void {
    const LB = this.labels;
    for (let k = 0; k < MEM_SLOTS; k++) {
      const { x, z } = Lay.memPos(k * SLOT_BYTES);
      LB.group(x, 0.01, z);
      LB.shape(MODE.outline, x, 0.008, z, Lay.MX - 0.16, Lay.MZ - 0.16, COL.ink, 0.16 * a, 0, 0, 0.12, 0.018, 0, 0, 1);
      const tx = x - Lay.MX / 2 + 0.5,
        tz = z + Lay.MZ / 2 - 0.28;
      LB.text(addrText(k * SLOT_BYTES), tx, 0.01, tz, 0.16, COL.faint, 0.9 * a, 0, 0, 1);
      if (k === 0) LB.text('NULL', x, 0.01, z, 0.3, COL.faint, 0.8 * a, 0, 0, 1);
    }
  }

  private drawBlock(b: BlockPose, m: number, view: DrawView): void {
    if (b.a < 0.01) return;
    const LB = this.labels,
      ring = b.kind === 'ring';
    const sink = (1 - b.a) * 0.35;
    b.cells.forEach((c, i) => {
      const p = at(c, m);
      const rot = ring ? -(i / b.cap) * Math.PI * 2 * (1 - m) : 0;
      const used = ring || i < b.len;
      this.box(
        p.x,
        (Lay.CELL_H - sink) / 2 - sink / 2,
        p.z,
        (Lay.CW - 0.1) * b.a,
        Math.max(0.01, Lay.CELL_H - sink),
        Lay.CELL_D * b.a,
        rot,
        used ? COL.paper : mix3(COL.paper, COL.faint, 0.28),
      );
      // the index in front of (or outside) the cell, and its address below it
      let lx = p.x,
        lz = p.z + Lay.CELL_D / 2 + 0.3;
      if (ring && b.centre) {
        const dx = c.x - b.centre.x,
          dz = c.z - b.centre.z,
          d = Math.hypot(dx, dz) || 1;
        lx = lerp(c.x + (dx / d) * 0.95, lx, m);
        lz = lerp(c.z + (dz / d) * 0.95, lz, m);
      }
      LB.group(lx, 0.01, lz);
      LB.text(String(i), lx, 0.012, lz, 0.24, COL.ink, 0.85 * b.a, 0, 0, 1);
      if (!ring || m > 0.5)
        LB.text(
          addrText(b.base + 4 * i),
          lx,
          0.012,
          lz + 0.34,
          0.14,
          COL.faint,
          0.9 * b.a * (ring ? (m - 0.5) * 2 : 1),
          0,
          0,
          1,
        );
      if (view.selected === `c:${b.key}:${i}`)
        LB.shape(
          MODE.outline,
          p.x,
          Lay.CELL_H + 0.01,
          p.z,
          Lay.CW - 0.02,
          Lay.CELL_D + 0.08,
          COL.cobalt,
          1,
          0,
          0,
          0.2,
          0.04,
          0,
          0,
          1,
        );
    });
    // the block's size, written beside it
    const c0 = at(b.cells[0], m);
    const lx = ring ? lerp(b.centre?.x ?? 0, c0.x - 1.35, m) : c0.x - 1.35,
      lz = ring ? lerp(b.centre?.z ?? 0, c0.z, m) : c0.z;
    LB.group(lx, 0.01, lz);
    LB.text(`${ring ? 'SIZE' : 'LEN'} ${b.len}`, lx, 0.012, lz - 0.2, 0.2, COL.graphite, b.a, 0, 0, 1);
    LB.text(`CAP ${b.cap}`, lx, 0.012, lz + 0.2, 0.2, COL.graphite, b.a, 0, 0, 1);
  }

  private drawTray(P: Pose, m: number): void {
    const T = P.tray;
    if (!T) return;
    const x0 = lerp(T.x, T.mx, m),
      z = lerp(T.z, T.mz, m),
      L = Lay.TRAY_SLOTS * Lay.TRAY_PITCH;
    this.box(x0 + L / 2 - Lay.TRAY_PITCH / 2, 0.05, z, L + 0.2, 0.1, 0.95, 0, mix3(COL.paper, COL.faint, 0.18 * T.a));
    const LB = this.labels,
      w = glyphWidth(T.label, 0.22);
    LB.group(x0 - 0.8, 0.01, z);
    LB.text(T.label, x0 - 0.62 - w / 2, 0.012, z, 0.22, COL.graphite, T.a, 0, 0, 1);
  }

  private drawStand(h: number, a: number, m: number): void {
    const x = lerp(Lay.STACK_X, -Lay.MEM_W / 2 - 2, m),
      s = a * (1 - m);
    if (s < 0.01) return;
    this.box(x, 0.06, 0, 1.3 * s, 0.12, 1.3 * s, 0, COL.paper);
    this.kit.rod(x, 0.1, -0.2, x, 0.1 + (h - 0.1) * s, -0.2, 0.025, COL.ink);
    this.kit.ball(x, 0.1 + (h - 0.1) * s, -0.2, 0.05, COL.ink);
  }

  private drawNet(P: Pose): void {
    const N = P.net;
    if (!N) return;
    const kit = this.kit,
      LB = this.labels,
      a = N.a;
    for (const e of N.edges.values()) {
      const A = N.knots.get(e.a),
        B = N.knots.get(e.b);
      if (!A || !B) continue;
      const col = mix3(COL.string, COL.cobalt, e.hl);
      kit.rod(A.x, 0.03, A.z, B.x, 0.03, B.z, (0.018 + 0.012 * e.hl) * a, col);
    }
    for (const k of N.knots.values()) {
      const s = k.s * Lay.KNOT_S * a;
      if (s < 0.01) continue;
      const r = Lay.R * s,
        y = Lay.KNOT_Y;
      kit.ball(k.x, 0.03, k.z, 0.06 * a, COL.ink);
      kit.rod(k.x, 0.03, k.z, k.x, y - r, k.z, 0.02 * a, COL.ink);
      kit.disc(k.x, y, k.z, s, k.fill, this.camera.quaternion);
      LB.group(k.x, y, k.z);
      if (k.halo > 0.01)
        LB.shape(
          MODE.glow,
          k.x,
          y,
          k.z,
          2 * (r + 0.5),
          2 * (r + 0.5),
          COL.cobalt,
          0.3 * k.halo * a,
          0,
          0,
          0,
          r + 0.16,
          0.2,
        );
      LB.shape(MODE.ring, k.x, y, k.z, 2 * r, 2 * r, k.rim, a, 0, 0, 1, k.rimW * s);
      LB.text(k.label, k.x, y, k.z, 0.36 * s, k.glyph, a);
    }
  }

  /* ---------- pointers ---------- */

  /** Where a pointer of this shape and role leaves (or arrives at) a disc. */
  private knob(p: V3, r: number, w: WirePose): V3 {
    if (w.shape === 'stack') return v3(p.x + r + Lay.KNOB * 0.6, p.y, p.z);
    return w.role === 'next' ? v3(p.x, p.y + r + Lay.KNOB * 0.6, p.z) : v3(p.x, p.y - r - Lay.KNOB * 0.6, p.z);
  }

  /** The end of a null pointer: a short stub leaning away from its neighbours. */
  private nullEnd(o: V3, w: WirePose, nd: number): V3 {
    if (w.shape === 'stack') return v3(o.x + 0.45, o.y - 0.62, o.z);
    return w.role === 'next' ? v3(o.x + 0.95 * nd, o.y - 0.32, o.z) : v3(o.x + 0.95 * nd, o.y - 0.12, o.z);
  }

  /** Where a wire ends, turning from its old target to its new one. */
  private wireEnds(w: WirePose): { o: V3; t: V3; nul: number } | null {
    const src = this.itemWorld.get(w.from);
    if (!src) return null;
    const o = this.knob(src, src.r, w);
    const endOf = (ref: string | null, nd: number): V3 => {
      const it = ref != null ? this.itemWorld.get(ref) : undefined;
      return it ? this.knob(it, it.r, w) : this.nullEnd(o, w, nd);
    };
    const isNull = (ref: string | null) => ref == null || !this.itemWorld.has(ref);
    const tNew = endOf(w.to, w.nd);
    if (w.k >= 1 || (w.was === w.to && w.wnd === w.nd)) return { o, t: tNew, nul: isNull(w.to) ? 1 : 0 };
    const tOld = endOf(w.was, w.wnd);
    const nul = lerp(isNull(w.was) ? 1 : 0, isNull(w.to) ? 1 : 0, w.k);
    if (w.via !== 'short') return { o, t: this.swing(o, tOld, tNew, w.k, w.via === 'front' ? 1 : -1), nul };
    // turn about the origin: angle and reach are blended, so the wire sweeps rather than slides
    const ax = tOld.x - o.x,
      az = tOld.z - o.z,
      bx = tNew.x - o.x,
      bz = tNew.z - o.z;
    const ha = Math.hypot(ax, az),
      hb = Math.hypot(bx, bz);
    let pa = Math.atan2(az, ax),
      pb = Math.atan2(bz, bx);
    if (ha < 1e-3) pa = pb;
    if (hb < 1e-3) pb = pa;
    let d = pb - pa;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    // a half turn has no short way round: go through the front, toward the viewer
    if (Math.abs(Math.abs(d) - Math.PI) < 0.05) d = Math.PI * (Math.sin(pa + Math.PI / 2) > 0 ? 1 : -1);
    const k = w.k,
      ph = pa + d * k,
      h = lerp(ha, hb, k),
      y = lerp(tOld.y - o.y, tNew.y - o.y, k);
    const t = v3(o.x + h * Math.cos(ph), o.y + y, o.z + h * Math.sin(ph));
    return { o, t, nul };
  }

  /**
   * A pointer turning right round (a reverse): the far end swings up over its node,
   * leaning toward the viewer (lean 1) or away (lean -1), and comes down on the other side.
   */
  private swing(o: V3, from: V3, to: V3, k: number, lean: number): V3 {
    const a = v3(from.x - o.x, from.y - o.y, from.z - o.z),
      b = v3(to.x - o.x, to.y - o.y, to.z - o.z);
    const la = Math.hypot(a.x, a.y, a.z) || 1,
      lb = Math.hypot(b.x, b.y, b.z) || 1;
    const apex = v3(0, Math.cos(0.36), lean * Math.sin(0.36));
    const [p, q, u] = k < 0.5 ? [a, apex, k * 2] : [b, apex, (1 - k) * 2];
    const lp = Math.hypot(p.x, p.y, p.z) || 1;
    const P = v3(p.x / lp, p.y / lp, p.z / lp);
    const dot = Math.max(-1, Math.min(1, P.x * q.x + P.y * q.y + P.z * q.z)),
      om = Math.acos(dot);
    let d: V3;
    if (om < 1e-3) d = P;
    else {
      const s0 = Math.sin((1 - u) * om) / Math.sin(om),
        s1 = Math.sin(u * om) / Math.sin(om);
      d = v3(P.x * s0 + q.x * s1, P.y * s0 + q.y * s1, P.z * s0 + q.z * s1);
    }
    const len = lerp(la, lb, k) * (1 - 0.18 * Math.sin(Math.PI * k));
    return v3(o.x + d.x * len, o.y + d.y * len, o.z + d.z * len);
  }

  /** Which way a wire bows, and how far: stack pointers bow outward; list pointers bow up (next) or down (prev), square to the wire. */
  private bow(w: WirePose, o: V3, t: V3, d: number, nul: number): [number, number, number, number] {
    if (w.shape === 'stack') return [1, 0, 0, lerp(0.3, 0.12, nul)];
    const up = w.role === 'next' ? 1 : -1,
      dy = (t.y - o.y) / d;
    let bx = -up * dy * ((t.x - o.x) / d),
      by = up * (1 - dy * dy),
      bz = -up * dy * ((t.z - o.z) / d);
    const n = Math.hypot(bx, by, bz);
    if (n < 0.15) [bx, by, bz] = [0, 0, 1];
    else [bx, by, bz] = [bx / n, by / n, bz / n];
    const h =
      w.role === 'next'
        ? lerp(Math.min(2.2, Math.max(0.32, 0.2 + 0.17 * d)), 0.2, nul)
        : lerp(Math.min(0.62, Math.max(0.24, 0.1 + 0.1 * d)), 0.08, nul);
    return [bx, by, bz, h];
  }

  /** Fill this.arc with points along a wire; returns how many segments. */
  private arcPoints(w: WirePose, o: V3, t: V3, nul: number): number {
    const d = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z) || 1;
    const [bx, by, bz, h] = this.bow(w, o, t, d, nul);
    const n = d > 6 ? 16 : 12;
    for (let k = 0; k <= n; k++) {
      const u = k / n,
        b = 4 * h * u * (1 - u);
      const P = this.arc[k];
      P.x = o.x + (t.x - o.x) * u + bx * b;
      P.y = Math.max(0.1, o.y + (t.y - o.y) * u + by * b);
      P.z = o.z + (t.z - o.z) * u + bz * b;
    }
    return n;
  }

  /** A point part-way along a wire, for beads. */
  private wirePoint(key: string, u: number): V3 | null {
    const w = this.pose?.wires.get(key);
    if (!w) return null;
    const e = this.wireEnds(w);
    if (!e) return null;
    const n = this.arcPoints(w, e.o, e.t, e.nul);
    const f = clamp01(u) * n,
      k = Math.min(n - 1, Math.floor(f)),
      r = f - k;
    const A = this.arc[k],
      B = this.arc[k + 1];
    return v3(lerp(A.x, B.x, r), lerp(A.y, B.y, r) + 0.02, lerp(A.z, B.z, r));
  }

  /** A point on a leap from one cell to another (array indexing). */
  private jumpPoint(from: string, to: string, u: number): V3 | null {
    const A = this.refPos(from),
      B = this.refPos(to);
    if (!A || !B) return null;
    const d = Math.hypot(B.x - A.x, B.z - A.z);
    const y = lerp(A.y, B.y, u) + Lay.R + 0.12 + (0.45 + 0.14 * d) * 4 * u * (1 - u);
    return v3(lerp(A.x, B.x, u), y, lerp(A.z, B.z, u));
  }

  private drawWire(w: WirePose): void {
    if (w.s < 0.01) return;
    const e = this.wireEnds(w);
    if (!e) return;
    const { o, t, nul } = e;
    const n = this.arcPoints(w, o, t, nul);
    const kit = this.kit;
    let col = mix3(COL.ink, COL.cobalt, Math.max(w.hot, 0.8 * w.trail));
    const r = (0.022 + 0.014 * w.hot) * Math.min(1, w.s * 1.5);
    if (w.role === 'prev' && w.hot < 0.5) col = mix3(col, COL.graphite, 0.35);
    // draw from the origin outward, so a new pointer grows toward its target
    const upto = n * clamp01(w.s);
    const A = this.arc;
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
    kit.ball(o.x, o.y, o.z, Lay.KNOB * Math.min(1, w.s * 2), COL.ink);
    if (w.s < 0.98) return;
    if (nul > 0.5) {
      // null: the wire ends in an earth symbol
      const g = t,
        s = clamp01((nul - 0.5) * 2);
      kit.rod(g.x, g.y, g.z, g.x, g.y - 0.16 * s, g.z, r, col);
      for (let b = 0; b < 3; b++) {
        const hw = (0.2 - b * 0.065) * s,
          y = g.y - (0.16 + b * 0.075) * s;
        kit.rod(g.x - hw, y, g.z, g.x + hw, y, g.z, 0.02, COL.ink);
      }
    } else {
      // arrowhead just short of the knob it points at
      const k1 = n - 1,
        P1 = A[n],
        P0 = A[k1];
      const dx = P1.x - P0.x,
        dy = P1.y - P0.y,
        dz = P1.z - P0.z,
        L = Math.hypot(dx, dy, dz) || 1;
      const back = Lay.KNOB + 0.02;
      kit.cone(P1.x - (dx / L) * back, P1.y - (dy / L) * back, P1.z - (dz / L) * back, dx, dy, dz, 0.08, 0.24, col);
    }
  }

  /* ---------- named pointers ---------- */

  /** Where a flag's arrow ends on its target, and where its label stands. */
  private flagPlace(
    f: FlagPose,
    ref: string | null,
    nul: Spot | null,
    lvl: number,
    m: number,
  ): { tip: V3; pill: V3 } | null {
    let p: V3 | null = null,
      r = Lay.R;
    if (ref != null) {
      const it = this.itemWorld.get(ref);
      if (it) {
        p = it;
        r = it.r;
      } else p = this.refPos(ref);
    } else if (nul) p = at(nul, m);
    if (!p) return null;
    const isNull = ref == null;
    switch (f.side) {
      case 'above': {
        const top = isNull ? p.y : p.y + r + Lay.KNOB + 0.04;
        return { tip: v3(p.x, top, p.z), pill: v3(p.x, top + 0.95 + lvl * 0.52, p.z) };
      }
      case 'below': {
        const tip = isNull ? p : v3(p.x, p.y - r - 0.03, p.z + 0.06);
        return { tip, pill: v3(p.x + f.off, 0.3, p.z + 1.12) };
      }
      case 'left': {
        const tip = isNull ? p : v3(p.x - r - 0.05, p.y, p.z);
        return { tip, pill: v3(tip.x - 1.3, tip.y, tip.z) };
      }
      case 'radial': {
        const b = this.pose?.blocks.values().next().value;
        const c = b?.centre;
        let dx = 0,
          dz = 1;
        if (c) {
          const d = Math.hypot(p.x - c.x, p.z - c.z) || 1;
          dx = lerp((p.x - c.x) / d, 0, m);
          dz = lerp((p.z - c.z) / d, 1, m);
          const n = Math.hypot(dx, dz) || 1;
          dx /= n;
          dz /= n;
        }
        const tx = -dz,
          tz = dx;
        const tip = v3(p.x + dx * 0.62, 0.3, p.z + dz * 0.62);
        return { tip, pill: v3(p.x + dx * 1.6 + tx * f.off, 0.3, p.z + dz * 1.6 + tz * f.off) };
      }
    }
  }

  private drawFlag(f: FlagPose, m: number): void {
    if (f.a < 0.01) return;
    const now = this.flagPlace(f, f.to, f.nul, f.lvl, m);
    if (!now) return;
    let tip = now.tip,
      pill = now.pill;
    const turning = f.k < 1 && (f.was !== f.to || f.wnul !== f.nul);
    if (turning) {
      const then = this.flagPlace(f, f.was, f.wnul, f.lvl, m);
      if (then) {
        const k = f.k,
          hop = Math.sin(Math.PI * k) * (f.side === 'above' ? 0.45 : 0.3);
        tip = v3(lerp(then.tip.x, now.tip.x, k), lerp(then.tip.y, now.tip.y, k), lerp(then.tip.z, now.tip.z, k));
        pill = v3(
          lerp(then.pill.x, now.pill.x, k),
          lerp(then.pill.y, now.pill.y, k) + hop,
          lerp(then.pill.z, now.pill.z, k),
        );
      }
    }
    const field = f.kind === 'field',
      col = field ? COL.ink : COL.cobalt,
      a = f.a;
    const th = 0.2,
      W = glyphWidth(f.label, th) + th * 1.05,
      H = th * 1.8;
    // the stalk runs from the edge of the label to the target, ending in an arrowhead
    const dx = tip.x - pill.x,
      dy = tip.y - pill.y,
      dz = tip.z - pill.z,
      L = Math.hypot(dx, dy, dz) || 1;
    const start = f.side === 'above' || f.side === 'below' ? H / 2 + 0.02 : W / 2 + 0.02;
    const sx = pill.x + (dx / L) * start,
      sy = pill.y + (dy / L) * start,
      sz = pill.z + (dz / L) * start;
    const isNull = f.to == null && (f.k >= 0.5 || f.was == null);
    const endBack = isNull ? 0 : 0.2;
    const ex = tip.x - (dx / L) * endBack,
      ey = tip.y - (dy / L) * endBack,
      ez = tip.z - (dz / L) * endBack;
    if (a > 0.3) {
      this.kit.rod(sx, sy, sz, ex, ey, ez, 0.016, col);
      if (isNull) {
        for (let b = 0; b < 3; b++) {
          const hw = 0.17 - b * 0.055,
            y = tip.y - b * 0.07;
          this.kit.rod(tip.x - hw, y, tip.z, tip.x + hw, y, tip.z, 0.018, COL.ink);
        }
      } else this.kit.cone(tip.x, tip.y, tip.z, dx, dy, dz, 0.065, 0.2, col);
    }
    const LB = this.labels;
    LB.group(pill.x, pill.y, pill.z);
    LB.pill(
      pill.x,
      pill.y,
      pill.z,
      f.label,
      th,
      0,
      0,
      field ? COL.paper : COL.cobalt,
      COL.ink,
      field ? 0.016 : 0,
      field ? COL.ink : COL.white,
      a,
    );
  }

  /* ---------- camera and lights ---------- */

  /**
   * The extent of everything worth keeping on screen, measured across and up the
   * current view. Worked out from a pose, so the page can frame where a step will
   * come to rest rather than chase it.
   */
  frameBox(P: Pose, mem = this.mem): FrameBox {
    const pts: [number, number, number][] = [];
    const m = mem;
    const chain = P.structure === 'singly' || P.structure === 'doubly';
    let top = 1.4;
    const place = new Map<string, V3>();
    for (const it of P.items.values()) {
      if (it.s < 0.05) continue;
      const p = at(it, m),
        r = Lay.R * it.s;
      place.set(it.key, p);
      pts.push([p.x - r, p.y + r, p.z], [p.x + r, 0, p.z]);
      top = Math.max(top, p.y + r + (chain ? 0.75 : 0.2));
    }
    for (const b of P.blocks.values()) {
      if (b.a < 0.3) continue;
      b.cells.forEach((c, i) => {
        const p = at(c, m);
        place.set(`c:${b.key}:${i}`, p);
        pts.push([p.x - Lay.CW / 2, 0, p.z - Lay.CELL_D / 2], [p.x + Lay.CW / 2, 0, p.z + Lay.CELL_D / 2 + 0.7]);
      });
    }
    for (const f of P.flags.values()) {
      if (f.a < 0.3) continue;
      const p = f.to != null ? place.get(f.to) : f.nul ? at(f.nul, m) : undefined;
      if (!p) continue;
      if (f.side === 'below') pts.push([p.x + f.off - 0.5, 0.3, p.z + 1.4]);
      else if (f.side === 'above') top = Math.max(top, p.y + 1.6 + f.lvl * 0.52);
      else if (f.side === 'left') pts.push([p.x - 2, p.y, p.z]);
      else pts.push([p.x, 0.3, p.z + (m > 0.5 ? 1.9 : 0)]);
    }
    if (P.tray && P.tray.a > 0.3) {
      const x = lerp(P.tray.x, P.tray.mx, m),
        z = lerp(P.tray.z, P.tray.mz, m);
      pts.push([x - 1.5, 0, z - 0.5], [x + Lay.TRAY_SLOTS * Lay.TRAY_PITCH, 1, z + 0.5]);
    }
    if (P.net && P.net.a > 0.3)
      for (const k of P.net.knots.values()) pts.push([k.x - 0.6, 1.2, k.z - 0.6], [k.x + 0.6, 0, k.z + 0.6]);
    if (P.structure === 'queue' && m < 0.5)
      pts.push(
        [Lay.RING_X - Lay.RING_R - 2.3, 0, 0],
        [Lay.RING_X + Lay.RING_R + 2.3, 0, 0],
        [Lay.RING_X, 0, Lay.RING_R + 2.3],
        [Lay.RING_X, 0, -Lay.RING_R - 1.2],
      );
    if (m * P.grid > 0.3) pts.push([-Lay.MEM_W / 2, 0, -Lay.MEM_D / 2], [Lay.MEM_W / 2, 0, Lay.MEM_D / 2]);
    if (!pts.length) pts.push([-3, 0, -1], [3, 1.5, 1]);
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[2]);
      z1 = Math.max(z1, p[2]);
    }
    // keep the plinth's front edge and the tallest arc in view
    pts.push([(x0 + x1) / 2, -Lay.PH, z1 + 0.6], [(x0 + x1) / 2, top, (z0 + z1) / 2]);
    const c = [(x0 + x1) / 2, 0.8, (z0 + z1) / 2];
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
      hw: Math.max(2.5, (r1 - r0) / 2 + 0.3),
      hh: Math.max(1.6, (u1 - u0) / 2 + 0.25),
      depth: f1 * 0.25,
    };
  }

  /** The key light and its shadow camera follow the plinth. */
  fitLights(): void {
    const { key, pool, KEY_DIR } = this.stage;
    const pr = this.plinthRect;
    const half = Math.max(pr.w, pr.d) / 2 + 4;
    key.target.position.set(pr.cx, 0, pr.cz);
    key.position.copy(key.target.position).addScaledVector(KEY_DIR, 40);
    const sc = key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 4;
    sc.far = 90;
    sc.updateProjectionMatrix();
    pool.position.set(pr.cx - 2, 26, pr.cz + 12);
    pool.target.position.set(pr.cx, 0, pr.cz);
    pool.angle = Math.min(1.1, Math.atan((half + 2) / 28));
  }

  /** The camera's right vector this frame. */
  get right(): THREE.Vector3 {
    return this.camRight;
  }
}
