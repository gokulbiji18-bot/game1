import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Collision } from '../collision';

// Real 3D props: CC0 photoscanned/PBR models from Poly Haven (public/assets/models).
// Each model is normalised once (bottom-centre at the origin) and cloned per placement.
export interface PropSpec {
  /** model id (folder name) */
  m: string;
  x: number;
  z: number;
  /** base height (e.g. a counter top) */
  y?: number;
  /** yaw; 0 = the model's front faces +Z */
  r?: number;
  /** uniform scale (applied after `h`/`w` fitting) */
  s?: number;
  /** fit the model to this height in metres */
  h?: number;
  /** fit the model to this footprint width (largest of x/z) in metres */
  w?: number;
  /** add a collider: tall blocks camera too, low only the player */
  col?: 'tall' | 'low';
  /** collider size in metres (square) instead of the model's footprint, e.g. a tree trunk */
  cw?: number;
  /** hang from this ceiling height (y becomes ceiling - model height) */
  hang?: number;
  /** keep only top-level parts whose name matches this regex (for variant sets) */
  keep?: string;
}

const loader = new GLTFLoader();
const protos = new Map<string, Promise<{ obj: THREE.Object3D; size: THREE.Vector3 } | null>>();

function proto(name: string, keep?: string) {
  const key = `${name}|${keep ?? ''}`;
  let p = protos.get(key);
  if (!p) {
    p = loader
      .loadAsync(`assets/models/${name}/${name}_1k.gltf`)
      .then((gltf) => {
        const scene = gltf.scene;
        if (keep) {
          const re = new RegExp(keep);
          scene.children.filter((c) => !re.test(c.name)).forEach((c) => scene.remove(c));
        }
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat && mat.map) mat.map.anisotropy = 8;
          }
        });
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const wrap = new THREE.Group();
        scene.position.set(-centre.x, -box.min.y, -centre.z);
        wrap.add(scene);
        return { obj: wrap, size };
      })
      .catch(() => null); // a missing model simply doesn't appear
    protos.set(key, p);
  }
  return p;
}

/** Place a list of props under `parent`, offset by (ox, oz). Resolves when all are placed. */
export async function placeProps(list: PropSpec[], parent: THREE.Object3D, col: Collision, ox = 0, oz = 0) {
  await Promise.all(
    list.map(async (sp) => {
      const p = await proto(sp.m, sp.keep);
      if (!p) return;
      let k = 1;
      if (sp.h) k = sp.h / p.size.y;
      else if (sp.w) k = sp.w / Math.max(p.size.x, p.size.z);
      k *= sp.s ?? 1;
      const o = p.obj.clone(true);
      o.scale.setScalar(k);
      const y = sp.hang !== undefined ? sp.hang - p.size.y * k : sp.y ?? 0;
      o.position.set(sp.x + ox, y, sp.z + oz);
      o.rotation.y = sp.r ?? 0;
      parent.add(o);
      if (sp.col) {
        const cw = sp.cw ?? p.size.x * k * 0.9;
        const cd = sp.cw ?? p.size.z * k * 0.9;
        col.addRect(sp.x + ox, sp.z + oz, cw, cd, sp.r ?? 0, sp.col === 'tall');
      }
    }),
  );
}

/** Debug helper: native sizes of the given models. */
export async function propSizes(names: string[]) {
  const out: Record<string, number[]> = {};
  for (const n of names) {
    const p = await proto(n);
    if (p) out[n] = [p.size.x, p.size.y, p.size.z].map((v) => +v.toFixed(2));
  }
  return out;
}
