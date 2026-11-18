import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Semi-realistic procedural characters: real proportions, PBR skin/fabric/hair, and a joint
// hierarchy animated in code. Static parts under each joint are merged per material kind.
type Kind = 'skin' | 'cloth' | 'hair' | 'eye' | 'dark' | 'fur' | 'shoe';

const KIND_MATS: Record<Kind, THREE.MeshStandardMaterial> = {
  skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffd2c0) }),
  cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  hair: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }),
  eye: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06 }),
  dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }),
  fur: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
  shoe: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
};

// cotton weave normal map in object space, so the fabric pattern moves with the body
(() => {
  const u = { tWeave: { value: null as THREE.Texture | null }, uOn: { value: 0 } };
  new THREE.TextureLoader().load('assets/tex/cotton_jersey_nor.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    u.tWeave.value = t;
    u.uOn.value = 1;
  });
  const m = KIND_MATS.cloth;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vObjP;\nvarying vec3 vObjN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vObjP = position;\n  vObjN = normal;');
    sh.fragmentShader =
      'uniform sampler2D tWeave;\nuniform float uOn;\nvarying vec3 vObjP;\nvarying vec3 vObjN;\n' +
      sh.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  if (uOn > 0.5) {
    vec3 w = pow(abs(normalize(vObjN)), vec3(4.0));
    w /= (w.x + w.y + w.z);
    vec2 a = (texture2D(tWeave, vObjP.zy * 9.0).xy * 2.0 - 1.0) * w.x
           + (texture2D(tWeave, vObjP.xz * 9.0).xy * 2.0 - 1.0) * w.y
           + (texture2D(tWeave, vObjP.xy * 9.0).xy * 2.0 - 1.0) * w.z;
    normal = normalize(normal + vec3(a * 0.35, 0.0));
  }`,
      );
  };
  m.customProgramCacheKey = () => 'cloth-weave';
})();

// per-colour tagged materials used while building; merged into KIND_MATS by bakeRig
const tagCache = new Map<string, THREE.MeshStandardMaterial>();
function tagged(kind: Kind, color: number) {
  const key = `${kind}${color}`;
  let m = tagCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color });
    m.userData.kind = kind;
    tagCache.set(key, m);
  }
  return m;
}
/** Kept for the cat and props: a matte "fur/fabric" colour. */
export function toon(color: number, _emissive = 0) {
  return tagged('fur', color);
}
const basic = (color: number) => tagged('eye', color);

const G = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  sphereLo: new THREE.SphereGeometry(1, 12, 9),
  hemi: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cone: new THREE.ConeGeometry(1, 1, 12),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 14),
};

/** Tapered limb (rounded ends) hanging down from its pivot: radius r0 at the top, r1 at the bottom. */
const limbCache = new Map<string, THREE.LatheGeometry>();
function limb(r0: number, r1: number, len: number, bulge = 0) {
  const key = `${r0}|${r1}|${len}|${bulge}`;
  let g = limbCache.get(key);
  if (!g) {
    const pts: THREE.Vector2[] = [];
    const n = 10;
    pts.push(new THREE.Vector2(0.0001, 0.01));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = -t * len;
      // gentle muscle bulge in the upper third, round caps at both ends
      let r = r0 + (r1 - r0) * t + bulge * Math.sin(Math.min(1, t * 1.6) * Math.PI) * (1 - t);
      if (t < 0.08) r *= 0.75 + 0.25 * (t / 0.08);
      if (t > 0.92) r *= 0.75 + 0.25 * ((1 - t) / 0.08);
      pts.push(new THREE.Vector2(r, y));
    }
    pts.push(new THREE.Vector2(0.0001, -len - 0.01));
    // LatheGeometry faces point outward only when the profile runs bottom-to-top
    pts.reverse();
    g = new THREE.LatheGeometry(pts, 18);
    limbCache.set(key, g);
  }
  return g;
}

/** Torso shell from a radius profile [radius, height]; flattened front-to-back by the caller. */
function shell(profile: Array<[number, number]>, segs = 22) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  // LatheGeometry faces point outward only when the profile runs bottom-to-top
  if (pts[0].y > pts[pts.length - 1].y) pts.reverse();
  return new THREE.LatheGeometry(pts, segs);
}

const blobMat = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.6)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
})();
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function addBlob(root: THREE.Object3D, size: number) {
  const b = new THREE.Mesh(blobGeo, blobMat);
  b.scale.setScalar(size);
  b.position.y = 0.02;
  b.renderOrder = 1;
  root.add(b);
  return b;
}

/** Merge the static meshes under each joint into one mesh per material kind (few draw calls). */
function bakeRig(root: THREE.Object3D, keep: Set<THREE.Object3D>) {
  const pivots: THREE.Object3D[] = [];
  root.traverse((o) => pivots.push(o));
  const c = new THREE.Color();
  for (const p of pivots) {
    const groups = new Map<Kind, THREE.BufferGeometry[]>();
    const used: THREE.Mesh[] = [];
    for (const ch of p.children) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh || keep.has(m) || m.children.length) continue;
      const mat = m.material as THREE.MeshStandardMaterial;
      const kind = (mat.userData.kind as Kind) ?? 'cloth';
      m.updateMatrix();
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.applyMatrix4(m.matrix);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      c.copy(mat.color);
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind)!.push(geo);
      used.push(m);
    }
    if (!used.length) continue;
    used.forEach((m) => p.remove(m));
    for (const [kind, list] of groups) {
      const merged = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, KIND_MATS[kind]);
      mesh.castShadow = kind !== 'eye';
      mesh.receiveShadow = kind === 'skin' || kind === 'cloth';
      p.add(mesh);
    }
  }
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, p: [number, number, number], s: [number, number, number], r?: [number, number, number]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.scale.set(...s);
  if (r) m.rotation.set(...r);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent: THREE.Object3D, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

export type Pose =
  | 'idle' | 'sit' | 'phone' | 'wave' | 'talk' | 'celebrate' | 'nervous' | 'feed' | 'salute'
  | 'scan' | 'hesitate' | 'shrug' | 'carry' | 'facepalm' | 'lean';
export type Expr = 'neutral' | 'nervous' | 'happy' | 'shock' | 'determined' | 'deadpan' | 'sad';

export interface HumanoidOpts {
  skin: number;
  top: number;
  topStyle: 'hoodie' | 'tshirt' | 'kurta' | 'uniform' | 'saree' | 'vest' | 'shirt';
  accent?: number;
  bottom: number;
  bottomStyle: 'shorts' | 'pants' | 'skirt';
  shoes: number;
  hair: number;
  hairStyle: 'messy' | 'short' | 'bun' | 'bald' | 'long' | 'ponytail';
  hat?: 'backcap' | 'guard' | 'none';
  hatColor?: number;
  mustache?: boolean;
  glasses?: boolean;
  scale?: number;
  belly?: number;
  bindi?: boolean;
  iris?: number;
  blush?: boolean;
}

interface Joints {
  hips: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  foreL: THREE.Object3D;
  foreR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  kneeL: THREE.Object3D;
  kneeR: THREE.Object3D;
}

type PoseTarget = {
  hipsY: number;
  torsoX: number;
  torsoY: number;
  torsoZ: number;
  headX: number;
  headY: number;
  headZ: number;
  armLX: number; armLZ: number; foreLX: number;
  armRX: number; armRZ: number; foreRX: number;
  legLX: number; legRX: number; kneeLX: number; kneeRX: number;
  legLZ: number; legRZ: number;
};

// body measurements (metres, before the per-character scale)
const HIP_Y = 0.97;
const THIGH = 0.43;
const SHIN = 0.42;
const UPPER = 0.28;
const FORE = 0.25;

const BASE: PoseTarget = {
  hipsY: HIP_Y, torsoX: 0, torsoY: 0, torsoZ: 0, headX: 0, headY: 0, headZ: 0,
  armLX: 0, armLZ: 0.12, foreLX: -0.15, armRX: 0, armRZ: -0.12, foreRX: -0.15,
  legLX: 0, legRX: 0, kneeLX: 0, kneeRX: 0, legLZ: 0, legRZ: 0,
};

export class Humanoid {
  root = new THREE.Group();
  j: Joints;
  pose: Pose = 'idle';
  expr: Expr = 'neutral';
  speed = 0;
  /** Extra head yaw (look at target) added on top of the pose. */
  lookYaw = 0;
  /** 0..1 sweat drop visibility */
  sweat = 0;
  private cur: PoseTarget = { ...BASE };
  private phase = 0;
  private t = Math.random() * 10;
  private blinkT = 2 + Math.random() * 3;
  private eyes: THREE.Object3D[] = [];
  private brows: THREE.Mesh[] = [];
  private mouth!: THREE.Mesh;
  private sweatDrop?: THREE.Mesh;
  phone?: THREE.Object3D;
  bag?: THREE.Object3D;
  private stepCb?: () => void;
  private lastStepSign = 0;

  constructor(public o: HumanoidOpts) {
    const R = this.root;
    const hips = pivot(R, 0, HIP_Y, 0);
    const torso = pivot(hips, 0, 0.04, 0);
    const skin = tagged('skin', o.skin);
    const top = tagged('cloth', o.top);
    const bottom = tagged('cloth', o.bottom);
    const shoe = tagged('shoe', o.shoes);
    const sole = tagged('shoe', 0xece8e0);
    const hair = tagged('hair', o.hair);
    const accent = tagged('cloth', o.accent ?? 0xffffff);
    const lip = tagged('dark', darken(o.skin, 0.5));
    const belly = o.belly ?? 1;
    const style = o.topStyle;
    const female = o.bottomStyle === 'skirt' || o.hairStyle === 'bun' || o.hairStyle === 'ponytail' || o.hairStyle === 'long';

    // ---- pelvis / lower garment
    if (o.bottomStyle === 'skirt') {
      // saree / long skirt: flared to the ankles
      mesh(shell([[0, 0.08], [0.15 * belly, 0.07], [0.165 * belly, -0.05], [0.2, -0.45], [0.24, -0.86], [0.0001, -0.87]]), bottom, hips, [0, 0, 0], [1, 1, 0.78]);
    } else {
      mesh(shell([[0, 0.09], [0.15 * belly, 0.08], [0.165 * belly, 0.0], [0.168, -0.08], [0.15, -0.13], [0.0001, -0.14]]), bottom, hips, [0, 0, 0], [1, 1, 0.72]);
    }

    // ---- legs
    const legs: THREE.Object3D[] = [];
    const knees: THREE.Object3D[] = [];
    for (const side of [1, -1]) {
      const leg = pivot(hips, side * 0.088, -0.05, 0);
      const knee = pivot(leg, 0, -THIGH, 0);
      if (o.bottomStyle === 'pants') {
        mesh(limb(0.085, 0.064, THIGH + 0.02, 0.006), bottom, leg, [0, 0, 0], [1, 1, 1]);
        mesh(limb(0.064, 0.056, SHIN + 0.01), bottom, knee, [0, 0, 0], [1, 1, 1]);
      } else {
        mesh(limb(0.07, 0.05, THIGH + 0.02, 0.008), skin, leg, [0, 0, 0], [1, 1, 1]);
        mesh(limb(0.05, 0.034, SHIN, 0.012), skin, knee, [0, 0, 0], [1, 1, 1]);
        if (o.bottomStyle === 'shorts') mesh(limb(0.09, 0.082, 0.3), bottom, leg, [0, 0.01, 0], [1, 1, 1]);
      }
      // sneakers / sandals: rounded upper + sole
      mesh(G.capsule, shoe, knee, [0, -SHIN - 0.035, 0.04], [0.045, 0.075, 0.042], [Math.PI / 2, 0, 0]);
      mesh(G.box, sole, knee, [0, -SHIN - 0.062, 0.042], [0.095, 0.022, 0.27]);
      legs.push(leg);
      knees.push(knee);
    }

    // ---- torso garment
    const chest = female ? 0.168 : 0.18;
    if (style === 'hoodie') {
      mesh(shell([[0, -0.03], [0.17 * belly, -0.02], [0.175 * belly, 0.08], [0.172 * belly, 0.2], [0.185, 0.31], [chest + 0.012, 0.37], [0.17, 0.42], [0.1, 0.465], [0.07, 0.475], [0.0001, 0.48]]), top, torso, [0, 0, 0], [1, 1, 0.64]);
      mesh(G.cyl, tagged('cloth', darken(o.top, 0.85)), torso, [0, -0.005, 0], [0.176 * belly, 0.05, 0.114 * belly]); // hem
      mesh(G.box, tagged('cloth', darken(o.top, 0.9)), torso, [0, 0.11, 0.108 * belly], [0.2, 0.1, 0.012]); // kangaroo pocket
      mesh(new THREE.TorusGeometry(0.085, 0.032, 10, 22), tagged('cloth', darken(o.top, 0.92)), torso, [0, 0.45, -0.035], [1, 1, 1], [1.25, 0, 0]); // hood
      for (const sx of [-0.028, 0.028]) mesh(G.cyl, accent, torso, [sx, 0.34, 0.11], [0.003, 0.11, 0.003]);
    } else if (style === 'kurta' || style === 'saree') {
      const long = style === 'kurta';
      mesh(shell([[0, long ? -0.42 : 0.02], [0.2 * belly, long ? -0.41 : 0.03], [0.17 * belly, 0.05], [0.168 * belly, 0.2], [chest, 0.33], [0.165, 0.41], [0.08, 0.465], [0.0001, 0.47]]), top, torso, [0, 0, 0], [1, 1, 0.68]);
      if (style === 'saree') mesh(G.box, accent, torso, [0.03, 0.12, 0.05], [0.07, 0.62, 0.3], [0.15, 0, -0.55]); // pallu
      else mesh(G.box, accent, torso, [0, 0.36, 0.115], [0.02, 0.12, 0.008]); // placket
    } else {
      mesh(shell([[0, -0.03], [0.162 * belly, -0.02], [0.165 * belly, 0.1], [0.165 * belly, 0.2], [chest, 0.33], [0.168, 0.41], [0.08, 0.465], [0.0001, 0.47]]), top, torso, [0, 0, 0], [1, 1, 0.66]);
      if (style === 'vest') mesh(shell([[0, 0.0], [0.17 * belly, 0.01], [0.172 * belly, 0.2], [chest + 0.006, 0.33], [0.12, 0.42], [0.0001, 0.425]]), accent, torso, [0, 0, 0.004], [1.02, 1, 0.7]);
      if (style === 'uniform') {
        mesh(G.cyl, accent, torso, [0, 0.0, 0], [0.168 * belly, 0.04, 0.112 * belly]); // belt
        mesh(G.box, tagged('dark', 0xd8c06a), torso, [0.07, 0.33, 0.112], [0.03, 0.025, 0.006]); // badge
        for (const sx of [-1, 1]) mesh(G.box, top, torso, [sx * 0.07, 0.3, 0.112], [0.05, 0.04, 0.006]); // pockets
      }
      if (style === 'shirt') mesh(G.box, accent, torso, [0, 0.42, 0.08], [0.09, 0.03, 0.03], [0.4, 0, 0]); // collar
    }
    // neck
    mesh(limb(0.043, 0.047, 0.09), skin, torso, [0, 0.53, -0.004], [1, 1, 1]);

    // ---- arms
    const arms: THREE.Object3D[] = [];
    const fores: THREE.Object3D[] = [];
    const longSleeve = style === 'hoodie' || style === 'kurta' || style === 'uniform' || style === 'shirt';
    for (const side of [1, -1]) {
      const arm = pivot(torso, side * (female ? 0.175 : 0.19), 0.395, 0);
      const fore = pivot(arm, 0, -UPPER, 0);
      if (longSleeve) {
        mesh(limb(0.052, 0.045, UPPER + 0.02, 0.004), top, arm, [0, 0.01, 0], [1, 1, 1]);
        mesh(limb(0.045, 0.038, FORE - 0.02), top, fore, [0, 0, 0], [1, 1, 1]);
        if (style === 'hoodie') mesh(G.cyl, tagged('cloth', darken(o.top, 0.85)), fore, [0, -FORE + 0.03, 0], [0.036, 0.04, 0.036]);
      } else {
        // short sleeve over a bare arm
        mesh(limb(0.042, 0.036, UPPER + 0.02, 0.006), skin, arm, [0, 0, 0], [1, 1, 1]);
        if (style !== 'vest' && style !== 'saree') mesh(limb(0.056, 0.052, 0.14), top, arm, [0, 0.015, 0], [1, 1, 1]);
        else if (style === 'saree') mesh(limb(0.05, 0.047, 0.1), top, arm, [0, 0.015, 0], [1, 1, 1]);
        mesh(limb(0.036, 0.028, FORE), skin, fore, [0, 0, 0], [1, 1, 1]);
      }
      // hand: palm, finger block, thumb
      mesh(G.capsule, skin, fore, [0, -FORE - 0.035, 0.004], [0.026, 0.03, 0.014]);
      mesh(G.capsule, skin, fore, [0, -FORE - 0.085, 0.008], [0.023, 0.026, 0.012], [0.25, 0, 0]);
      mesh(G.capsule, skin, fore, [-side * 0.02, -FORE - 0.04, 0.02], [0.009, 0.018, 0.009], [0.5, 0, side * 0.5]);
      arms.push(arm);
      fores.push(fore);
    }

    // ---- head
    const head = pivot(torso, 0, 0.52, 0);
    mesh(G.sphere, skin, head, [0, 0.1, -0.006], [0.086, 0.104, 0.098]); // cranium
    mesh(G.sphere, skin, head, [0, 0.055, 0.016], [0.074, 0.066, 0.08]); // jaw + cheeks
    mesh(G.sphere, skin, head, [0, 0.022, 0.052], [0.03, 0.022, 0.028]); // chin
    for (const side of [1, -1]) mesh(G.sphere, skin, head, [side * 0.086, 0.094, -0.004], [0.011, 0.024, 0.017]); // ears
    // nose: bridge + tip + nostrils
    mesh(G.capsule, skin, head, [0, 0.098, 0.088], [0.009, 0.017, 0.01], [-0.32, 0, 0]);
    mesh(G.sphere, skin, head, [0, 0.077, 0.1], [0.013, 0.011, 0.012]);
    // eyes: wet sclera, iris, pupil, catch-light, and a lid that closes for blinks
    for (const side of [1, -1]) {
      const eye = pivot(head, side * 0.032, 0.112, 0.079);
      mesh(G.sphereLo, basic(0xefe9e2), eye, [0, 0, 0], [0.0145, 0.013, 0.0135]);
      mesh(G.sphereLo, basic(o.iris ?? 0x4a2c18), eye, [0, 0, 0.0085], [0.0088, 0.0088, 0.0055]);
      mesh(G.sphereLo, basic(0x0c0806), eye, [0, 0, 0.0115], [0.0042, 0.0042, 0.003]);
      mesh(G.sphereLo, basic(0xffffff), eye, [-side * 0.003, 0.003, 0.0128], [0.0014, 0.0014, 0.001]);
      mesh(G.hemi, skin, eye, [0, 0.002, 0.001], [0.0138, 0.0092, 0.0138], [-0.25, 0, 0]); // upper lid
      this.eyes.push(eye);
      const brow = mesh(G.box, tagged('dark', darken(o.hair, 0.8)), head, [side * 0.033, 0.136, 0.091], [0.034, 0.0075, 0.009], [0, 0, side * 0.06]);
      this.brows.push(brow);
    }
    this.mouth = mesh(G.capsule, lip, head, [0, 0.052, 0.088], [0.004, 0.012, 0.004], [0, 0, Math.PI / 2]);
    if (o.mustache) mesh(G.capsule, hair, head, [0, 0.066, 0.093], [0.006, 0.016, 0.005], [0, 0, Math.PI / 2]);
    if (o.bindi) mesh(G.sphereLo, basic(0xc8102e), head, [0, 0.134, 0.097], [0.0035, 0.0035, 0.002]);
    if (o.glasses) {
      const frame = tagged('dark', 0x1a1a1a);
      for (const side of [1, -1]) mesh(new THREE.TorusGeometry(1, 0.1, 6, 20), frame, head, [side * 0.032, 0.112, 0.096], [0.018, 0.016, 0.018]);
      mesh(G.box, frame, head, [0, 0.115, 0.097], [0.026, 0.003, 0.003]);
      for (const side of [1, -1]) mesh(G.box, frame, head, [side * 0.08, 0.115, 0.05], [0.003, 0.003, 0.09]);
    }

    // ---- hair
    const hst = o.hairStyle;
    if (hst !== 'bald') {
      mesh(G.sphere, hair, head, [0, 0.122, -0.012], [0.091, 0.092, 0.102]);
      mesh(G.sphere, hair, head, [0, 0.082, -0.05], [0.084, 0.07, 0.07]); // back of the head
      if (hst === 'messy' || hst === 'short') {
        const n = hst === 'messy' ? 9 : 4;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 1.6 - 0.8;
          const capped = o.hat === 'backcap' || o.hat === 'guard';
          const y = capped ? 0.158 : 0.19 - Math.abs(Math.sin(a)) * 0.03;
          const z = capped ? 0.07 + Math.cos(a) * 0.02 : 0.03 + Math.cos(a) * 0.04;
          mesh(G.capsule, hair, head, [Math.sin(a) * 0.06, y, z], [0.016, 0.022, 0.014], [1.2 + (i % 3) * 0.2, a * 0.4, (i % 2 ? 0.3 : -0.3)]);
        }
      }
      if (hst === 'bun') mesh(G.sphere, hair, head, [0, 0.13, -0.105], [0.038, 0.036, 0.034]);
      if (hst === 'ponytail') mesh(G.capsule, hair, head, [0, 0.03, -0.11], [0.025, 0.07, 0.022], [0.35, 0, 0]);
      if (hst === 'long') mesh(shell([[0, 0.17], [0.09, 0.12], [0.095, 0.02], [0.1, -0.12], [0.0001, -0.13]]), hair, head, [0, 0, -0.03], [1, 1, 0.7]);
    } else {
      mesh(G.sphere, hair, head, [0, 0.085, -0.04], [0.088, 0.045, 0.07]); // fringe of hair round the back
    }
    if (o.hat === 'backcap') {
      const cap = tagged('cloth', o.hatColor ?? 0x2b2d42);
      mesh(G.hemi, cap, head, [0, 0.118, -0.01], [0.099, 0.108, 0.109], [-0.12, 0, 0]);
      mesh(G.box, cap, head, [0, 0.13, -0.125], [0.11, 0.008, 0.08], [-0.15, 0, 0]); // brim over the neck
      mesh(G.box, tagged('cloth', darken(o.hatColor ?? 0x2b2d42, 0.65)), head, [0, 0.158, 0.098], [0.05, 0.02, 0.008], [-0.35, 0, 0]); // strap at the front
      mesh(G.sphereLo, cap, head, [0, 0.226, -0.03], [0.009, 0.006, 0.009]);
    } else if (o.hat === 'guard') {
      const cap = tagged('cloth', o.hatColor ?? 0x1d3557);
      mesh(G.cyl, cap, head, [0, 0.19, 0], [0.098, 0.05, 0.106]);
      mesh(G.box, tagged('dark', 0x111111), head, [0, 0.172, 0.1], [0.15, 0.008, 0.07], [0.12, 0, 0]);
    }

    // sweat drop (the one cartoon gag kept: it reads instantly)
    this.sweatDrop = mesh(G.sphereLo, basic(0xbfe6ff), head, [0.08, 0.15, 0.05], [0.007, 0.011, 0.007]);
    this.sweatDrop.visible = false;

    this.j = { hips, torso, head, armL: arms[0], armR: arms[1], foreL: fores[0], foreR: fores[1], legL: legs[0], legR: legs[1], kneeL: knees[0], kneeR: knees[1] };
    bakeRig(R, new Set<THREE.Object3D>([...this.brows, this.mouth, this.sweatDrop]));
    this.blob = addBlob(R, 0.75);
    R.scale.setScalar(o.scale ?? 1);
  }

  blob!: THREE.Mesh;
  /** Kept for API compatibility (outlines were part of the old anime style). */
  setDetail(_near: boolean) {}

  attachPhone() {
    if (this.phone) return this.phone;
    const p = new THREE.Group();
    mesh(G.box, new THREE.MeshStandardMaterial({ color: 0x1b1b24, roughness: 0.3, metalness: 0.4 }), p, [0, 0, 0], [0.07, 0.145, 0.008]);
    mesh(G.box, new THREE.MeshStandardMaterial({ color: 0x0a0a10, emissive: 0x4aa8ff, emissiveIntensity: 0.6, roughness: 0.1 }), p, [0, 0, 0.0045], [0.064, 0.136, 0.001]);
    p.position.set(0, -FORE - 0.06, 0.03);
    p.rotation.set(-1.1, 0, 0);
    this.j.foreR.add(p);
    p.visible = false;
    this.phone = p;
    return p;
  }

  attachBag(color = 0xf2efe6) {
    if (this.bag) return this.bag;
    const b = new THREE.Group();
    mesh(G.box, new THREE.MeshStandardMaterial({ color, roughness: 0.75 }), b, [0, -0.17, 0], [0.24, 0.28, 0.12]);
    mesh(G.box, new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.6 }), b, [0, -0.14, 0.062], [0.11, 0.11, 0.004]);
    b.position.set(0, -FORE - 0.06, 0.02);
    this.j.foreL.add(b);
    b.visible = false;
    this.bag = b;
    return b;
  }

  onStep(cb: () => void) {
    this.stepCb = cb;
  }

  private target(): PoseTarget {
    const p: PoseTarget = { ...BASE };
    const t = this.t;
    switch (this.pose) {
      case 'idle':
        p.armLZ = 0.1 + Math.sin(t * 1.3) * 0.02;
        p.armRZ = -0.1 - Math.sin(t * 1.3) * 0.02;
        p.headY = Math.sin(t * 0.4) * 0.08;
        break;
      case 'nervous':
        p.headY = Math.sin(t * 1.6) * 0.55;
        p.headX = 0.08;
        p.armLZ = 0.02; p.armRZ = -0.02;
        p.armLX = -0.2; p.armRX = -0.2; p.foreLX = -0.9; p.foreRX = -0.9;
        p.torsoX = 0.08;
        break;
      case 'hesitate':
        p.torsoX = -0.12;
        p.headX = -0.05;
        p.armLX = -0.3; p.foreLX = -1.3; p.armRX = -0.3; p.foreRX = -1.3;
        p.armLZ = 0.0; p.armRZ = 0.0;
        break;
      case 'phone':
        p.armRX = -0.35; p.armRZ = 0.25; p.foreRX = -1.5;
        p.headX = 0.38;
        p.armLX = -0.25; p.armLZ = -0.1; p.foreLX = -1.2;
        break;
      case 'sit':
        p.hipsY = 0.58;
        p.legLX = -1.45; p.legRX = -1.45; p.kneeLX = 1.45; p.kneeRX = 1.45;
        p.legLZ = 0.08; p.legRZ = -0.08;
        p.armLX = -0.5; p.armRX = -0.5; p.foreLX = -0.6; p.foreRX = -0.6;
        p.torsoX = -0.1;
        break;
      case 'wave':
        p.armRZ = -2.5 + Math.sin(t * 9) * 0.3; p.foreRX = -0.2;
        break;
      case 'talk':
        p.armRX = -0.4 + Math.sin(t * 3) * 0.2; p.foreRX = -1.0;
        p.armLX = -0.3 + Math.sin(t * 2.3 + 1) * 0.15; p.foreLX = -0.9;
        p.headX = Math.sin(t * 4) * 0.05;
        break;
      case 'celebrate':
        p.armLZ = 2.6 + Math.sin(t * 10) * 0.2; p.armRZ = -2.6 - Math.sin(t * 10) * 0.2;
        p.hipsY = HIP_Y + Math.abs(Math.sin(t * 6)) * 0.15;
        p.headX = -0.2;
        break;
      case 'feed':
        p.hipsY = 0.6;
        p.legLX = -1.2; p.legRX = -0.4; p.kneeLX = 2.0; p.kneeRX = 1.4;
        p.torsoX = 0.5;
        p.armRX = -1.0; p.foreRX = -0.4;
        p.armLX = -0.6; p.foreLX = -0.4;
        p.headX = 0.3;
        break;
      case 'salute':
        p.armRX = -0.3; p.armRZ = -1.6; p.foreRX = -2.2;
        p.torsoX = -0.05;
        break;
      case 'scan':
        p.armRX = -1.0 + Math.sin(t * 5) * 0.3; p.foreRX = -0.4; p.armRZ = 0.3;
        p.armLX = -0.9; p.foreLX = -0.5; p.armLZ = -0.2;
        p.headX = 0.25;
        break;
      case 'shrug':
        p.armLZ = 0.5; p.armRZ = -0.5; p.foreLX = -1.4; p.foreRX = -1.4;
        p.headZ = 0.15;
        break;
      case 'carry':
        p.armLX = -0.4; p.foreLX = -1.0;
        break;
      case 'facepalm':
        p.armRX = -1.2; p.armRZ = 0.5; p.foreRX = -2.2;
        p.headX = 0.3;
        break;
      case 'lean':
        p.torsoX = 0.15; p.headX = 0.1;
        p.armLX = -0.4; p.foreLX = -1.2; p.armRX = -0.4; p.foreRX = -1.2;
        break;
    }
    // locomotion overlay
    const sp = this.speed;
    const canWalk = this.pose !== 'sit' && this.pose !== 'feed';
    if (sp > 0.05 && canWalk) {
      const amp = Math.min(1, sp / 3) * 0.75;
      const s = Math.sin(this.phase);
      p.legLX = s * amp;
      p.legRX = -s * amp;
      p.kneeLX = Math.max(0, -Math.cos(this.phase)) * amp * 1.1;
      p.kneeRX = Math.max(0, Math.cos(this.phase)) * amp * 1.1;
      if (this.pose !== 'phone' && this.pose !== 'carry' && this.pose !== 'nervous') {
        p.armLX = -s * amp * 0.8;
        p.armRX = s * amp * 0.8;
        p.foreLX = -0.35; p.foreRX = -0.35;
      } else if (this.pose === 'carry') {
        p.armRX = s * amp * 0.8;
      }
      p.hipsY += Math.abs(Math.cos(this.phase)) * 0.045 * Math.min(1, sp / 2);
      p.torsoY = s * 0.08 * amp;
      p.torsoX += sp > 4 ? 0.12 : 0.03;
    } else {
      // breathing
      p.torsoX += Math.sin(t * 2.1) * 0.012;
    }
    p.headY += this.lookYaw;
    return p;
  }

  update(dt: number) {
    this.t += dt;
    if (this.speed > 0.05) {
      this.phase += dt * (3.2 + this.speed * 2.2);
      const sign = Math.sign(Math.sin(this.phase));
      if (sign !== this.lastStepSign) {
        this.lastStepSign = sign;
        this.stepCb?.();
      }
    }
    const tg = this.target();
    const k = 1 - Math.exp(-dt * 12);
    const c = this.cur;
    (Object.keys(c) as (keyof PoseTarget)[]).forEach((key) => {
      c[key] += (tg[key] - c[key]) * k;
    });
    const j = this.j;
    j.hips.position.y = c.hipsY;
    j.torso.rotation.set(c.torsoX, c.torsoY, c.torsoZ);
    j.head.rotation.set(c.headX, c.headY, c.headZ);
    j.armL.rotation.set(c.armLX, 0, c.armLZ);
    j.armR.rotation.set(c.armRX, 0, c.armRZ);
    j.foreL.rotation.x = c.foreLX;
    j.foreR.rotation.x = c.foreRX;
    j.legL.rotation.set(c.legLX, 0, c.legLZ);
    j.legR.rotation.set(c.legRX, 0, c.legRZ);
    j.kneeL.rotation.x = c.kneeLX;
    j.kneeR.rotation.x = c.kneeRX;
    if (this.phone) this.phone.visible = this.pose === 'phone';

    // face
    this.blinkT -= dt;
    let eyeY = 1;
    if (this.blinkT < 0) {
      eyeY = 0.1;
      if (this.blinkT < -0.12) this.blinkT = 2.5 + Math.random() * 3;
    }
    const e = this.expr;
    const eyeS = e === 'shock' ? 1.3 : e === 'deadpan' ? 0.55 : e === 'happy' ? 0.75 : 1;
    this.eyes.forEach((eye) => {
      eye.scale.set(eyeS, eyeS * eyeY * (e === 'happy' ? 0.6 : 1), 1);
    });
    const browRot = { neutral: 0, nervous: 0.35, happy: -0.1, shock: 0.2, determined: -0.35, deadpan: 0, sad: 0.4 }[e];
    const browY = { neutral: 0.136, nervous: 0.141, happy: 0.14, shock: 0.146, determined: 0.132, deadpan: 0.133, sad: 0.139 }[e];
    this.brows.forEach((b, i) => {
      b.rotation.z = (i === 0 ? 1 : -1) * browRot;
      b.position.y = browY;
    });
    const mouthS = {
      neutral: [1, 1], nervous: [0.8, 1.6], happy: [1.4, 2.4], shock: [0.6, 4], determined: [1.1, 0.8], deadpan: [1, 0.6], sad: [0.8, 1.2],
    }[e];
    this.mouth.scale.set(0.004 * mouthS[1], 0.012 * mouthS[0], 0.004);
    if (this.sweatDrop) {
      this.sweatDrop.visible = this.sweat > 0.5;
      this.sweatDrop.position.y = 0.15 - ((this.t * 0.06) % 0.04);
    }
  }
}

function darken(hex: number, f: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
}

// ------------------------------------------------------------------ Cat
export type CatPose = 'sit' | 'walk' | 'eat' | 'meow' | 'loaf' | 'lookup';

export class Cat {
  root = new THREE.Group();
  pose: CatPose = 'sit';
  speed = 0;
  private body: THREE.Object3D;
  private head: THREE.Object3D;
  private tail: THREE.Object3D[] = [];
  private legs: THREE.Object3D[] = [];
  private t = Math.random() * 5;
  private phase = 0;
  private mouth: THREE.Mesh;

  constructor(fur: number, belly: number, stripe?: number) {
    const f = toon(fur);
    const b = toon(belly);
    this.body = pivot(this.root, 0, 0.2, 0);
    mesh(G.capsule, f, this.body, [0, 0, 0], [0.11, 0.2, 0.11], [Math.PI / 2, 0, 0]);
    mesh(G.sphere, b, this.body, [0, -0.04, 0.12], [0.08, 0.08, 0.07]);
    if (stripe) {
      for (let i = 0; i < 3; i++) mesh(G.box, toon(stripe), this.body, [0, 0.1, -0.08 + i * 0.08], [0.15, 0.02, 0.03]);
    }
    for (let i = 0; i < 4; i++) {
      const lg = pivot(this.body, i % 2 ? 0.06 : -0.06, -0.04, i < 2 ? 0.13 : -0.12);
      mesh(G.cyl, f, lg, [0, -0.08, 0], [0.032, 0.16, 0.032]);
      mesh(G.sphereLo, b, lg, [0, -0.16, 0.01], [0.035, 0.02, 0.04]);
      this.legs.push(lg);
    }
    this.head = pivot(this.body, 0, 0.1, 0.2);
    mesh(G.sphere, f, this.head, [0, 0, 0], [0.12, 0.105, 0.105]);
    mesh(G.sphere, b, this.head, [0, -0.035, 0.07], [0.06, 0.045, 0.045]);
    for (const s of [1, -1]) {
      mesh(G.cone, f, this.head, [s * 0.065, 0.1, -0.01], [0.04, 0.08, 0.03], [0, 0, -s * 0.25]);
      mesh(G.cone, toon(0xf4a6b8), this.head, [s * 0.065, 0.095, 0.002], [0.022, 0.05, 0.01], [0, 0, -s * 0.25]);
      const eye = mesh(G.sphere, basic(0x1b1426), this.head, [s * 0.045, 0.015, 0.088], [0.022, 0.028, 0.012]);
      mesh(G.sphereLo, basic(0xffffff), eye, [-0.3 * s, 0.4, 0.8], [0.35, 0.35, 0.3]);
    }
    mesh(G.sphereLo, toon(0xf48fb1), this.head, [0, -0.015, 0.105], [0.014, 0.01, 0.01]);
    this.mouth = mesh(G.sphereLo, basic(0x6b2c3a), this.head, [0, -0.045, 0.1], [0.02, 0.004, 0.01]);
    let parent: THREE.Object3D = pivot(this.body, 0, 0.04, -0.26);
    for (let i = 0; i < 5; i++) {
      const seg = pivot(parent, 0, 0, i === 0 ? 0 : -0.07);
      mesh(G.sphereLo, f, seg, [0, 0, -0.035], [0.028 - i * 0.002, 0.028 - i * 0.002, 0.045]);
      this.tail.push(seg);
      parent = seg;
    }
    bakeRig(this.root, new Set<THREE.Object3D>([this.mouth]));
    addBlob(this.root, 0.55);
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const walking = this.speed > 0.05;
    if (walking) this.phase += dt * (6 + this.speed * 4);
    let bodyX = 0, bodyY = 0.2, headX = 0, headY = Math.sin(t * 0.5) * 0.3;
    const legX = [0, 0, 0, 0];
    switch (walking ? 'walk' : this.pose) {
      case 'walk':
        for (let i = 0; i < 4; i++) legX[i] = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6;
        headY = 0;
        break;
      case 'sit':
        bodyX = -0.6; bodyY = 0.22;
        legX[2] = legX[3] = 1.2;
        legX[0] = legX[1] = 0.55;
        headX = 0.55;
        break;
      case 'lookup':
        bodyX = -0.6; bodyY = 0.22;
        legX[2] = legX[3] = 1.2;
        legX[0] = legX[1] = 0.55;
        headX = 0.05;
        headY = Math.sin(t * 2) * 0.1;
        break;
      case 'meow':
        bodyX = -0.6; bodyY = 0.22;
        legX[2] = legX[3] = 1.2;
        legX[0] = legX[1] = 0.55;
        headX = 0.15 + Math.sin(t * 6) * 0.08;
        headY = 0;
        break;
      case 'eat':
        bodyX = 0.15; bodyY = 0.19;
        headX = 0.75 + Math.sin(t * 9) * 0.1;
        headY = 0;
        break;
      case 'loaf':
        bodyY = 0.11;
        legX.fill(-1.4);
        headX = 0.1;
        break;
    }
    const k = 1 - Math.exp(-dt * 10);
    this.body.rotation.x += (bodyX - this.body.rotation.x) * k;
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.head.rotation.x += (headX - this.head.rotation.x) * k;
    this.head.rotation.y += (headY - this.head.rotation.y) * k;
    this.legs.forEach((l, i) => (l.rotation.x += (legX[i] - l.rotation.x) * k));
    this.tail.forEach((s, i) => {
      s.rotation.y = Math.sin(t * 2.2 - i * 0.6) * (walking ? 0.2 : 0.35);
      s.rotation.x = i === 0 ? (this.pose === 'sit' ? 0.2 : -0.7) : 0.25;
    });
    this.mouth.scale.y = this.pose === 'meow' ? 0.02 + Math.abs(Math.sin(t * 6)) * 0.02 : 0.004;
  }
}
