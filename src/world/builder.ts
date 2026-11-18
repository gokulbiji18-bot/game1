import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Collision } from '../collision';
import { SurfaceId, surfaceMaterial } from './materials';

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

// ---- surface detail: a tileable noise texture sampled in world space (triplanar), so merged
// geometry with no UVs still gets grain, blotches, a bump and roughness variation.
function detailTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  // tileable value noise: lattice values wrap around the edges
  const lattice = (cells: number, seed: number) => {
    const v: number[] = [];
    for (let i = 0; i < cells * cells; i++) v.push(Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1);
    return (x: number, y: number) => {
      const gx = (x / N) * cells, gy = (y / N) * cells;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const at = (a: number, b: number) => v[((b % cells) + cells) % cells * cells + (((a % cells) + cells) % cells)];
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bot = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      return top * (1 - sy) + bot * sy;
    };
  };
  const fine = [lattice(64, 1), lattice(128, 2), lattice(32, 3)];
  const broad = [lattice(4, 4), lattice(8, 5), lattice(16, 6)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const f = fine[0](x, y) * 0.45 + fine[1](x, y) * 0.35 + fine[2](x, y) * 0.2;
      const b = broad[0](x, y) * 0.5 + broad[1](x, y) * 0.3 + broad[2](x, y) * 0.2;
      const i = (y * N + x) * 4;
      img.data[i] = f * 255;
      img.data[i + 1] = b * 255;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const detailTex = detailTexture();

/** Adds world-space grain, blotches, roughness variation and a small bump to a standard material. */
export function withDetail(m: THREE.MeshStandardMaterial, strength: number, bump: number) {
  const uniforms = { uDetail: { value: detailTex }, uDetailStrength: { value: strength }, uBump: { value: bump } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vDetailPos;\nvarying vec3 vDetailN;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vDetailPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vDetailN = normalize(mat3(modelMatrix) * objectNormal);',
    );
    sh.fragmentShader =
      'uniform sampler2D uDetail;\nuniform float uDetailStrength;\nuniform float uBump;\nvarying vec3 vDetailPos;\nvarying vec3 vDetailN;\n' +
      sh.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  vec3 dbw = pow(abs(vDetailN), vec3(4.0));
  dbw /= (dbw.x + dbw.y + dbw.z + 1e-5);
  vec2 dfx = texture2D(uDetail, vDetailPos.zy * 1.6).rg;
  vec2 dfy = texture2D(uDetail, vDetailPos.xz * 1.6).rg;
  vec2 dfz = texture2D(uDetail, vDetailPos.xy * 1.6).rg;
  float detailF = dfx.r * dbw.x + dfy.r * dbw.y + dfz.r * dbw.z;
  float detailB = texture2D(uDetail, vDetailPos.zy * 0.11).g * dbw.x + texture2D(uDetail, vDetailPos.xz * 0.11).g * dbw.y + texture2D(uDetail, vDetailPos.xy * 0.11).g * dbw.z;
  diffuseColor.rgb *= 1.0 + (detailB - 0.5) * 0.3 * uDetailStrength;
  float detailH = detailF;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor + (detailB - 0.5) * 0.25, 0.05, 1.0);',
        )
;
  };
  m.customProgramCacheKey = () => `detail-${strength}-${bump}`;
  return m;
}

export const litMaterial = withDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }), 0.6, 0);
/** Polished floors and asphalt: catches lamp highlights and environment reflections. */
export const glossMaterial = withDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0, envMapIntensity: 1.0 }), 0.4, 0);
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
  /** Polished surface (floors, asphalt). */
  gloss?: boolean;
  /** Photo-textured PBR surface (wood, plaster, asphalt...). */
  surf?: SurfaceId;
}

export class Batch {
  private lit: THREE.BufferGeometry[] = [];
  private flat: THREE.BufferGeometry[] = [];
  private gloss: THREE.BufferGeometry[] = [];
  private surfs = new Map<SurfaceId, THREE.BufferGeometry[]>();
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
    else if (o?.surf) {
      if (!this.surfs.has(o.surf)) this.surfs.set(o.surf, []);
      this.surfs.get(o.surf)!.push(geo);
    } else if (o?.gloss) this.gloss.push(geo);
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
    // smooth sphere: at least detail 2, with normals pointing straight out (no faceting)
    const g = new THREE.IcosahedronGeometry(1, Math.max(2, o?.detail ?? 2));
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      _p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      nrm.setXYZ(i, _p.x, _p.y, _p.z);
    }
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
    for (const [id, list] of this.surfs) {
      const m = new THREE.Mesh(mergeGeometries(list), surfaceMaterial(id));
      m.castShadow = id !== 'asphalt' && id !== 'pavers' && id !== 'grass';
      m.receiveShadow = true;
      group.add(m);
      list.forEach((g) => g.dispose());
    }
    this.surfs.clear();
    if (this.gloss.length) {
      const m = new THREE.Mesh(mergeGeometries(this.gloss), glossMaterial);
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
    this.gloss.forEach((g) => g.dispose());
    this.gloss = [];
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
