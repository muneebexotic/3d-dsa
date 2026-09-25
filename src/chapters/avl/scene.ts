// The AVL Mobile scene: a plaster wall, one disc per value, and instanced wires,
// joints, hooks and loops. draw() renders any AvlPose; the scene keeps only the
// physical state that makes the mobile sway (pendulums and tilting arms).

import * as THREE from 'three';
import { drawGlyphs, numeralHeight } from '../../core/glyphs';
import { clamp01, lerp } from '../../core/math';
import { REDUCED } from '../../core/prefs';
import { DEG, createStage, plasterTexture, type FrameBox, type Stage } from '../../core/stage';
import type { Side } from './engine';
import { CEIL, R, STEM, STUB, VR, WALL_Z } from './layout';
import type { AvlPose, PoseLink } from './poses';

const INK = 0x1b1a17,
  COBALT = 0x2346a8,
  RED = 0xd1361e;
const C_INK = new THREE.Color(INK),
  C_COB = new THREE.Color(COBALT);
const MAXR = 900,
  MAXJ = 500,
  MAXH = 200,
  MAXL = 90,
  MAXC = 16;
const UP = new THREE.Vector3(0, 1, 0);

/** Interaction state the scene needs to draw, owned by the page. */
export interface DrawView {
  /** Playback speed: the mobile's swing follows the animation clock. */
  speed: number;
  badges: boolean;
  selected: number | null;
  clock: number;
  /** Whether a value is still in the tree; discs for removed values are freed after a while. */
  isLive(id: number): boolean;
}

/** One disc on the wall, and the physics that makes it sway. */
interface Visual {
  id: number;
  v: number;
  group: THREE.Group;
  disc: THREE.Mesh;
  discMat: THREE.MeshStandardMaterial;
  faceMat: THREE.MeshBasicMaterial;
  badge: THREE.Mesh;
  badgeMat: THREE.MeshBasicMaterial;
  ringC: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  ringR: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  ringS: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  tilt: number;
  tiltV: number;
  sw: number;
  swV: number;
  x1: number | null;
  x2: number | null;
  /** How much of the arm is shown, eased. */
  pres: number;
  longArm: number;
  hidden: number;
  bfShown: number;
  phase: number;
  /** Where the disc was drawn this frame (after swinging). */
  rx: number;
}
interface Disc {
  group: THREE.Group;
  disc: THREE.Mesh;
  discMat: THREE.MeshStandardMaterial;
  face: THREE.Mesh;
  faceMat: THREE.MeshBasicMaterial;
  v: number;
}

/** How far an arm tilts for a balance factor. */
export function tiltFor(bf: number, longArm: number): number {
  const a = Math.min(2, Math.abs(bf));
  if (!a) return 0;
  const maxDeg = a >= 2 ? 22 : 10,
    drop = a >= 2 ? 0.5 : 0.2;
  return Math.sign(bf) * Math.min(maxDeg * DEG, Math.atan(drop / longArm));
}

export class AvlScene {
  readonly stage: Stage;
  readonly visuals = new Map<number, Visual>();
  /** Disc meshes that can be clicked. */
  readonly pickables: THREE.Mesh[] = [];
  private readonly discGeo = new THREE.CylinderGeometry(R, R, 0.07, 48, 1).rotateX(Math.PI / 2);
  private readonly faceGeo = new THREE.PlaneGeometry(2 * R, 2 * R);
  private readonly badgeGeo = new THREE.PlaneGeometry(0.46, 0.28);
  private readonly ringCGeo = new THREE.RingGeometry(R + 0.08, R + 0.14, 64);
  private readonly ringRGeo = new THREE.RingGeometry(R + 0.17, R + 0.23, 64);
  private readonly ringSGeo = new THREE.RingGeometry(R + 0.29, R + 0.32, 64);
  private readonly rods: THREE.InstancedMesh;
  private readonly joints: THREE.InstancedMesh;
  private readonly hooks: THREE.InstancedMesh;
  private readonly loops: THREE.InstancedMesh;
  private readonly clipMeshes: THREE.InstancedMesh;
  private readonly cobaltBasic = new THREE.MeshBasicMaterial({
    color: COBALT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly arcGroup = new THREE.Group();
  private arcBuiltFor = -1;
  private readonly numTex = new Map<number, THREE.CanvasTexture>();
  private readonly badgeTex: Record<number, THREE.CanvasTexture> = {};
  /** The value in hand. */
  private readonly visitor: Disc;
  private nR = 0;
  private nJ = 0;
  private nH = 0;
  private nL = 0;
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _s = new THREE.Vector3();
  private readonly _p = new THREE.Vector3();
  private readonly _d = new THREE.Vector3();
  private readonly _c = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage({ canvas });
    const { scene } = this.stage;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 280),
      new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.96, metalness: 0, envMapIntensity: 0.3 }),
    );
    wall.position.set(0, -20, WALL_Z);
    wall.receiveShadow = true;
    scene.add(wall);

    const rodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.35 });
    this.rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1), rodMat, MAXR);
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), rodMat, MAXJ);
    const curlGeo = new THREE.TorusGeometry(0.06, 0.013, 6, 14, Math.PI);
    curlGeo.rotateZ(Math.PI);
    this.hooks = new THREE.InstancedMesh(curlGeo, rodMat, MAXH);
    this.loops = new THREE.InstancedMesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), rodMat, MAXL);
    for (const m of [this.rods, this.joints, this.hooks, this.loops]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, C_INK);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    for (const bf of [-2, -1, 0, 1, 2]) this.badgeTex[bf] = this.makeBadge(bf);

    this.visitor = this.makeDisc(0, VR / R);
    this.visitor.discMat.color.setHex(COBALT);
    this.visitor.faceMat.color.setHex(0xffffff);
    this.visitor.group.visible = false;

    this.clipMeshes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.15, 0.25, 0.09),
      new THREE.MeshStandardMaterial({ color: COBALT, roughness: 0.4, metalness: 0.2 }),
      MAXC,
    );
    this.clipMeshes.count = 0;
    this.clipMeshes.castShadow = true;
    this.clipMeshes.frustumCulled = false;
    scene.add(this.clipMeshes);
    this.arcGroup.visible = false;
    scene.add(this.arcGroup);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.stage.camera;
  }
  render(): void {
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  /* ---------- textures ---------- */

  private numeralTexture(v: number): THREE.CanvasTexture {
    let t = this.numTex.get(v);
    if (t) return t;
    const S = 256,
      c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    if (!g) throw new Error('Canvas 2D is not available');
    g.strokeStyle = '#fff';
    drawGlyphs(g, v, S / 2, S / 2, numeralHeight(v) * S, 14);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    this.numTex.set(v, t);
    return t;
  }
  private makeBadge(bf: number): THREE.CanvasTexture {
    const W = 184,
      H = 112,
      c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) throw new Error('Canvas 2D is not available');
    const a = Math.abs(bf),
      r = H / 2 - 6;
    g.beginPath();
    g.moveTo(6 + r, 6);
    g.lineTo(W - 6 - r, 6);
    g.arc(W - 6 - r, H / 2, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(6 + r, H - 6);
    g.arc(6 + r, H / 2, r, Math.PI / 2, Math.PI * 1.5);
    g.closePath();
    g.fillStyle = a >= 2 ? '#D1361E' : '#F8F5EE';
    g.fill();
    g.lineWidth = a === 1 ? 7 : 5;
    g.strokeStyle = a >= 2 ? '#D1361E' : a === 1 ? '#C48A0A' : 'rgba(27,26,23,0.4)';
    g.stroke();
    g.strokeStyle = a >= 2 ? '#FFFFFF' : '#1B1A17';
    drawGlyphs(g, bf > 0 ? `+${bf}` : bf < 0 ? `-${-bf}` : '0', W / 2, H / 2, 58, 15);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  /* ---------- discs ---------- */

  private makeDisc(v: number, radiusScale = 1): Disc {
    const group = new THREE.Group();
    const discMat = new THREE.MeshStandardMaterial({
      color: INK,
      roughness: 0.42,
      metalness: 0.05,
      envMapIntensity: 0.55,
    });
    const disc = new THREE.Mesh(this.discGeo, discMat);
    disc.castShadow = true;
    const faceMat = new THREE.MeshBasicMaterial({
      map: this.numeralTexture(v),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const face = new THREE.Mesh(this.faceGeo, faceMat);
    face.position.z = 0.04;
    face.renderOrder = 2;
    group.add(disc, face);
    group.scale.setScalar(radiusScale);
    this.stage.scene.add(group);
    return { group, disc, discMat, face, faceMat, v };
  }
  private getVis(id: number, v: number): Visual {
    const existing = this.visuals.get(id);
    if (existing) return existing;
    const d = this.makeDisc(v);
    d.disc.userData.id = id;
    this.pickables.push(d.disc);
    const ringMat = (hex: number) =>
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
    const ringC = new THREE.Mesh(this.ringCGeo, ringMat(COBALT));
    const ringR = new THREE.Mesh(this.ringRGeo, ringMat(RED));
    const pulse = new THREE.Mesh(this.ringRGeo, ringMat(RED));
    const ringS = new THREE.Mesh(this.ringSGeo, ringMat(INK));
    const badgeMat = new THREE.MeshBasicMaterial({
      map: this.badgeTex[0],
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const badge = new THREE.Mesh(this.badgeGeo, badgeMat);
    badge.position.set(0.44, -0.44, 0.06);
    badge.renderOrder = 3;
    for (const m of [ringC, ringR, pulse, ringS]) {
      m.visible = false;
      m.renderOrder = 1;
      d.group.add(m);
    }
    d.group.add(badge);
    const vis: Visual = {
      ...d,
      id,
      badge,
      badgeMat,
      ringC,
      ringR,
      pulse,
      ringS,
      tilt: 0,
      tiltV: 0,
      sw: 0,
      swV: 0,
      x1: null,
      x2: null,
      pres: 0,
      longArm: STUB,
      hidden: 0,
      bfShown: 0,
      phase: Math.random() * 6.28,
      rx: 0,
    };
    this.visuals.set(id, vis);
    return vis;
  }
  private dropVis(id: number): void {
    const vis = this.visuals.get(id);
    if (!vis) return;
    this.stage.scene.remove(vis.group);
    vis.discMat.dispose();
    vis.faceMat.dispose();
    vis.badgeMat.dispose();
    for (const m of [vis.ringC, vis.ringR, vis.pulse, vis.ringS]) m.material.dispose();
    const k = this.pickables.indexOf(vis.disc);
    if (k >= 0) this.pickables.splice(k, 1);
    this.visuals.delete(id);
    if (this.numTex.size > 160) {
      const keep = new Set([this.visitor.v]);
      for (const w of this.visuals.values()) keep.add(w.v);
      for (const [v, t] of this.numTex)
        if (!keep.has(v)) {
          t.dispose();
          this.numTex.delete(v);
        }
    }
  }
  private buildArcs(radius: number): void {
    const rr = Math.round(radius * 20) / 20;
    if (rr === this.arcBuiltFor) return;
    this.arcBuiltFor = rr;
    for (const c of [...this.arcGroup.children]) {
      this.arcGroup.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    const SPAN = 52 * DEG,
      DASHES = 4;
    for (const base of [0, Math.PI]) {
      for (let i = 0; i < DASHES; i++) {
        const a0 = base + (i / DASHES) * SPAN,
          a1 = base + ((i + 0.62) / DASHES) * SPAN;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 6; k++) {
          const a = lerp(a0, a1, k / 6);
          pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0));
        }
        this.arcGroup.add(
          new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.035, 6, false), this.cobaltBasic),
        );
      }
      const ae = base + SPAN + 4 * DEG;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 12), this.cobaltBasic);
      cone.position.set(Math.cos(ae) * rr, Math.sin(ae) * rr, 0);
      cone.rotation.z = ae; // cone points along +y; the tangent of a CCW arc at angle a is a + 90deg
      this.arcGroup.add(cone);
    }
  }

  /* ---------- instanced primitives ---------- */

  private addRod(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    r: number,
    col: THREE.Color,
  ): void {
    if (this.nR >= MAXR) return;
    this._d.set(bx - ax, by - ay, bz - az);
    const len = this._d.length();
    if (len < 1e-4) return;
    this._d.divideScalar(len);
    this._q.setFromUnitVectors(UP, this._d);
    this._p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this._s.set(r, len, r);
    this._m.compose(this._p, this._q, this._s);
    this.rods.setMatrixAt(this.nR, this._m);
    this.rods.setColorAt(this.nR, col);
    this.nR++;
  }
  private addJoint(x: number, y: number, z: number, r: number, col: THREE.Color): void {
    if (this.nJ >= MAXJ) return;
    this._q.identity();
    this._p.set(x, y, z);
    this._s.set(r, r, r);
    this._m.compose(this._p, this._q, this._s);
    this.joints.setMatrixAt(this.nJ, this._m);
    this.joints.setColorAt(this.nJ, col);
    this.nJ++;
  }
  private addHook(x: number, y: number, z: number, side: Side, k: number): void {
    if (this.nH >= MAXH || k < 0.02) return;
    this.addRod(x, y, z, x, y - 0.11 * k, z, 0.013, C_INK);
    this._q.setFromAxisAngle(UP, side === 'l' ? Math.PI : 0);
    this._p.set(x + (side === 'l' ? -0.06 : 0.06) * k, y - 0.11 * k, z);
    this._s.set(k, k, k);
    this._m.compose(this._p, this._q, this._s);
    this.hooks.setMatrixAt(this.nH, this._m);
    this.hooks.setColorAt(this.nH, C_INK);
    this.nH++;
  }
  private addLoop(x: number, y: number, z: number, yaw: number, k: number): void {
    if (this.nL >= MAXL) return;
    this._q.setFromAxisAngle(UP, yaw);
    this._p.set(x, y, z);
    this._s.set(k, k, k);
    this._m.compose(this._p, this._q, this._s);
    this.loops.setMatrixAt(this.nL, this._m);
    this.loops.setColorAt(this.nL, C_INK);
    this.nL++;
  }
  private cobMix(cob: number): THREE.Color {
    return cob <= 0 ? C_INK : this._c.copy(C_INK).lerp(C_COB, cob);
  }

  /* ---------- drawing a pose ---------- */

  draw(P: AvlPose, dt: number, view: DrawView): void {
    const camera = this.camera,
      clock = view.clock;
    this.nR = this.nJ = this.nH = this.nL = 0;
    const dtS = dt * view.speed;
    const subN = Math.max(1, Math.ceil(dtS / (1 / 120))),
      subDt = dtS / subN;
    const seen = new Set<number>();
    // discs
    for (const [id, n] of P.nodes) {
      const vis = this.getVis(id, n.v);
      seen.add(id);
      vis.hidden = 0;
      // pendulum: a disc trails a little when its support moves
      if (vis.x1 == null || vis.x2 == null || dtS <= 0) {
        vis.x1 = vis.x2 = n.x;
      } else if (!REDUCED) {
        const drive = 0.05 * Math.max(-250, Math.min(250, (n.x - 2 * vis.x1 + vis.x2) / (dtS * dtS)));
        vis.x2 = vis.x1;
        vis.x1 = n.x;
        for (let k = 0; k < subN; k++) {
          vis.swV += (-38 * vis.sw - 5.5 * vis.swV - drive) * subDt;
          vis.sw += vis.swV * subDt;
        }
        vis.sw = Math.max(-0.28, Math.min(0.28, vis.sw));
      }
      const x = n.x + vis.sw;
      vis.group.visible = n.a > 0.01;
      vis.group.position.set(x, n.y, n.z);
      vis.group.rotation.set(0, Math.atan2(camera.position.x - x, camera.position.z - n.z), 0);
      vis.group.scale.setScalar(n.s);
      vis.discMat.color.setRGB(n.fr, n.fg, n.fb);
      vis.faceMat.color.setRGB(n.nr, n.ng, n.nb);
      const fading = n.a < 0.999;
      if (vis.discMat.transparent !== fading) {
        vis.discMat.transparent = fading;
        vis.discMat.depthWrite = !fading;
        vis.discMat.needsUpdate = true;
      }
      vis.discMat.opacity = n.a;
      vis.faceMat.opacity = n.a;
      vis.disc.castShadow = n.a > 0.5;
      const b = Math.max(-2, Math.min(2, n.bf));
      if (vis.bfShown !== b || vis.badgeMat.map !== this.badgeTex[b]) {
        vis.badgeMat.map = this.badgeTex[b];
        vis.bfShown = b;
      }
      vis.badge.visible = view.badges;
      vis.badgeMat.opacity = n.a;
      vis.ringC.visible = n.ringC > 0.01;
      vis.ringC.material.opacity = n.ringC * n.a;
      const alarm = Math.abs(n.bf) >= 2 ? n.a : 0;
      vis.ringR.visible = vis.pulse.visible = alarm > 0.01;
      if (alarm > 0.01) {
        vis.ringR.material.opacity = alarm;
        const f = (clock * 0.9 + vis.phase) % 1;
        vis.pulse.scale.setScalar(1 + (REDUCED ? 0 : 0.35 * f));
        vis.pulse.material.opacity = alarm * 0.55 * (1 - f);
      }
      const sel = view.selected === id ? n.a : 0;
      vis.ringS.visible = sel > 0.01;
      vis.ringS.material.opacity = sel;
      vis.rx = x;
      this.addLoop(x, n.y + (R + 0.055) * n.s, n.z, vis.group.rotation.y, n.s * (n.a > 0.3 ? 1 : n.a / 0.3));
    }
    for (const [id, vis] of this.visuals) {
      if (seen.has(id)) continue;
      vis.group.visible = false;
      vis.x1 = null;
      vis.pres = 0;
      vis.hidden += dt;
      if (vis.hidden > 4 && !view.isLive(id)) this.dropVis(id);
    }

    // arms and wires
    const byP = new Map<number, (PoseLink & { slot?: AvlPose['slot'] })[]>();
    const want = (p: number) => {
      let a = byP.get(p);
      if (!a) byP.set(p, (a = []));
      return a;
    };
    for (const L of P.links) if (L.p != null) want(L.p).push(L);
    if (P.slot && P.slot.p != null && P.slot.side)
      want(P.slot.p).push({ p: P.slot.p, c: -1, side: P.slot.side, ext: 1, cob: P.slot.cob, slot: P.slot });
    const hookReq = new Map<string, number>();
    for (const h of P.hooks) hookReq.set(`${h.p}${h.side}`, h.a);

    const topOf = (L: PoseLink & { slot?: AvlPose['slot'] }) => {
      if (L.slot) return { bx: L.slot.x, x: L.slot.x, y: L.slot.y, z: L.slot.z };
      const c = P.nodes.get(L.c);
      if (!c) return null;
      const cv = this.visuals.get(L.c);
      return { bx: c.x, x: cv ? cv.rx : c.x, y: c.y + (R + 0.1) * c.s, z: c.z };
    };
    // ceiling wires
    for (const L of P.links) {
      if (L.p != null) continue;
      const tp = topOf(L);
      if (!tp) continue;
      const by = lerp(CEIL, tp.y, L.ext);
      this.addRod(tp.bx, CEIL, tp.z, lerp(tp.bx, tp.x, L.ext), by, tp.z, 0.016, this.cobMix(L.cob));
    }
    if (P.slot && P.slot.p == null)
      this.addRod(P.slot.x, CEIL, 0, P.slot.x, P.slot.y, 0, 0.016, this.cobMix(P.slot.cob));

    for (const [id, n] of P.nodes) {
      const vis = this.visuals.get(id);
      if (!vis) continue;
      const links = byP.get(id) || [];
      let presT = 0;
      for (const L of links) presT = Math.max(presT, L.ext);
      for (const s of ['l', 'r']) {
        const h = hookReq.get(`${id}${s}`);
        if (h) presT = Math.max(presT, h);
      }
      vis.pres += (presT - vis.pres) * (1 - Math.exp(-dtS * 12));
      if (presT >= 0.999 && vis.pres > 0.98) vis.pres = 1;
      // bar tilt: a damped spring toward the balance factor
      let target = tiltFor(n.bf, vis.longArm);
      if (!REDUCED) target += 0.01 * Math.sin(clock * 0.8 + vis.phase);
      for (let k = 0; k < subN; k++) {
        vis.tiltV += (70 * (target - vis.tilt) - 6.5 * vis.tiltV) * subDt;
        vis.tilt += vis.tiltV * subDt;
      }
      vis.tilt = Math.max(-0.6, Math.min(0.6, vis.tilt));
      if (vis.pres < 0.01 || n.a < 0.02) continue;
      const k = vis.pres * Math.min(1, n.a * 2);
      const rx = vis.rx,
        pz = n.z;
      const py = n.y - (R + STEM * k) * n.s;
      const tan = Math.tan(vis.tilt);
      this.addRod(rx, n.y - R * n.s, pz, rx, py, pz, 0.02, C_INK);
      this.addJoint(rx, py, pz, 0.05 * k, C_INK);
      let longArm = STUB;
      for (const side of ['l', 'r'] as const) {
        let armMax = 0;
        for (const L of links) {
          if (L.side !== side) continue;
          const tp = topOf(L);
          if (!tp) continue;
          const armE = clamp01(L.ext * 2),
            wireE = clamp01(L.ext * 2 - 1);
          const stubX = rx + (side === 'l' ? -STUB : STUB) * k;
          const ex = lerp(stubX, tp.bx, armE),
            ey = py + (ex - rx) * tan;
          const col = this.cobMix(L.cob);
          this.addRod(rx, py, pz, ex, ey, pz, 0.026, col);
          this.addJoint(ex, ey, pz, 0.034, col);
          if (wireE > 0.001)
            this.addRod(ex, ey, pz, lerp(ex, tp.x, wireE), lerp(ey, tp.y, wireE), lerp(pz, tp.z, wireE), 0.016, col);
          longArm = Math.max(longArm, Math.abs(tp.bx - rx));
          armMax = Math.max(armMax, armE);
        }
        if (armMax < 0.06) {
          const sx = rx + (side === 'l' ? -STUB : STUB) * k,
            sy = py + (sx - rx) * tan;
          if (armMax === 0) this.addRod(rx, py, pz, sx, sy, pz, 0.026, C_INK);
          this.addHook(sx, sy, pz, side, k);
        }
      }
      vis.longArm = longArm;
    }

    // the lever: two nodes locked together while they swing
    if (P.lever) {
      const a = this.visuals.get(P.lever.a),
        b = this.visuals.get(P.lever.b),
        na = P.nodes.get(P.lever.a),
        nb = P.nodes.get(P.lever.b);
      if (a && b && na && nb) {
        const mx = (a.rx + b.rx) / 2,
          my = (na.y + nb.y) / 2,
          e = P.lever.ext;
        this.addRod(
          lerp(mx, a.rx, e),
          lerp(my, na.y, e),
          -0.1,
          lerp(mx, b.rx, e),
          lerp(my, nb.y, e),
          -0.1,
          0.05 * Math.min(1, e * 3),
          C_COB,
        );
        this.addJoint(mx, my, -0.1, 0.075 * Math.min(1, e * 3), C_COB);
      }
    }
    // clips hold a subtree in place while it changes parent
    let nC = 0;
    for (const cl of P.clips) {
      if (nC >= MAXC) break;
      const c = P.nodes.get(cl.c),
        cv = this.visuals.get(cl.c);
      if (!c || !cv) continue;
      const x = cl.follow ? cv.rx : cl.x;
      this._q.identity();
      this._p.set(x, cl.y, cl.z);
      this._s.setScalar(Math.max(0.01, cl.a));
      this._m.compose(this._p, this._q, this._s);
      this.clipMeshes.setMatrixAt(nC++, this._m);
      this.addRod(x, cl.y, cl.z, cv.rx, c.y + (R + 0.1) * c.s, c.z, 0.016, C_COB);
    }
    this.clipMeshes.count = nC;
    this.clipMeshes.instanceMatrix.needsUpdate = true;
    // rotation arrows
    if (P.arc) {
      this.buildArcs(P.arc.r);
      this.arcGroup.visible = true;
      this.arcGroup.position.set(P.arc.x, P.arc.y, 0.15);
      this.arcGroup.scale.set(1, P.arc.dir, 1);
      this.arcGroup.rotation.set(0, 0, P.arc.ang + 14 * DEG * P.arc.dir);
      this.cobaltBasic.opacity = P.arc.a;
    } else this.arcGroup.visible = false;
    // the value in hand
    const V = P.visitor,
      visitor = this.visitor;
    if (V && V.a > 0.01) {
      if (visitor.v !== V.v) {
        visitor.v = V.v;
        visitor.faceMat.map = this.numeralTexture(V.v);
      }
      visitor.group.visible = true;
      visitor.group.position.set(V.x, V.y, V.z + 0.05);
      visitor.group.rotation.set(0, Math.atan2(camera.position.x - V.x, camera.position.z - V.z), 0);
      visitor.group.scale.setScalar((VR / R) * V.s);
      const fading = V.a < 0.999;
      if (visitor.discMat.transparent !== fading) {
        visitor.discMat.transparent = fading;
        visitor.discMat.needsUpdate = true;
      }
      visitor.discMat.opacity = V.a;
      visitor.faceMat.opacity = V.a;
      visitor.disc.castShadow = V.a > 0.5;
      this.addLoop(V.x, V.y + VR * V.s + 0.05, V.z + 0.05, visitor.group.rotation.y, V.s * 0.8);
    } else visitor.group.visible = false;

    for (const m of [this.rods, this.joints, this.hooks, this.loops]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.rods.count = this.nR;
    this.joints.count = this.nJ;
    this.hooks.count = this.nH;
    this.loops.count = this.nL;
  }

  /** Give every arm a random nudge, as if the air moved. */
  kickAll(v: number): void {
    if (REDUCED) return;
    for (const vis of this.visuals.values()) vis.tiltV += (Math.random() - 0.5) * v * 10;
  }

  /* ---------- camera and lights ---------- */

  /** The part of the wall the mobile and the value in hand occupy. */
  frameBox(P: AvlPose): FrameBox {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of P.nodes.values()) {
      if (n.a < 0.05) continue;
      minX = Math.min(minX, n.x - R - 0.55);
      maxX = Math.max(maxX, n.x + R + 0.55);
      minY = Math.min(minY, n.y - R - 0.5);
      maxY = Math.max(maxY, n.y + R + 0.35);
    }
    if (P.visitor && P.visitor.a > 0.05) {
      minY = Math.min(minY, P.visitor.y - VR - 0.3);
      maxY = Math.max(maxY, P.visitor.y + VR + 0.3);
    }
    if (minX === Infinity) {
      minX = -2;
      maxX = 2;
      minY = -2;
      maxY = 1.5;
    }
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      hw: Math.max(3.4, (maxX - minX) / 2),
      hh: Math.max(2.8, (maxY - minY) / 2),
    };
  }

  /** Lights follow the piece. */
  fitLights(P: AvlPose): void {
    const { key, pool, KEY_DIR } = this.stage;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of P.nodes.values()) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    if (minX === Infinity) {
      minX = -2;
      maxX = 2;
      minY = -2;
      maxY = 1;
    }
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    const half = Math.max(maxX - minX, maxY - minY) / 2 + 5;
    key.target.position.set(cx, cy, WALL_Z);
    key.position.copy(key.target.position).addScaledVector(KEY_DIR, 40);
    const sc = key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 5;
    sc.far = 80;
    sc.updateProjectionMatrix();
    pool.position.set(cx - 3, cy + 5, 38);
    pool.target.position.set(cx + 0.8, cy - 1, WALL_Z);
    pool.angle = Math.min(1.2, Math.atan((half + 3) / 40));
  }
}
