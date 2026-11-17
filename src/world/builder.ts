import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Collision } from '../collision';

// Static geometry is baked with vertex colors and merged into a couple of meshes per area,
// which keeps draw calls tiny no matter how much furniture we add.
const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: (seg: number) => new THREE.CylinderGeometry(1, 1, 1, seg, 1),
};

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _qf = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export const litMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.02 });
export const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

// Unlit "emissive" materials. With post-processing on they're pushed into HDR so bloom picks them up.
const boosted: Array<[THREE.MeshBasicMaterial, number]> = [[glowMaterial, 1.7]];
let glowBoost = 1;
export function registerGlow(m: THREE.MeshBasicMaterial, strength = 1.4) {
  boosted.push([m, strength]);
  m.color.multiplyScalar(glowBoost > 1 ? strength : 1);
  return m;
}
/** on = HDR glow for the bloom pipeline; off = plain clamp-to-white (low quality). */
export function setGlowBoost(on: boolean) {
  const next = on ? 2 : 1;
  if (next === glowBoost) return;
  for (const [m, k] of boosted) {
    if (on) m.color.multiplyScalar(k);
    else m.color.multiplyScalar(1 / k);
  }
  glowBoost = next;
}

function bake(g: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation) {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  geo.applyMatrix4(m);
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export interface PartOpts {
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  glow?: boolean;
  /** true = blocks player & camera, 'low' = blocks player only */
  collide?: boolean | 'low';
  noShadow?: boolean;
}

export class Batch {
  private lit: THREE.BufferGeometry[] = [];
  private flat: THREE.BufferGeometry[] = [];
  private glow: THREE.BufferGeometry[] = [];
  extras: THREE.Object3D[] = [];
  private cylCache = new Map<number, THREE.CylinderGeometry>();
  // Optional local frame (position + yaw) so props like scooters can be placed rotated.
  private fx = 0;
  private fz = 0;
  private fr = 0;

  constructor(public col: Collision, public ox = 0, public oz = 0) {}

  frame(x: number, z: number, rotY: number, fn: () => void) {
    const [px, pz, pr] = [this.fx, this.fz, this.fr];
    this.fx = x;
    this.fz = z;
    this.fr = rotY;
    fn();
    [this.fx, this.fz, this.fr] = [px, pz, pr];
  }

  private tx(x: number, z: number): [number, number] {
    if (!this.fr && !this.fx && !this.fz) return [x, z];
    const c = Math.cos(this.fr), s = Math.sin(this.fr);
    return [this.fx + x * c + z * s, this.fz - x * s + z * c];
  }

  private push(geo: THREE.BufferGeometry, o?: PartOpts) {
    if (o?.glow) this.glow.push(geo);
    else if (o?.noShadow) this.flat.push(geo);
    else this.lit.push(geo);
  }

  private matrix(x: number, y: number, z: number, sx: number, sy: number, sz: number, o?: PartOpts) {
    _e.set(o?.rotX ?? 0, o?.rotY ?? 0, o?.rotZ ?? 0);
    _q.setFromEuler(_e);
    if (this.fr) _q.premultiply(_qf.setFromAxisAngle(_up, this.fr));
    [x, z] = this.tx(x, z);
    _p.set(x + this.ox, y, z + this.oz);
    _s.set(sx, sy, sz);
    return _m.compose(_p, _q, _s);
  }

  /** Box with its base at y. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, o?: PartOpts) {
    this.push(bake(UNIT.box, this.matrix(x, y + h / 2, z, w, h, d, o), color), o);
    if (o?.collide) {
      const [cx, cz] = this.tx(x, z);
      this.col.addRect(cx + this.ox, cz + this.oz, w, d, (o.rotY ?? 0) + this.fr, o.collide === true);
    }
  }

  /** Cylinder with its base at y. */
  cyl(x: number, y: number, z: number, r: number, h: number, color: THREE.ColorRepresentation, seg = 10, o?: PartOpts & { rTop?: number }) {
    let g: THREE.BufferGeometry;
    if (o?.rTop !== undefined) g = new THREE.CylinderGeometry(o.rTop / r, 1, 1, seg, 1);
    else {
      if (!this.cylCache.has(seg)) this.cylCache.set(seg, UNIT.cyl(seg));
      g = this.cylCache.get(seg)!;
    }
    this.push(bake(g, this.matrix(x, y + h / 2, z, r, h, r, o), color), o);
    if (o?.collide) {
      const [cx, cz] = this.tx(x, z);
      this.col.addRect(cx + this.ox, cz + this.oz, r * 2, r * 2, 0, o.collide === true);
    }
  }

  /** Sphere/ellipsoid centered at (x,y,z). */
  sphere(x: number, y: number, z: number, r: number, color: THREE.ColorRepresentation, o?: PartOpts & { sy?: number; sx?: number; sz?: number; detail?: number }) {
    const g = new THREE.IcosahedronGeometry(1, o?.detail ?? 1);
    this.push(bake(g, this.matrix(x, y, z, r * (o?.sx ?? 1), r * (o?.sy ?? 1), r * (o?.sz ?? 1), o), color), o);
  }

  cone(x: number, y: number, z: number, r: number, h: number, color: THREE.ColorRepresentation, seg = 7, o?: PartOpts) {
    const g = new THREE.ConeGeometry(1, 1, seg);
    this.push(bake(g, this.matrix(x, y + h / 2, z, r, h, r, o), color), o);
  }

  geo(g: THREE.BufferGeometry, x: number, y: number, z: number, color: THREE.ColorRepresentation, o?: PartOpts & { s?: number }) {
    const s = o?.s ?? 1;
    this.push(bake(g, this.matrix(x, y, z, s, s, s, o), color), o);
  }

  /** Textured plane (signs, posters, screens). Facing +Z by default; rotY to turn. */
  plane(x: number, y: number, z: number, w: number, h: number, map: THREE.Texture, o?: { rotY?: number; rotX?: number; basic?: boolean; transparent?: boolean; opacity?: number }) {
    const mat = o?.basic
      ? registerGlow(new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent: !!o?.transparent, opacity: o?.opacity ?? 1, depthWrite: !o?.transparent }), 1.25)
      : new THREE.MeshStandardMaterial({ map, roughness: 0.7, transparent: !!o?.transparent });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x + this.ox, y, z + this.oz);
    m.rotation.set(o?.rotX ?? 0, o?.rotY ?? 0, 0);
    this.extras.push(m);
    return m;
  }

  /** Collider-only rectangle that respects the current frame. */
  rect(x: number, z: number, w: number, d: number, tall = true) {
    const [cx, cz] = this.tx(x, z);
    return this.col.addRect(cx + this.ox, cz + this.oz, w, d, this.fr, tall);
  }

  /** Colliders without visuals. */
  wall(minX: number, minZ: number, maxX: number, maxZ: number, tall = true) {
    return this.col.add(minX + this.ox, minZ + this.oz, maxX + this.ox, maxZ + this.oz, tall);
  }

  build(name: string) {
    const group = new THREE.Group();
    group.name = name;
    if (this.lit.length) {
      const m = new THREE.Mesh(mergeGeometries(this.lit), litMaterial);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    if (this.flat.length) {
      const m = new THREE.Mesh(mergeGeometries(this.flat), litMaterial);
      m.receiveShadow = true;
      group.add(m);
    }
    if (this.glow.length) group.add(new THREE.Mesh(mergeGeometries(this.glow), glowMaterial));
    this.extras.forEach((e) => group.add(e));
    this.lit.forEach((g) => g.dispose());
    this.flat.forEach((g) => g.dispose());
    this.glow.forEach((g) => g.dispose());
    this.lit = [];
    this.flat = [];
    this.glow = [];
    return group;
  }
}

export interface LightDef {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

/** Fixed-size pool of point lights that follows the player (no shader recompiles). */
export class LightPool {
  lights: THREE.PointLight[] = [];
  defs: LightDef[] = [];
  private timer = 0;

  constructor(scene: THREE.Scene, n = 4) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
  }

  update(dt: number, px: number, pz: number, force = false) {
    this.timer -= dt;
    if (this.timer > 0 && !force) return;
    this.timer = 0.3;
    const sorted = this.defs
      .map((d) => ({ d, k: (d.x - px) ** 2 + (d.z - pz) ** 2 }))
      .sort((a, b) => a.k - b.k);
    this.lights.forEach((l, i) => {
      const s = sorted[i];
      if (!s || s.k > 30 * 30) {
        l.intensity = 0;
        return;
      }
      l.position.set(s.d.x, s.d.y, s.d.z);
      l.color.setHex(s.d.color);
      l.intensity = s.d.intensity;
      l.distance = s.d.distance;
    });
  }
}
