// Common Three.js setup for every chapter: renderer, scene, camera and orbit
// controls, gallery lighting, the plaster texture, and a framer that keeps the
// piece inside the free part of the screen.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { lerp } from './math';
import { REDUCED } from './prefs';

export const DEG = Math.PI / 180;

type Vec3Tuple = [number, number, number];

export interface StageOptions {
  canvas: HTMLCanvasElement;
  background?: number;
  envIntensity?: number;
  cameraPos?: Vec3Tuple;
  target?: Vec3Tuple;
  /** Overrides for the orbit controls' limits. */
  controls?: Partial<
    Pick<
      OrbitControls,
      'minAzimuthAngle' | 'maxAzimuthAngle' | 'minPolarAngle' | 'maxPolarAngle' | 'minDistance' | 'maxDistance'
    >
  >;
  keyDir?: Vec3Tuple;
  shadowSize?: number;
}

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  pool: THREE.SpotLight;
  KEY_DIR: THREE.Vector3;
  onResize(fn: () => void): void;
}

export function createStage({
  canvas,
  background = 0xddd4c3,
  envIntensity = 0.3,
  cameraPos = [-4, -2, 34],
  target = [0, -2, 0],
  controls: limits = {},
  keyDir = [-0.45, 0.55, 1],
  shadowSize = 2048,
}: StageOptions): Stage {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="noGL">This piece needs WebGL, which this browser has turned off. Try another browser or enable hardware acceleration.</div>',
    );
    throw err;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft in three r182+, which retired PCFSoftShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = envIntensity;

  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(...cameraPos);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.9;
  controls.minAzimuthAngle = -1.05;
  controls.maxAzimuthAngle = 1.05;
  controls.minPolarAngle = 0.95;
  controls.maxPolarAngle = 2.0;
  controls.minDistance = 3.5;
  controls.maxDistance = 170;
  controls.screenSpacePanning = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  Object.assign(controls, limits);
  controls.target.set(...target);

  // a warm key from the upper left casts the shadows; a soft pool follows the piece
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d1c3, 0.8);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff6ea, 1.3);
  const KEY_DIR = new THREE.Vector3(...keyDir).normalize();
  key.castShadow = true;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const pool = new THREE.SpotLight(0xfff8f0, 0.8, 0, 0.5, 1, 0);
  scene.add(pool, pool.target);

  const resizers: (() => void)[] = [];
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    for (const f of resizers) f();
  });
  return { renderer, scene, camera, controls, hemi, key, pool, KEY_DIR, onResize: f => resizers.push(f) };
}

/** Seamless plaster: soft mottling plus fine grain. */
export function plasterTexture({
  base = '#ECE6DA',
  repeat = [18, 12] as [number, number],
  seed = 7,
} = {}): THREE.CanvasTexture {
  const S = 512,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D is not available');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S,
      y = rnd() * S,
      r = 30 + rnd() * 110,
      light = rnd() < 0.5;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, light ? 'rgba(255,252,245,0.05)' : 'rgba(120,100,78,0.022)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  const img = g.getImageData(0, 0, S, S),
    d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 7;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A screen rectangle in CSS pixels. */
export interface ScreenRect {
  l: number;
  r: number;
  t: number;
  b: number;
}
/** The piece's extent: centre, and half extents across and up the screen. */
export interface FrameBox {
  cx: number;
  cy: number;
  cz?: number;
  hw: number;
  hh: number;
  /** Extra distance to keep, for pieces that come toward the camera. */
  depth?: number;
}
/** Lean toward a point by weight w (0..1). */
export interface FrameFocus {
  x: number;
  y: number;
  z?: number;
  w: number;
  zoom?: number;
}
/** Ease the orbit toward these angles while the user has not turned the view. */
export interface FrameAngles {
  theta?: number;
  phi?: number;
  rate?: number;
}
export interface Framer {
  free: ScreenRect;
  home: { theta: number; phi: number };
  readonly auto: boolean;
  update(dt: number, box: FrameBox, focus?: FrameFocus | null, angles?: FrameAngles | null): void;
  /** The user zoomed or panned: stop framing until Reset view. */
  manual(): void;
  /** The user orbited: stop easing the angles. */
  turned(): void;
  reset(): void;
  /** Put the camera at the home angles, radius r from the current target. */
  place(r: number): void;
}

export interface FramerOptions {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  home: { theta: number; phi: number };
  frameButton?: HTMLElement | null;
  lockZ?: boolean;
  minDist?: number;
  maxDist?: number;
}

/**
 * Keeps the piece framed inside `free` while the user has not zoomed or panned.
 * Orbiting keeps framing on; zoom or pan hands the camera to the user until Reset view.
 */
export function createFramer({
  camera,
  controls,
  home,
  frameButton,
  lockZ = true,
  minDist = 6,
  maxDist = 160,
}: FramerOptions): Framer {
  const S = {
    auto: true,
    reset: false,
    tx: controls.target.x,
    ty: controls.target.y,
    tz: controls.target.z,
    dist: 34,
    init: false,
    userTurned: false,
  };
  const sph = new THREE.Spherical(),
    off = new THREE.Vector3(),
    right = new THREE.Vector3(),
    up = new THREE.Vector3(),
    fwd = new THREE.Vector3();
  const framer: Framer = {
    free: { l: 0, r: innerWidth, t: 0, b: innerHeight },
    home,
    get auto() {
      return S.auto;
    },
    update(dt, box, focus, angles) {
      if (S.reset) {
        off.copy(camera.position).sub(controls.target);
        sph.setFromVector3(off);
        const k = 1 - Math.exp(-dt * 5);
        sph.theta = lerp(sph.theta, framer.home.theta, k);
        sph.phi = lerp(sph.phi, framer.home.phi, k);
        if (Math.abs(sph.theta - framer.home.theta) < 0.002 && Math.abs(sph.phi - framer.home.phi) < 0.002)
          S.reset = false;
        off.setFromSpherical(sph);
        camera.position.copy(controls.target).add(off);
      } else if (angles && S.auto && !S.userTurned) {
        off.copy(camera.position).sub(controls.target);
        sph.setFromVector3(off);
        const k = 1 - Math.exp(-dt * (angles.rate || 1.6));
        if (angles.theta != null) sph.theta = lerp(sph.theta, angles.theta, k);
        if (angles.phi != null) sph.phi = lerp(sph.phi, angles.phi, k);
        off.setFromSpherical(sph);
        camera.position.copy(controls.target).add(off);
      }
      if (!S.auto) return;
      let cx = box.cx,
        cy = box.cy,
        cz = box.cz || 0;
      const hw = box.hw,
        hh = box.hh;
      const free = framer.free;
      const W = innerWidth,
        H = innerHeight,
        aspect = W / H;
      const tanV = Math.tan((camera.fov * DEG) / 2);
      const x0 = (free.l / W) * 2 - 1,
        x1 = (free.r / W) * 2 - 1,
        y0 = 1 - (free.b / H) * 2,
        y1 = 1 - (free.t / H) * 2;
      let dist =
        Math.max(hw / ((tanV * aspect * (x1 - x0)) / 2), hh / ((tanV * (y1 - y0)) / 2)) * 1.06 + (box.depth || 0);
      if (focus && !REDUCED) {
        // lean in on the moment that matters
        const f = focus.w;
        cx = lerp(cx, focus.x, 0.35 * f);
        cy = lerp(cy, focus.y, 0.35 * f);
        if (focus.z != null) cz = lerp(cz, focus.z, 0.35 * f);
        dist *= 1 - (focus.zoom ?? 0.12) * f;
      }
      dist = Math.max(minDist, Math.min(maxDist, dist));
      if (!S.init) {
        S.tx = cx;
        S.ty = cy;
        S.tz = cz;
        S.dist = dist;
        S.init = true;
      }
      const k = 1 - Math.exp(-dt * 2.6);
      S.dist = lerp(S.dist, dist, k);
      off.copy(camera.position).sub(controls.target);
      sph.setFromVector3(off);
      sph.radius = S.dist;
      off.setFromSpherical(sph);
      camera.matrixWorld.extractBasis(right, up, fwd);
      const halfH = tanV * S.dist,
        halfW = halfH * aspect;
      const mx = (x0 + x1) / 2,
        my = (y0 + y1) / 2;
      const gx = cx - right.x * mx * halfW - up.x * my * halfH;
      const gy = cy - right.y * mx * halfW - up.y * my * halfH;
      const gz = cz - right.z * mx * halfW - up.z * my * halfH;
      S.tx = lerp(S.tx, gx, k);
      S.ty = lerp(S.ty, gy, k);
      S.tz = lerp(S.tz, gz, k);
      controls.target.set(S.tx, S.ty, lockZ ? 0 : S.tz);
      camera.position.copy(controls.target).add(off);
    },
    manual() {
      if (S.auto) {
        S.auto = false;
        frameButton?.classList.add('manual');
      }
    },
    turned() {
      S.userTurned = true;
    },
    reset() {
      S.auto = true;
      S.reset = true;
      S.userTurned = false;
      frameButton?.classList.remove('manual');
    },
    place(r) {
      sph.set(r, framer.home.phi, framer.home.theta);
      off.setFromSpherical(sph);
      camera.position.copy(controls.target).add(off);
      camera.lookAt(controls.target);
    },
  };
  return framer;
}
