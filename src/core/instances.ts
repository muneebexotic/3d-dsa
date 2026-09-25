// Instanced wire-work shared by the chapters: rods, balls, cones and camera-facing
// discs, each kind drawn in one call. A scene calls begin(), adds pieces for the
// frame, then end(). Nothing is allocated per piece.

import * as THREE from 'three';
import type { RGB } from './color';

const UP = new THREE.Vector3(0, 1, 0);

/** One instanced mesh refilled every frame. */
export class InstancedBatch {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  private readonly max: number;
  private readonly c = new THREE.Color();

  constructor(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, max: number) {
    this.max = max;
    const m = new THREE.InstancedMesh(geometry, material, max);
    m.castShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    m.setColorAt(0, new THREE.Color(0xffffff));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
    this.mesh = m;
  }

  get full(): boolean {
    return this.n >= this.max;
  }

  begin(): void {
    this.n = 0;
  }

  /** Add one instance. Returns false (and draws nothing) once the batch is full. */
  add(matrix: THREE.Matrix4, col: RGB): boolean {
    if (this.n >= this.max) return false;
    this.mesh.setMatrixAt(this.n, matrix);
    this.c.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
    this.mesh.setColorAt(this.n, this.c);
    this.n++;
    return true;
  }

  end(): void {
    const m = this.mesh;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.count = this.n;
  }
}

export interface WireKitOptions {
  /** Material factory; each kind of piece gets its own material. */
  material: (kind: 'rod' | 'ball' | 'cone' | 'disc') => THREE.Material;
  /** Radius of a disc at scale 1. */
  discRadius: number;
  /** Thickness of a disc. */
  discDepth?: number;
  max: { rods: number; balls: number; cones: number; discs: number };
}

/**
 * Rods between two points, balls, cones (tip at the given point) and discs that
 * face the camera: everything a wire sculpture is made of.
 */
export class WireKit {
  readonly rods: InstancedBatch;
  readonly balls: InstancedBatch;
  readonly cones: InstancedBatch;
  readonly discs: InstancedBatch;
  private readonly all: InstancedBatch[];
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _s = new THREE.Vector3();
  private readonly _p = new THREE.Vector3();
  private readonly _d = new THREE.Vector3();

  constructor(scene: THREE.Scene, { material, discRadius, discDepth = 0.08, max }: WireKitOptions) {
    const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, discDepth, 40, 1);
    discGeo.rotateX(Math.PI / 2);
    this.discs = new InstancedBatch(scene, discGeo, material('disc'), max.discs);
    this.rods = new InstancedBatch(scene, new THREE.CylinderGeometry(1, 1, 1, 6, 1), material('rod'), max.rods);
    this.balls = new InstancedBatch(scene, new THREE.SphereGeometry(1, 12, 9), material('ball'), max.balls);
    const coneGeo = new THREE.ConeGeometry(1, 1, 12);
    coneGeo.translate(0, -0.5, 0); // tip at the origin
    this.cones = new InstancedBatch(scene, coneGeo, material('cone'), max.cones);
    this.all = [this.discs, this.rods, this.balls, this.cones];
  }

  begin(): void {
    for (const b of this.all) b.begin();
  }
  end(): void {
    for (const b of this.all) b.end();
  }

  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, col: RGB): void {
    if (this.rods.full) return;
    const d = this._d.set(bx - ax, by - ay, bz - az);
    const len = d.length();
    if (len < 1e-4 || r < 1e-4) return;
    d.divideScalar(len);
    this._q.setFromUnitVectors(UP, d);
    this._p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this._s.set(r, len, r);
    this.rods.add(this._m.compose(this._p, this._q, this._s), col);
  }

  ball(x: number, y: number, z: number, r: number, col: RGB): void {
    if (this.balls.full || r < 1e-4) return;
    this._q.identity();
    this._p.set(x, y, z);
    this._s.set(r, r, r);
    this.balls.add(this._m.compose(this._p, this._q, this._s), col);
  }

  /** A cone whose tip is at (x, y, z), pointing along (dx, dy, dz). */
  cone(x: number, y: number, z: number, dx: number, dy: number, dz: number, r: number, h: number, col: RGB): void {
    if (this.cones.full) return;
    this._d.set(dx, dy, dz).normalize();
    this._q.setFromUnitVectors(UP, this._d); // tip forward, base trailing
    this._p.set(x, y, z);
    this._s.set(r, h, r);
    this.cones.add(this._m.compose(this._p, this._q, this._s), col);
  }

  /** A disc at scale s, turned by `facing` (the camera's quaternion, so it faces the viewer). */
  disc(x: number, y: number, z: number, s: number, col: RGB, facing: THREE.Quaternion): void {
    if (this.discs.full) return;
    this._p.set(x, y, z);
    this._s.set(s, s, s);
    this.discs.add(this._m.compose(this._p, facing, this._s), col);
  }
}
