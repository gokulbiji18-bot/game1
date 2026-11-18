import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural, cel-shaded characters with simple joint hierarchies animated in code.
const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const matCache = new Map<string, THREE.Material>();
export function toon(color: number, emissive = 0) {
  const key = `${color}-${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, emissive, emissiveIntensity: emissive ? 1 : 0 });
    matCache.set(key, m);
  }
  return m;
}
const basic = (color: number) => {
  const key = `b${color}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    matCache.set(key, m);
  }
  return m;
};

const G = {
  sphere: new THREE.SphereGeometry(1, 18, 14),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  hemi: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 10),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 10),
};

// ---- rig baking: merge the static parts under each joint into one mesh (toon + unlit),
// add an inverted-hull outline for the anime look, and a soft contact shadow.
const vToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
// Fresnel rim light: a thin glow on silhouettes, like anime key art. Tinted per zone by the game.
const rimUniform = { value: new THREE.Color(0.22, 0.24, 0.38) };
vToon.onBeforeCompile = (sh) => {
  sh.uniforms.uRim = rimUniform;
  sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace(
    '#include <opaque_fragment>',
    'outgoingLight += uRim * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);\n#include <opaque_fragment>',
  );
};
vToon.customProgramCacheKey = () => 'toon-rim';
export function setCharacterRim(color: number, strength: number) {
  rimUniform.value.setHex(color).multiplyScalar(strength);
}
const vBasic = new THREE.MeshBasicMaterial({ vertexColors: true });
const outlineMat = (() => {
  const m = new THREE.MeshBasicMaterial({ color: 0x1c1424, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * 0.013;');
  };
  return m;
})();
const blobMat = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.75)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
})();
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function addBlob(root: THREE.Object3D, size: number) {
  const b = new THREE.Mesh(blobGeo, blobMat);
  b.scale.setScalar(size);
  b.position.y = 0.025;
  b.renderOrder = 1;
  root.add(b);
  return b;
}

function bakeRig(root: THREE.Object3D, keep: Set<THREE.Object3D>, outlines: THREE.Mesh[]) {
  const pivots: THREE.Object3D[] = [];
  root.traverse((o) => pivots.push(o));
  const c = new THREE.Color();
  for (const p of pivots) {
    const groups: Record<'toon' | 'basic', THREE.BufferGeometry[]> = { toon: [], basic: [] };
    const used: THREE.Mesh[] = [];
    for (const ch of p.children) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh || keep.has(m) || m.children.length) continue;
      const mat = m.material as THREE.MeshToonMaterial | THREE.MeshBasicMaterial;
      m.updateMatrix();
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.applyMatrix4(m.matrix);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      c.copy(mat.color);
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      groups[(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial ? 'basic' : 'toon'].push(geo);
      used.push(m);
    }
    if (used.length < 2 && !(used.length === 1 && p !== root)) continue;
    used.forEach((m) => p.remove(m));
    for (const kind of ['toon', 'basic'] as const) {
      const list = groups[kind];
      if (!list.length) continue;
      const merged = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, kind === 'toon' ? vToon : vBasic);
      mesh.castShadow = kind === 'toon';
      p.add(mesh);
      if (kind === 'toon') {
        const ol = new THREE.Mesh(merged, outlineMat);
        p.add(ol);
        outlines.push(ol);
      }
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

const BASE: PoseTarget = {
  hipsY: 0.82, torsoX: 0, torsoY: 0, torsoZ: 0, headX: 0, headY: 0, headZ: 0,
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
    const hips = pivot(R, 0, 0.82, 0);
    const torso = pivot(hips, 0, 0.04, 0);
    const skin = toon(o.skin);
    const top = toon(o.top);
    const bottom = toon(o.bottom);
    const shoe = toon(o.shoes);
    const hair = toon(o.hair);
    const accent = toon(o.accent ?? 0xffffff);
    const belly = o.belly ?? 1;

    // Lower body
    if (o.bottomStyle === 'skirt') {
      mesh(G.cyl, bottom, hips, [0, -0.38, 0], [0.26 * belly, 0.86, 0.24], undefined).geometry = new THREE.CylinderGeometry(0.62, 1, 1, 12);
    } else {
      mesh(G.cyl, bottom, hips, [0, -0.02, 0], [0.21 * belly, 0.2, 0.17]);
    }

    const legs: THREE.Object3D[] = [];
    const knees: THREE.Object3D[] = [];
    for (const side of [1, -1]) {
      const leg = pivot(hips, side * 0.1, -0.04, 0);
      if (o.bottomStyle === 'shorts') {
        mesh(G.cyl, bottom, leg, [0, -0.15, 0], [0.105, 0.32, 0.105]);
      } else if (o.bottomStyle === 'pants') {
        mesh(G.cyl, bottom, leg, [0, -0.19, 0], [0.095, 0.4, 0.095]);
      }
      const knee = pivot(leg, 0, -0.38, 0);
      if (o.bottomStyle === 'pants') mesh(G.cyl, bottom, knee, [0, -0.17, 0], [0.08, 0.36, 0.08]);
      else mesh(G.cyl, skin, knee, [0, -0.17, 0], [0.062, 0.36, 0.062]);
      if (o.bottomStyle === 'shorts') mesh(G.cyl, skin, leg, [0, -0.33, 0], [0.07, 0.1, 0.07]);
      // sneakers
      mesh(G.box, shoe, knee, [0, -0.39, 0.04], [0.14, 0.09, 0.27]);
      mesh(G.box, toon(0xf4f1ea), knee, [0, -0.425, 0.04], [0.145, 0.03, 0.28]);
      legs.push(leg);
      knees.push(knee);
    }

    // Upper body
    const style = o.topStyle;
    if (style === 'hoodie') {
      const body = mesh(G.cyl, top, torso, [0, 0.3, 0], [1, 1, 1]);
      body.geometry = new THREE.CylinderGeometry(0.235, 0.29, 0.62, 14);
      body.scale.set(1, 1, 0.78);
      mesh(G.box, toon(darken(o.top, 0.8)), torso, [0, 0.14, 0.21], [0.3, 0.14, 0.04]); // pocket
      mesh(G.cyl, toon(darken(o.top, 0.85)), torso, [0, 0.0, 0], [0.29, 0.06, 0.226]); // waistband
      // hood resting on the back
      mesh(G.sphere, toon(darken(o.top, 0.9)), torso, [0, 0.6, -0.13], [0.2, 0.12, 0.12]);
      for (const sx of [-0.05, 0.05]) mesh(G.cyl, accent, torso, [sx, 0.47, 0.205], [0.008, 0.16, 0.008]);
    } else if (style === 'kurta' || style === 'saree') {
      const body = mesh(G.cyl, top, torso, [0, 0.18, 0], [1, 1, 1]);
      body.geometry = new THREE.CylinderGeometry(0.22 * belly, 0.28 * belly, style === 'kurta' ? 0.86 : 0.64, 14);
      body.scale.set(1, 1, 0.82);
      if (style === 'saree') {
        mesh(G.box, accent, torso, [0.02, 0.36, 0.08], [0.1, 0.62, 0.36], [0.2, 0, -0.55]);
      } else {
        mesh(G.box, accent, torso, [0, 0.45, 0.2], [0.04, 0.2, 0.02]);
      }
    } else {
      const body = mesh(G.cyl, top, torso, [0, 0.3, 0], [1, 1, 1]);
      body.geometry = new THREE.CylinderGeometry(0.22 * belly, 0.24 * belly, 0.6, 14);
      body.scale.set(1, 1, 0.78);
      if (style === 'vest') mesh(G.box, accent, torso, [0, 0.32, 0.17], [0.34, 0.5, 0.06]);
      if (style === 'uniform') {
        mesh(G.box, accent, torso, [0, 0.03, 0], [0.48, 0.06, 0.38]); // belt
        mesh(G.box, toon(0xd8c06a), torso, [0.11, 0.45, 0.18], [0.06, 0.05, 0.02]); // badge
      }
      if (style === 'shirt') mesh(G.box, accent, torso, [0, 0.52, 0.17], [0.16, 0.08, 0.04]);
    }
    mesh(G.cyl, skin, torso, [0, 0.64, 0], [0.07, 0.1, 0.07]);

    // Arms
    const arms: THREE.Object3D[] = [];
    const fores: THREE.Object3D[] = [];
    const sleeve = style === 'tshirt' || style === 'vest' || style === 'saree' ? skin : top;
    for (const side of [1, -1]) {
      const arm = pivot(torso, side * 0.3, 0.55, 0);
      mesh(G.capsule, style === 'tshirt' || style === 'vest' ? top : top, arm, [0, -0.11, 0], [0.085, 0.12, 0.085]);
      const fore = pivot(arm, 0, -0.25, 0);
      mesh(G.capsule, sleeve, fore, [0, -0.1, 0], [0.072, 0.12, 0.072]);
      if (style === 'hoodie') mesh(G.cyl, toon(darken(o.top, 0.85)), fore, [0, -0.2, 0], [0.078, 0.05, 0.078]);
      mesh(G.sphere, skin, fore, [0, -0.27, 0.01], [0.065, 0.07, 0.06]);
      arms.push(arm);
      fores.push(fore);
    }

    // Head
    const head = pivot(torso, 0, 0.92, 0);
    const hs = 0.26;
    mesh(G.sphere, skin, head, [0, 0, 0], [hs, hs * 1.03, hs * 0.96]);
    for (const side of [1, -1]) mesh(G.sphereLo, skin, head, [side * hs * 0.98, -0.02, 0], [0.04, 0.06, 0.04]);
    mesh(G.sphereLo, toon(darken(o.skin, 0.9)), head, [0, -0.04, hs * 0.97], [0.03, 0.025, 0.03]);
    // eyes (anime style: big dark ovals with a highlight)
    for (const side of [1, -1]) {
      // anime eye: white, coloured iris, pupil, two catch-lights and a lash line
      const eye = pivot(head, side * 0.097, 0.0, hs * 0.86);
      mesh(G.sphere, basic(0xf3ece2), eye, [side * 0.006, 0, -0.006], [0.044, 0.056, 0.024]);
      mesh(G.sphere, basic(o.iris ?? 0x5a3a22), eye, [side * -0.004, -0.002, 0.004], [0.039, 0.054, 0.026]);
      mesh(G.sphere, basic(0x140e1a), eye, [side * -0.004, -0.004, 0.011], [0.023, 0.032, 0.024]);
      mesh(G.sphereLo, basic(0xffffff), eye, [side * -0.014, 0.018, 0.03], [0.013, 0.015, 0.008]);
      mesh(G.sphereLo, basic(0xffffff), eye, [side * 0.01, -0.024, 0.03], [0.006, 0.006, 0.005]);
      mesh(G.box, basic(0x1b1426), eye, [0, 0.054, 0.016], [0.1, 0.018, 0.02], [0, 0, side * 0.14]);
      this.eyes.push(eye);
      const brow = mesh(G.box, hair, head, [side * 0.095, 0.1, hs * 0.9], [0.09, 0.022, 0.02]);
      this.brows.push(brow);
    }
    this.mouth = mesh(G.box, basic(0x5a2a2a), head, [0, -0.11, hs * 0.93], [0.07, 0.018, 0.02]);
    if (o.mustache) mesh(G.box, hair, head, [0, -0.075, hs * 0.95], [0.13, 0.035, 0.03]);
    if (o.bindi) mesh(G.sphereLo, basic(0xc8102e), head, [0, 0.07, hs * 0.99], [0.014, 0.014, 0.01]);
    if (o.glasses) {
      for (const side of [1, -1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 6, 16), basic(0x222222));
        ring.position.set(side * 0.095, 0.0, hs * 0.97);
        head.add(ring);
      }
      mesh(G.box, basic(0x222222), head, [0, 0.01, hs * 0.99], [0.06, 0.01, 0.01]);
    }

    // Hair
    const hst = o.hairStyle;
    if (hst !== 'bald') {
      mesh(G.sphere, hair, head, [0, 0.04, -0.03], [hs * 1.06, hs * 1.0, hs * 1.02]).scale.y *= hst === 'short' ? 0.95 : 1;
      if (hst === 'messy') {
        // fringe tufts poking out from under the backward cap
        for (let i = -2; i <= 2; i++) {
          mesh(G.cone, hair, head, [i * 0.07, 0.13, hs * 0.78], [0.06, 0.13, 0.05], [1.9, 0, i * 0.25]);
        }
        mesh(G.cone, hair, head, [hs * 0.92, 0.05, 0.05], [0.05, 0.12, 0.05], [0, 0, -2.2]);
        mesh(G.cone, hair, head, [-hs * 0.92, 0.05, 0.05], [0.05, 0.12, 0.05], [0, 0, 2.2]);
      }
      if (hst === 'bun') mesh(G.sphere, hair, head, [0, 0.08, -0.29], [0.1, 0.1, 0.1]);
      if (hst === 'ponytail') mesh(G.capsule, hair, head, [0, -0.08, -0.3], [0.07, 0.18, 0.07], [0.3, 0, 0]);
      if (hst === 'long') mesh(G.box, hair, head, [0, -0.24, -0.12], [0.5, 0.42, 0.18]);
    }
    if (o.hat === 'backcap') {
      const cap = toon(o.hatColor ?? 0x2b2d42);
      mesh(G.hemi, cap, head, [0, 0.06, -0.01], [hs * 1.1, hs * 0.92, hs * 1.1]);
      mesh(G.box, cap, head, [0, 0.08, -hs * 1.12], [0.24, 0.025, 0.17], [-0.12, 0, 0]);
      mesh(G.sphereLo, toon(0xff8c42), head, [0, 0.06 + hs * 0.92, -0.01], [0.025, 0.02, 0.025]);
      mesh(G.box, toon(0xff8c42), head, [0, 0.12, hs * 0.98], [0.07, 0.04, 0.02], [-0.3, 0, 0]);
    } else if (o.hat === 'guard') {
      const cap = toon(o.hatColor ?? 0x1d3557);
      mesh(G.cyl, cap, head, [0, 0.2, 0], [hs * 1.05, 0.1, hs * 1.05]);
      mesh(G.box, toon(0x111111), head, [0, 0.15, hs * 0.95], [0.3, 0.02, 0.16]);
    }

    // Sweat drop (anime anxiety indicator)
    this.sweatDrop = mesh(G.sphere, toon(0x9fd8ff, 0x3a6a8a), head, [hs * 0.95, 0.12, 0.08], [0.035, 0.055, 0.035]);
    this.sweatDrop.visible = false;

    this.j = { hips, torso, head, armL: arms[0], armR: arms[1], foreL: fores[0], foreR: fores[1], legL: legs[0], legR: legs[1], kneeL: knees[0], kneeR: knees[1] };
    const keep = new Set<THREE.Object3D>([...this.brows, this.mouth, this.sweatDrop]);
    if (o.blush) {
      const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7f8e, transparent: true, opacity: 0.32, depthWrite: false });
      for (const side of [1, -1]) keep.add(mesh(G.sphereLo, blushMat, head, [side * 0.135, -0.065, hs * 0.86], [0.045, 0.022, 0.012]));
    }
    bakeRig(R, keep, this.outlines);
    this.blob = addBlob(R, 0.9);
    const s = o.scale ?? 1;
    R.scale.setScalar(s);
  }

  outlines: THREE.Mesh[] = [];
  blob!: THREE.Mesh;
  private detail = true;
  /** Drop outlines for far-away characters. */
  setDetail(near: boolean) {
    if (near === this.detail) return;
    this.detail = near;
    this.outlines.forEach((o) => (o.visible = near));
  }

  attachPhone() {
    if (this.phone) return this.phone;
    const p = new THREE.Group();
    mesh(G.box, toon(0x1b1b24), p, [0, 0, 0], [0.09, 0.16, 0.015]);
    mesh(G.box, toon(0x7ad7ff, 0x3aa0ff), p, [0, 0, 0.009], [0.075, 0.14, 0.002]);
    p.position.set(0, -0.3, 0.05);
    p.rotation.set(-1.1, 0, 0);
    this.j.foreR.add(p);
    p.visible = false;
    this.phone = p;
    return p;
  }

  attachBag(color = 0xf2efe6) {
    if (this.bag) return this.bag;
    const b = new THREE.Group();
    mesh(G.box, toon(color), b, [0, -0.15, 0], [0.24, 0.26, 0.12]);
    mesh(G.box, toon(0xff8a3d), b, [0, -0.12, 0.062], [0.12, 0.12, 0.005]);
    b.position.set(0, -0.28, 0.02);
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
        p.hipsY = 0.5;
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
        p.hipsY = 0.82 + Math.abs(Math.sin(t * 6)) * 0.15;
        p.headX = -0.2;
        break;
      case 'feed':
        p.hipsY = 0.48;
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
    const browY = { neutral: 0.1, nervous: 0.12, happy: 0.12, shock: 0.15, determined: 0.08, deadpan: 0.085, sad: 0.11 }[e];
    this.brows.forEach((b, i) => {
      b.rotation.z = (i === 0 ? 1 : -1) * browRot;
      b.position.y = browY;
    });
    const mouthS = {
      neutral: [1, 1], nervous: [0.8, 1.6], happy: [1.4, 2.4], shock: [0.6, 4], determined: [1.1, 0.8], deadpan: [1, 0.6], sad: [0.8, 1.2],
    }[e];
    this.mouth.scale.set(0.085 * mouthS[0], 0.022 * mouthS[1], 0.02);
    if (this.sweatDrop) {
      this.sweatDrop.visible = this.sweat > 0.5;
      this.sweatDrop.position.y = 0.12 - ((this.t * 0.25) % 0.12);
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
    bakeRig(this.root, new Set<THREE.Object3D>([this.mouth]), []);
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
