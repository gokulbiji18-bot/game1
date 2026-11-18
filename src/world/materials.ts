import * as THREE from 'three';

// Photo-based PBR surfaces (CC0 textures from Poly Haven, in public/assets/tex).
// Merged geometry has no UVs, so every map is projected in world space (triplanar),
// and the vertex colour tints the texture. Textures stream in; the material shows its
// tint until they arrive.
export type SurfaceId =
  | 'wood' | 'plaster' | 'terrazzo' | 'marble' | 'tiles' | 'asphalt' | 'pavers'
  | 'exterior' | 'grass' | 'leaves' | 'bark';

interface SurfaceDef {
  file: string;
  /** metres covered by one texture tile */
  scale: number;
  normal: number;
  rough: number;
  /** how much of the photo colour to use (1) vs. a neutral grey that only carries detail (0) */
  colour: number;
  /** strength of the photo's light/dark detail when colour < 1 (1 = full) */
  contrast?: number;
  env?: number;
}

const DEFS: Record<SurfaceId, SurfaceDef> = {
  wood: { file: 'laminate_floor_02', scale: 1.6, normal: 0.6, rough: 0.9, colour: 1 },
  plaster: { file: 'white_plaster_02', scale: 2.5, normal: 0.35, rough: 1.0, colour: 0, contrast: 0.3 },
  terrazzo: { file: 'terrazzo_tiles', scale: 1.5, normal: 0.5, rough: 0.7, colour: 1 },
  marble: { file: 'marble_01', scale: 2.0, normal: 0.4, rough: 0.55, colour: 1 },
  tiles: { file: 'tiled_floor_001', scale: 2.0, normal: 0.7, rough: 0.55, colour: 0, contrast: 0.55 },
  asphalt: { file: 'asphalt_02', scale: 3.0, normal: 1.0, rough: 0.95, colour: 1, env: 1.2 },
  pavers: { file: 'interlocking_concrete_pavers', scale: 1.4, normal: 1.0, rough: 1.0, colour: 1 },
  exterior: { file: 'white_rough_plaster', scale: 4.0, normal: 0.45, rough: 1.0, colour: 0, contrast: 0.32 },
  grass: { file: 'grass_path_2', scale: 2.5, normal: 0.8, rough: 1.0, colour: 1 },
  leaves: { file: 'forest_leaves_02', scale: 1.1, normal: 1.4, rough: 1.0, colour: 0, contrast: 0.7 },
  bark: { file: 'bark_brown_02', scale: 0.9, normal: 1.0, rough: 1.0, colour: 1 },
};

const BASE = 'assets/tex/';
const loader = new THREE.TextureLoader();
const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;
const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
flatNormal.needsUpdate = true;

const cache = new Map<SurfaceId, THREE.MeshStandardMaterial>();
const pending: Array<Promise<void>> = [];

function load(url: string, srgb: boolean, apply: (t: THREE.Texture) => void) {
  const p = new Promise<void>((resolve) => {
    loader.load(
      BASE + url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 8;
        apply(t);
        resolve();
      },
      undefined,
      () => resolve(), // a missing texture just leaves the tint showing
    );
  });
  pending.push(p);
  return p;
}

/** Shared material for a surface type (created once, textures load in the background). */
export function surfaceMaterial(id: SurfaceId): THREE.MeshStandardMaterial {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = DEFS[id];
  const u = {
    tAlbedo: { value: white as THREE.Texture },
    tNormal: { value: flatNormal as THREE.Texture },
    tRough: { value: white as THREE.Texture },
    uScale: { value: 1 / def.scale },
    uNormal: { value: def.normal },
    uRough: { value: def.rough },
    uColour: { value: def.colour },
    uMean: { value: 0.55 },
    uContrast: { value: def.contrast ?? 1 },
  };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: def.rough, metalness: 0, envMapIntensity: def.env ?? 1 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader =
      'varying vec3 vTriPos;\nvarying vec3 vTriN;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vTriN = normalize(mat3(modelMatrix) * objectNormal);',
      );
    sh.fragmentShader =
      'uniform sampler2D tAlbedo;\nuniform sampler2D tNormal;\nuniform sampler2D tRough;\nuniform float uScale;\nuniform float uNormal;\nuniform float uRough;\nuniform float uColour;\nuniform float uMean;\nuniform float uContrast;\nvarying vec3 vTriPos;\nvarying vec3 vTriN;\n' +
      sh.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  vec3 triN = normalize(vTriN);
  vec3 triW = pow(abs(triN), vec3(5.0));
  triW /= (triW.x + triW.y + triW.z + 1e-5);
  vec2 uvX = vTriPos.zy * uScale;
  vec2 uvY = vTriPos.xz * uScale;
  vec2 uvZ = vTriPos.xy * uScale;
  vec3 photo = texture2D(tAlbedo, uvX).rgb * triW.x + texture2D(tAlbedo, uvY).rgb * triW.y + texture2D(tAlbedo, uvZ).rgb * triW.z;
  float photoL = dot(photo, vec3(0.299, 0.587, 0.114));
  // colour 1 = the photo's own colour, 0 = only its light/dark detail around the vertex tint
  vec3 lumDetail = vec3(max(0.0, 1.0 + (photoL / uMean - 1.0) * uContrast));
  diffuseColor.rgb *= mix(lumDetail, photo, uColour);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
  float triR = texture2D(tRough, uvX).g * triW.x + texture2D(tRough, uvY).g * triW.y + texture2D(tRough, uvZ).g * triW.z;
  roughnessFactor = clamp(triR * uRough, 0.04, 1.0);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  {
    // whiteout-blended triplanar normal map, built in world space then moved to view space
    vec3 nX = texture2D(tNormal, uvX).xyz * 2.0 - 1.0;
    vec3 nY = texture2D(tNormal, uvY).xyz * 2.0 - 1.0;
    vec3 nZ = texture2D(tNormal, uvZ).xyz * 2.0 - 1.0;
    nX = vec3(nX.xy * uNormal + triN.zy, abs(nX.z) * triN.x);
    nY = vec3(nY.xy * uNormal + triN.xz, abs(nY.z) * triN.y);
    nZ = vec3(nZ.xy * uNormal + triN.xy, abs(nZ.z) * triN.z);
    vec3 worldN = normalize(nX.zyx * triW.x + nY.xzy * triW.y + nZ.xyz * triW.z);
    normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
  }`,
        );
  };
  m.customProgramCacheKey = () => 'tri-surface';
  cache.set(id, m);
  load(`${def.file}_diff.jpg`, true, (t) => {
    u.tAlbedo.value = t;
    u.uMean.value = meanLuminance(t.image as HTMLImageElement);
  });
  load(`${def.file}_nor.jpg`, false, (t) => (u.tNormal.value = t));
  load(`${def.file}_rough.jpg`, false, (t) => (u.tRough.value = t));
  return m;
}

/** Average (linear) luminance of an image, so detail-only surfaces keep their tint's brightness. */
function meanLuminance(img: HTMLImageElement) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lin = (v: number) => Math.pow(v / 255, 2.2);
      sum += 0.299 * lin(d[i]) + 0.587 * lin(d[i + 1]) + 0.114 * lin(d[i + 2]);
    }
    return Math.max(0.05, sum / 256);
  } catch {
    return 0.55;
  }
}

/** Resolves when every texture requested so far has loaded (or failed). */
export function surfacesReady() {
  return Promise.all(pending);
}

/** Load the dusk HDRI used for outdoor sky + reflections. */
export async function loadSky(renderer: THREE.WebGLRenderer) {
  const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
  const hdr = await new RGBELoader().loadAsync(BASE + 'sky_dusk_2k.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr).texture;
  pmrem.dispose();
  return { background: hdr, env };
}
