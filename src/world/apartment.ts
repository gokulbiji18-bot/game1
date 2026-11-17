import * as THREE from 'three';
import { Batch, LightDef } from './builder';
import { Collision, Box } from '../collision';
import { posterTexture, skylineTexture, screenTexture, drawTV, drawMonitor, signTexture, rangoliTexture, glowTexture, labelTexture } from './textures';

// Aarav's apartment (flat 302) and the third-floor corridor.
export const APT_O = { x: -200, z: 0 };
const W = (x: number, y: number, z: number) => new THREE.Vector3(x + APT_O.x, y, z + APT_O.z);

export interface AptRefs {
  group: THREE.Group;
  lights: LightDef[];
  corridorLights: LightDef[];
  anchors: Record<string, THREE.Vector3>;
  door: THREE.Object3D;
  doorBox: Box;
  tv: ReturnType<typeof screenTexture>;
  bowlFood: THREE.Object3D;
  liftDisplay: ReturnType<typeof screenTexture>;
  snackPile: THREE.Object3D;
}

const C = {
  wall: 0xf1e4cf,
  accent: 0x55467a,
  floor: 0xa8734a,
  floor2: 0x9a6943,
  trim: 0x5b4636,
  sofa: 0x737689,
  sofaDark: 0x5d6074,
  wood: 0x6b4a35,
  dark: 0x2a2734,
  plant: 0x4f9a5a,
  plant2: 0x3f7f4a,
  pot: 0xc0673d,
};

export function buildApartment(col: Collision): AptRefs {
  const b = new Batch(col, APT_O.x, APT_O.z);
  const H = 3.0;
  const group = new THREE.Group();
  group.name = 'apartment';

  // ---------- floor & ceiling ----------
  for (let i = 0; i < 12; i++) {
    b.box(-6 + i + 0.5, -0.1, 0, 0.98, 0.1, 9, i % 2 ? C.floor : C.floor2, { noShadow: true });
  }
  b.box(0, H, 0, 12.4, 0.1, 9.4, 0xf5ecdd, { noShadow: true, rotX: 0 });

  // ---------- walls ----------
  // north wall with door opening (x 3.4..4.6)
  b.box((-6.1 + 3.4) / 2, 0, -4.5, 9.5, H, 0.2, C.wall, { collide: true });
  b.box((4.6 + 6.1) / 2, 0, -4.5, 1.5, H, 0.2, C.wall, { collide: true });
  b.box(4, 2.25, -4.5, 1.2, H - 2.25, 0.2, C.wall);
  // accent wall behind TV
  b.box(-1, 0, -4.38, 3.6, H, 0.04, C.accent);
  // south wall with window (x -3..1, y .9..2.4)
  b.box(-4.55, 0, 4.5, 3.1, H, 0.2, C.wall, { collide: true });
  b.box(3.55, 0, 4.5, 5.1, H, 0.2, C.wall, { collide: true });
  b.box(-1, 0, 4.5, 4, 0.9, 0.2, C.wall, { collide: true });
  b.box(-1, 2.4, 4.5, 4, H - 2.4, 0.2, C.wall);
  // west / east
  b.box(-6, 0, 0, 0.2, H, 9.2, C.wall, { collide: true });
  b.box(6, 0, 0, 0.2, H, 9.2, C.wall, { collide: true });
  // baseboards
  b.box(-1.3, 0, -4.38, 9.3, 0.1, 0.04, C.trim);
  b.box(0, 0, 4.38, 11.8, 0.1, 0.04, C.trim);
  b.box(-5.88, 0, 0, 0.04, 0.1, 8.8, C.trim);
  b.box(5.88, 0, 0, 0.04, 0.1, 8.8, C.trim);

  // ---------- window + skyline ----------
  b.box(-1, 0.88, 4.35, 4.2, 0.06, 0.35, 0xe9dcc6); // sill
  b.box(-3, 0.9, 4.45, 0.1, 1.5, 0.12, C.trim);
  b.box(1, 0.9, 4.45, 0.1, 1.5, 0.12, C.trim);
  b.box(-1, 0.9, 4.45, 0.06, 1.5, 0.1, C.trim);
  b.box(-1, 2.38, 4.45, 4.1, 0.08, 0.12, C.trim);
  b.box(-1, 1.62, 4.45, 4.0, 0.05, 0.1, C.trim);
  const sky = b.plane(-1, 2.2, 9.5, 18, 9, skylineTexture(), { rotY: Math.PI, basic: true });
  sky.renderOrder = -1;
  // curtains
  b.box(-3.35, 0.4, 4.25, 0.5, 2.5, 0.1, 0x8e6c8a);
  b.box(1.35, 0.4, 4.25, 0.5, 2.5, 0.1, 0x8e6c8a);
  b.box(-1, 2.62, 4.3, 5.2, 0.04, 0.04, 0x333333);
  // succulent on the sill
  b.cyl(0.4, 0.91, 4.3, 0.09, 0.14, C.pot);
  b.sphere(0.4, 1.1, 4.3, 0.1, C.plant, { sy: 0.8 });

  // ---------- living area ----------
  // rug
  b.box(-1, 0, 0.4, 3.9, 0.012, 3.3, 0x3d335c, { noShadow: true });
  b.box(-1, 0.012, 0.4, 3.6, 0.01, 3.0, 0xc7b5e6, { noShadow: true });
  // sofa (faces north toward TV)
  b.box(-1, 0, 2.45, 2.5, 0.42, 0.95, C.sofaDark, { collide: 'low' });
  b.box(-1.6, 0.42, 2.35, 1.12, 0.14, 0.75, C.sofa);
  b.box(-0.4, 0.42, 2.35, 1.12, 0.14, 0.75, C.sofa);
  b.box(-1, 0.42, 2.8, 2.5, 0.6, 0.26, C.sofa);
  b.box(-2.15, 0.42, 2.45, 0.22, 0.28, 0.95, C.sofaDark);
  b.box(0.15, 0.42, 2.45, 0.22, 0.28, 0.95, C.sofaDark);
  b.box(-1.95, 0.56, 2.6, 0.42, 0.38, 0.14, 0xff9f43, { rotZ: 0.25, rotX: -0.25 });
  b.box(-0.05, 0.56, 2.6, 0.4, 0.36, 0.14, 0x8e7dbe, { rotZ: -0.2, rotX: -0.25 });
  b.box(-0.7, 0.56, 2.45, 0.9, 0.04, 0.7, 0x3c8d93, { rotY: 0.2 }); // blanket
  // coffee table
  b.box(-1, 0.36, 0.3, 1.3, 0.06, 0.66, C.wood, { collide: 'low' });
  for (const [x, z] of [[-1.55, 0.05], [-0.45, 0.05], [-1.55, 0.55], [-0.45, 0.55]]) b.box(x, 0, z, 0.06, 0.36, 0.06, C.dark);
  b.cyl(-1.35, 0.42, 0.25, 0.05, 0.1, 0xffffff); // mug
  b.box(-0.7, 0.42, 0.35, 0.22, 0.03, 0.1, C.dark, { rotY: 0.4 }); // remote
  b.box(-0.9, 0.42, 0.15, 0.2, 0.04, 0.28, 0xe63946, { rotY: -0.3 }); // manga
  b.box(-1.1, 0.42, 0.5, 0.26, 0.06, 0.16, 0x222222); // controller
  // pizza box on the floor (lived-in)
  b.box(0.7, 0, 1.1, 0.5, 0.06, 0.5, 0xd9b38c, { rotY: 0.5 });
  // TV + console
  b.box(-1, 0, -4.12, 2.7, 0.48, 0.48, C.dark, { collide: 'low' });
  b.box(-1, 0.48, -4.15, 0.9, 0.08, 0.12, 0x111111); // soundbar
  b.box(-1.9, 0.48, -4.1, 0.38, 0.08, 0.3, 0xf2f2f2); // console
  b.box(-1, 0.95, -4.32, 2.25, 1.3, 0.06, 0x0b0b10);
  const tv = screenTexture((g, w, h) => drawTV(g, w, h, 'menu'), 384, 216);
  b.plane(-1, 1.6, -4.285, 2.12, 1.19, tv.texture, { basic: true });
  // LED strip behind TV + ceiling cove
  b.box(-1, 0.88, -4.36, 2.6, 0.04, 0.02, 0xb57bff, { glow: true });
  b.box(-1, 2.3, -4.36, 2.6, 0.04, 0.02, 0xb57bff, { glow: true });
  b.box(-1, 2.95, 4.36, 11.6, 0.04, 0.04, 0xffb36b, { glow: true });
  b.box(-1, 2.95, -4.36, 9.6, 0.04, 0.04, 0xb57bff, { glow: true });
  // figurine cabinet
  b.box(1.5, 0, -4.15, 1.0, 1.9, 0.4, 0x3b3346, { collide: true });
  for (let s = 0; s < 3; s++) {
    b.box(1.5, 0.5 + s * 0.45, -4.0, 0.9, 0.03, 0.3, 0xfff1d6, { glow: true });
    const cols = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xa29bfe, 0xff9ff3];
    for (let i = 0; i < 4; i++) {
      const x = 1.17 + i * 0.22;
      const y = 0.53 + s * 0.45;
      b.cyl(x, y, -4.0, 0.04, 0.16, cols[(i + s) % 5], 6);
      b.sphere(x, y + 0.21, -4.0, 0.055, 0xffdcb5);
      b.sphere(x, y + 0.24, -4.01, 0.06, cols[(i + s + 2) % 5], { sy: 0.7 });
    }
  }
  // monstera + plants
  plant(b, 2.55, -3.95, 1.0);
  plant(b, -5.5, 4.0, 0.7);
  plant(b, 5.45, 0.2, 0.8);
  // hanging plant in the corner
  b.cyl(-5.6, 2.4, -4.0, 0.15, 0.2, 0xdedede);
  for (let i = 0; i < 6; i++) b.sphere(-5.6 + Math.cos(i) * 0.15, 2.3 - i * 0.08, -4.0 + Math.sin(i) * 0.15, 0.1, C.plant2);

  // floor lamp
  b.cyl(0.6, 0, 2.8, 0.18, 0.03, C.dark);
  b.cyl(0.6, 0.03, 2.8, 0.02, 1.55, C.dark);
  b.cyl(0.6, 1.55, 2.8, 0.3, 0.32, 0xffd59a, 12, { rTop: 0.18, glow: true });
  b.plane(0.6, 0.02, 2.8, 2.6, 2.6, glowTexture(), { rotX: -Math.PI / 2, basic: true, transparent: true, opacity: 0.25 }).material = glowPool(0xffb35c, 0.28);

  // ---------- gaming corner (west wall) ----------
  b.box(-5.5, 0.72, -2.6, 0.8, 0.05, 2.1, 0x2b2b33, { collide: 'low' });
  b.box(-5.82, 0, -3.55, 0.06, 0.72, 0.06, C.dark);
  b.box(-5.82, 0, -1.65, 0.06, 0.72, 0.06, C.dark);
  b.box(-5.2, 0, -3.55, 0.06, 0.72, 0.06, C.dark);
  b.box(-5.2, 0, -1.65, 0.06, 0.72, 0.06, C.dark);
  // monitors
  const mon0 = screenTexture((g, w, h) => drawMonitor(g, w, h, 0), 256, 150);
  const mon1 = screenTexture((g, w, h) => drawMonitor(g, w, h, 1), 256, 150);
  for (const [z, s] of [[-3.05, mon0], [-2.15, mon1]] as const) {
    b.box(-5.75, 0.77, z, 0.12, 0.25, 0.08, C.dark);
    b.box(-5.73, 0.98, z, 0.04, 0.55, 0.88, 0x111111, { rotY: 0 });
    b.plane(-5.705, 1.255, z, 0.82, 0.48, s.texture, { rotY: Math.PI / 2, basic: true });
  }
  b.box(-5.35, 0.77, -2.6, 0.18, 0.02, 0.55, 0x1a1a1a); // keyboard
  b.box(-5.36, 0.79, -2.6, 0.14, 0.005, 0.5, 0x9b5de5, { glow: true });
  b.box(-5.35, 0.77, -2.1, 0.1, 0.03, 0.06, 0x1a1a1a);
  b.cyl(-5.65, 0.77, -1.85, 0.035, 0.13, 0x00f5d4); // energy drink
  b.cyl(-5.55, 0.77, -1.75, 0.035, 0.13, 0xf15bb5);
  // PC tower with RGB
  b.box(-5.5, 0, -3.95, 0.45, 0.95, 0.22, 0x15151c, { collide: true });
  b.box(-5.5, 0.1, -3.835, 0.38, 0.8, 0.01, 0x00bbf9, { glow: true });
  // gaming chair
  b.box(-4.65, 0.45, -2.6, 0.6, 0.12, 0.6, 0x1c1c22, { collide: 'low' });
  b.box(-4.33, 0.55, -2.6, 0.14, 0.95, 0.56, 0x1c1c22, { rotZ: -0.12 });
  b.box(-4.3, 0.75, -2.6, 0.16, 0.5, 0.2, 0x9b5de5, { rotZ: -0.12 });
  b.cyl(-4.65, 0, -2.6, 0.04, 0.45, 0x333333);
  b.cyl(-4.65, 0, -2.6, 0.3, 0.05, 0x333333, 5);
  b.box(-4.35, 1.0, -2.75, 0.3, 0.5, 0.08, 0x3d405b, { rotZ: -0.3 }); // hoodie draped
  // posters
  b.plane(-5.89, 1.95, -2.6, 0.75, 1.05, posterTexture(0), { rotY: Math.PI / 2 });
  b.plane(-3.6, 1.8, -4.39, 0.7, 0.98, posterTexture(1), { rotY: 0 });
  b.plane(-4.9, 1.9, 4.39, 0.7, 0.98, posterTexture(2), { rotY: Math.PI });
  // ---------- manga bookshelf ----------
  b.box(-5.72, 0, 0.7, 0.42, 1.85, 1.4, 0x5a4232, { collide: true });
  const bookCols = [0xe63946, 0x457b9d, 0xf1faee, 0xffb703, 0x2a9d8f, 0xe76f51, 0x8338ec, 0x06d6a0];
  for (let s = 0; s < 4; s++) {
    b.box(-5.5, 0.05 + s * 0.45, 0.7, 0.04, 0.03, 1.3, 0x3b2a20);
    let z = 0.08;
    let k = s * 3;
    while (z < 1.3) {
      const w = 0.04 + (k % 3) * 0.012;
      const h = 0.28 + (k % 4) * 0.02;
      b.box(-5.6, 0.08 + s * 0.45, z, 0.18, h, w, bookCols[k % bookCols.length]);
      z += w + 0.006;
      k++;
    }
  }

  // ---------- bed corner ----------
  b.box(-4.9, 0, 3.25, 2.0, 0.42, 2.3, 0x4a3b30, { collide: 'low' });
  b.box(-4.9, 0.42, 3.25, 1.9, 0.12, 2.2, 0xf1ece4);
  b.box(-4.9, 0.54, 2.85, 1.95, 0.08, 1.4, 0x355c7d, { rotY: 0.03 });
  b.box(-4.9, 0.54, 4.0, 1.2, 0.14, 0.4, 0xffffff);
  b.box(-4.9, 0, 4.42, 2.0, 1.0, 0.08, 0x4a3b30);
  b.box(-3.55, 0, 4.1, 0.45, 0.5, 0.4, 0x6b4a35, { collide: 'low' });
  b.cyl(-3.55, 0.5, 4.1, 0.08, 0.25, 0xffe3b0, 8, { glow: true });
  // fairy lights over the bed
  for (let i = 0; i <= 14; i++) {
    const x = -5.85 + i * 0.13;
    const y = 2.55 - Math.sin((i / 14) * Math.PI) * 0.25;
    b.sphere(x, y, 4.35, 0.025, i % 2 ? 0xffd27a : 0xffa8d9, { glow: true, detail: 0 });
  }
  // cat bed
  b.cyl(1.0, 0, 3.7, 0.4, 0.14, 0x8d6e97, 14);
  b.cyl(1.0, 0.05, 3.7, 0.3, 0.1, 0xe8d5f2, 14);

  // ---------- kitchen (south-east) ----------
  b.box(3.95, 0, 4.1, 3.9, 0.88, 0.62, 0x7aa095, { collide: true });
  b.box(3.95, 0.88, 4.1, 3.95, 0.05, 0.66, 0xe8e1d5);
  for (let i = 0; i < 5; i++) b.box(2.3 + i * 0.8, 0.7, 3.78, 0.2, 0.03, 0.02, 0xd4d4d4);
  b.box(3.95, 1.7, 4.25, 3.9, 0.7, 0.35, 0x7aa095);
  b.box(3.1, 0.93, 4.1, 0.5, 0.02, 0.38, 0x9aa5ad); // sink
  b.cyl(3.1, 0.93, 4.3, 0.02, 0.28, 0xcfd8dc);
  b.box(4.6, 0.93, 4.1, 0.7, 0.04, 0.45, 0x222222); // stove
  b.cyl(4.45, 0.97, 4.1, 0.09, 0.01, 0x444444, 10);
  b.cyl(4.75, 0.97, 4.1, 0.09, 0.01, 0x444444, 10);
  b.cyl(4.45, 0.98, 4.1, 0.13, 0.1, 0xb0b8c0, 10); // pressure-cooker-ish pot
  b.cyl(5.5, 0.93, 4.15, 0.08, 0.2, 0x264653); // kettle
  for (let i = 0; i < 4; i++) b.cyl(3.6 + i * 0.12, 0.93, 4.3, 0.04, 0.1, [0xe9c46a, 0xe76f51, 0xf4a261, 0x2a9d8f][i], 6);
  // cat food container (empty!)
  b.cyl(2.35, 0.93, 4.05, 0.13, 0.32, 0xcde7f0, 12);
  b.cyl(2.35, 1.25, 4.05, 0.135, 0.04, 0xff8a3d, 12);
  b.plane(2.35, 1.08, 3.915, 0.18, 0.14, labelTexture('MISO\nFOOD', '#ff8a3d'), { rotY: 0 }).rotation.y = Math.PI;
  // fridge
  b.box(5.5, 0, 2.55, 0.75, 1.95, 0.8, 0xdde5ea, { collide: true });
  b.box(5.11, 1.2, 2.25, 0.03, 0.4, 0.04, 0x9aa5ad);
  b.box(5.11, 0.6, 2.25, 0.03, 0.25, 0.04, 0x9aa5ad);
  b.box(5.115, 1.1, 2.55, 0.01, 0.01, 0.8, 0x9aa5ad);
  for (let i = 0; i < 5; i++) b.box(5.115, 1.3 + (i % 3) * 0.15, 2.5 + (i - 2) * 0.13, 0.02, 0.08, 0.08, [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93][i]);
  // small dining table + stools
  b.cyl(3.1, 0, 1.0, 0.05, 0.75, C.dark);
  b.cyl(3.1, 0.75, 1.0, 0.45, 0.04, C.wood, 14, { collide: 'low' });
  b.cyl(2.45, 0, 1.2, 0.18, 0.5, 0xf4a261, 10, { collide: 'low' });
  b.cyl(3.75, 0, 0.8, 0.18, 0.5, 0xf4a261, 10, { collide: 'low' });
  // cat bowl
  b.cyl(3.9, 0, 2.6, 0.17, 0.08, 0xff6f91, 14, { rTop: 0.2 });
  b.cyl(3.9, 0.075, 2.6, 0.14, 0.01, 0x7a2e45, 14);
  b.cyl(4.25, 0, 2.6, 0.13, 0.06, 0x64b5f6, 14, { rTop: 0.15 });
  // wall clock (7:42)
  b.cyl(5.88, 2.1, 0.8, 0.22, 0.03, 0xffffff, 16, { rotZ: Math.PI / 2 });
  b.box(5.85, 2.1, 0.8, 0.01, 0.15, 0.02, 0x222222, { rotX: 1.1 });
  b.box(5.85, 2.1, 0.8, 0.01, 0.11, 0.02, 0x222222, { rotX: -2.4 });
  // kitchen pendant
  b.cyl(3.1, 2.55, 1.0, 0.22, 0.2, 0xffe0a8, 10, { rTop: 0.08, glow: true });
  b.cyl(3.1, 2.75, 1.0, 0.008, 0.25, 0x222222);

  // ---------- entrance ----------
  b.box(5.3, 0, -4.15, 0.9, 0.42, 0.35, 0x6b4a35, { collide: 'low' });
  for (let i = 0; i < 3; i++) {
    b.box(5.0 + i * 0.28, 0.42, -4.15, 0.12, 0.08, 0.26, [0xffffff, 0xe63946, 0x222222][i]);
    b.box(5.13 + i * 0.28, 0.42, -4.15, 0.12, 0.08, 0.26, [0xffffff, 0xe63946, 0x222222][i]);
  }
  b.box(4.0, 0, -4.0, 1.1, 0.012, 0.6, 0x9c6644, { noShadow: true }); // doormat
  // mirror (east wall)
  b.box(5.92, 0.2, -2.6, 0.06, 1.8, 0.7, 0xc9a66b);
  const mirror = b.plane(5.885, 1.1, -2.6, 0.6, 1.66, mirrorTexture(), { rotY: -Math.PI / 2, basic: true });
  mirror.name = 'mirror';
  // switchboard
  b.box(5.9, 1.2, -3.6, 0.03, 0.12, 0.25, 0xffffff);

  // ---------- door (dynamic) ----------
  const door = new THREE.Group();
  door.position.set(3.4 + APT_O.x, 0, -4.5 + APT_O.z);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.24, 0.07), new THREE.MeshStandardMaterial({ color: 0x2f5d62, roughness: 0.6 }));
  panel.position.set(0.6, 1.12, 0);
  panel.castShadow = true;
  door.add(panel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 }));
  knob.position.set(1.05, 1.05, 0.06);
  door.add(knob);
  const knob2 = knob.clone();
  knob2.position.z = -0.06;
  door.add(knob2);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ map: signTexture('302', { bg: '#d4af37', fg: '#2a2a2a', w: 128, h: 48 }) }));
  plate.position.set(0.6, 1.7, -0.04);
  plate.rotation.y = Math.PI;
  door.add(plate);
  group.add(door);
  const doorBox = col.add(3.4 + APT_O.x, -4.6 + APT_O.z, 4.6 + APT_O.x, -4.4 + APT_O.z, true, 'aptDoor');

  // ---------- bowl food (hidden until fed) + snack pile for ending C ----------
  const bowlFood = new THREE.Group();
  const kib = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
  for (let i = 0; i < 14; i++) {
    const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), kib);
    k.position.set(Math.cos(i * 2.3) * 0.08 * Math.random(), 0.09 + (i % 3) * 0.012, Math.sin(i * 2.3) * 0.08 * Math.random());
    bowlFood.add(k);
  }
  bowlFood.position.set(3.9 + APT_O.x, 0, 2.6 + APT_O.z);
  bowlFood.visible = false;
  group.add(bowlFood);
  const snackPile = new THREE.Group();
  snackPile.position.set(-1 + APT_O.x, 0.42, 0.3 + APT_O.z);
  snackPile.visible = false;
  group.add(snackPile);

  // ---------- corridor ----------
  buildCorridor(b, col);
  const liftDisplay = buildLiftCar(b);

  const built = b.build('apt-static');
  group.add(built);

  const lights: LightDef[] = [
    { ...xyz(W(0.6, 1.6, 2.8)), color: 0xffb35c, intensity: 7, distance: 7 },
    { ...xyz(W(-1, 1.4, -3.2)), color: 0x9d7bff, intensity: 5, distance: 6 },
    { ...xyz(W(3.1, 2.3, 1.0)), color: 0xffd8a0, intensity: 6, distance: 6 },
    { ...xyz(W(-4.9, 1.4, -2.6)), color: 0x7f6bff, intensity: 3.5, distance: 4 },
    { ...xyz(W(-4.9, 2.2, 3.6)), color: 0xffa8d9, intensity: 2.5, distance: 4 },
  ];
  const corridorLights: LightDef[] = [-7, -1, 5, 11].map((x) => ({ ...xyz(W(x, 2.7, -6)), color: 0xe4ecff, intensity: 5, distance: 7 }));
  corridorLights.push({ ...xyz(W(20, 2.3, -6)), color: 0xfff4e0, intensity: 4, distance: 4 });

  const anchors: Record<string, THREE.Vector3> = {
    spawn: W(-2.6, 0, 0.8),
    sofaSeat: W(-1, 0, 2.3),
    tv: W(-1, 1, -3.7),
    pc: W(-4.9, 0.9, -2.6),
    poster0: W(-5.6, 1.9, -2.6),
    poster1: W(-3.6, 1.7, -4.1),
    poster2: W(-4.9, 1.7, 4.1),
    fridge: W(4.9, 1, 2.55),
    plant: W(2.55, 0.8, -3.6),
    mirror: W(5.5, 1.1, -2.6),
    door: W(4, 1, -4.1),
    doorOutside: W(4, 0, -5.4),
    bed: W(-3.8, 0.6, 2.8),
    bookshelf: W(-5.3, 1, 0.7),
    figurines: W(1.5, 1.1, -3.7),
    window: W(-1, 1.5, 4.0),
    catFoodJar: W(2.35, 1, 3.6),
    bowl: W(3.9, 0.3, 2.6),
    bowlStand: W(3.9, 0, 2.0),
    catBed: W(1.0, 0.2, 3.7),
    kitchen: W(4.6, 1, 3.6),
    coffeeTable: W(-1, 0.45, 0.3),
    lift: W(11.8, 1.2, -7.0),
    liftArrive: W(11.8, 0, -6.6),
    stairs: W(-9.5, 1.2, -6.0),
    stairsArrive: W(-9.2, 0, -6.0),
    neighborUncle: W(9.35, 0, -6.75),
    neighborAunty: W(10.45, 0, -6.95),
    neighborDoor: W(8.4, 0, -7.0),
    corridorEntry: W(4, 0, -5.6),
    liftCarAarav: W(19.55, 0, -6.15),
    liftCarIyer: W(20.5, 0, -6.05),
    liftCarCam: W(20.02, 2.15, -5.06),
    liftCarLook: W(20.02, 1.15, -6.6),
  };

  return { group, lights, corridorLights, anchors, door, doorBox, tv, bowlFood, snackPile, liftDisplay };
}

function xyz(v: THREE.Vector3) {
  return { x: v.x, y: v.y, z: v.z };
}

function glowPool(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, toneMapped: false });
}

function mirrorTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 160;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 64, 160);
  grd.addColorStop(0, '#b9c6d8');
  grd.addColorStop(0.5, '#e7eef7');
  grd.addColorStop(1, '#9fb0c6');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 160);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(10, 60);
  g.lineTo(50, 20);
  g.moveTo(14, 90);
  g.lineTo(54, 50);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function plant(b: Batch, x: number, z: number, s: number) {
  b.cyl(x, 0, z, 0.2 * s, 0.4 * s, C.pot, 10, { rTop: 0.24 * s, collide: 'low' });
  b.cyl(x, 0.4 * s, z, 0.22 * s, 0.03, 0x3b2a20);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 0.18 * s;
    b.sphere(x + Math.cos(a) * r, (0.75 + (i % 3) * 0.18) * s, z + Math.sin(a) * r, 0.2 * s, i % 2 ? C.plant : C.plant2, { sy: 0.5, rotY: a, rotZ: 0.5 });
  }
  b.sphere(x, 1.2 * s, z, 0.18 * s, C.plant, { sy: 0.7 });
}

function buildCorridor(b: Batch, col: Collision) {
  const H = 3.0;
  const wall = 0xc9d3c5;
  const dado = 0x8d9c88;
  // floor (terrazzo) + ceiling
  b.box(2, -0.1, -6, 24.4, 0.1, 3.2, 0xb9b4ab, { noShadow: true });
  for (let i = 0; i < 40; i++) b.box(-9.6 + ((i * 7.3) % 23), 0.001, -7.3 + ((i * 1.7) % 2.6), 0.08, 0.004, 0.06, [0x8e8a83, 0xd8d3c9, 0x6f6b66][i % 3], { noShadow: true });
  b.box(2, H, -6, 24.4, 0.1, 3.2, 0xe8e8e2, { noShadow: true });
  // walls
  b.box(2, 0, -7.6, 24.4, H, 0.2, wall, { collide: true });
  b.box(2, 0, -7.48, 24.2, 1.0, 0.04, dado);
  b.box(-8.05, 0, -4.5, 3.9, H, 0.2, wall, { collide: true });
  b.box(10.05, 0, -4.5, 8.1, H, 0.2, wall, { collide: true });
  b.box(-10.1, 0, -6, 0.2, H, 3.4, wall, { collide: true });
  b.box(14.1, 0, -6, 0.2, H, 3.4, wall, { collide: true });
  // dado on south side (corridor face of the apartment wall)
  b.box(2, 0, -4.62, 24.2, 1.0, 0.04, dado);
  // fluorescent tubes
  for (const x of [-7, -1, 5, 11]) {
    b.box(x, H - 0.06, -6, 1.3, 0.05, 0.12, 0xf4f9ff, { glow: true });
    b.box(x, H - 0.02, -6, 1.4, 0.03, 0.18, 0xd0d0d0);
  }
  // neighbor doors (north wall)
  const doors: Array<[number, string, number]> = [
    [-6.5, '301', 0x7b4b2a],
    [8.4, '304', 0x8b3a3a],
  ];
  for (const [x, label, color] of doors) {
    b.box(x, 0, -7.48, 1.3, 2.3, 0.06, 0x3a2a1e);
    b.box(x, 0, -7.45, 1.15, 2.2, 0.06, color);
    b.sphere(x + 0.42, 1.05, -7.4, 0.04, 0xd4af37);
    b.plane(x, 1.75, -7.41, 0.3, 0.12, signTexture(label, { bg: '#d4af37', fg: '#222', w: 128, h: 48 }));
    // shoe rack + chappals outside
    b.box(x + 1.05, 0, -7.25, 0.6, 0.35, 0.3, 0x5c4033, { collide: 'low' });
    b.box(x + 0.95, 0.35, -7.25, 0.12, 0.03, 0.26, 0x8d6e63);
    b.box(x + 1.12, 0.35, -7.25, 0.12, 0.03, 0.26, 0x8d6e63);
  }
  b.plane(8.4, 2.35, -7.41, 0.6, 0.15, signTexture('THE SHARMAS', { bg: '#fff3d6', fg: '#8b3a3a', w: 256, h: 64 }));
  b.plane(8.4, 0.012, -6.85, 1.1, 1.1, rangoliTexture(), { rotX: -Math.PI / 2 });
  // flats on the south side (beyond our apartment)
  for (const [x, label] of [[-8.2, '303'], [9.2, '305']] as const) {
    b.box(x, 0, -4.54, 1.3, 2.3, 0.06, 0x3a2a1e);
    b.box(x, 0, -4.57, 1.15, 2.2, 0.06, 0x6d4c41);
    b.plane(x, 1.75, -4.61, 0.3, 0.12, signTexture(label, { bg: '#d4af37', fg: '#222', w: 128, h: 48 }), { rotY: Math.PI });
  }
  // our door frame (corridor side)
  b.box(4, 2.25, -4.62, 1.4, 0.1, 0.06, 0x3a2a1e);
  b.box(3.33, 0, -4.62, 0.08, 2.3, 0.06, 0x3a2a1e);
  b.box(4.67, 0, -4.62, 0.08, 2.3, 0.06, 0x3a2a1e);
  // lift (north wall, east end)
  b.box(11.8, 0, -7.47, 1.9, 2.5, 0.08, 0x6c757d);
  b.box(11.35, 0, -7.42, 0.88, 2.25, 0.04, 0xadb5bd);
  b.box(12.25, 0, -7.42, 0.88, 2.25, 0.04, 0xadb5bd);
  b.box(11.8, 0, -7.4, 0.02, 2.25, 0.02, 0x495057);
  b.box(13.0, 1.1, -7.43, 0.14, 0.24, 0.04, 0x343a40);
  b.sphere(13.0, 1.22, -7.4, 0.03, 0xffb703, { glow: true, detail: 0 });
  b.plane(11.8, 2.68, -7.42, 0.6, 0.2, signTexture('▲ 3 ▼', { bg: '#111', fg: '#ff4d4d', w: 192, h: 64, glow: true }), { basic: true });
  // stairs door (west wall)
  b.box(-9.98, 0, -6, 0.06, 2.3, 1.3, 0x3a2a1e);
  b.box(-9.94, 0, -6, 0.06, 2.2, 1.15, 0x4a6670);
  b.box(-9.9, 1.0, -5.6, 0.04, 0.05, 0.2, 0xd4d4d4);
  b.plane(-9.9, 2.5, -6, 0.8, 0.25, signTexture('STAIRS ↓', { bg: '#2d6a4f', fg: '#fff', w: 256, h: 80 }), { rotY: Math.PI / 2 });
  // fire extinguisher, plants, meter box
  b.cyl(0, 0.4, -7.38, 0.09, 0.5, 0xd62828);
  b.box(0, 0.88, -7.38, 0.06, 0.08, 0.06, 0x222222);
  b.box(2.5, 1.5, -7.46, 0.6, 0.8, 0.12, 0x9aa5ad);
  plant(b, -9.4, -7.05, 0.75);
  plant(b, 13.5, -5.0, 0.8);
  plant(b, 1.6, -4.95, 0.6);
  b.plane(-2, 2.3, -7.46, 0.5, 0.16, signTexture('FLOOR 3', { bg: '#264653', fg: '#fff', w: 192, h: 64 }));
  void col;
}

/** A tiny lift car, out of sight east of the corridor. Used for the awkward ride down. */
function buildLiftCar(b: Batch) {
  const cx = 20, cz = -6, H = 2.6;
  const steel = 0xb8c0c8;
  b.box(cx, -0.05, cz, 2.1, 0.05, 2.1, 0x3d3d45, { noShadow: true });
  b.box(cx, H, cz, 2.1, 0.08, 2.1, 0xd6dbe0, { noShadow: true });
  b.box(cx, H - 0.05, cz, 1.2, 0.03, 1.2, 0xfff4e0, { glow: true });
  b.box(cx - 1.05, 0, cz, 0.06, H, 2.1, steel);
  b.box(cx + 1.05, 0, cz, 0.06, H, 2.1, steel);
  b.box(cx, 0, cz - 1.05, 2.1, H, 0.06, steel);
  // mirror back wall + handrail
  b.box(cx, 0.9, cz - 1.0, 1.6, 1.4, 0.02, 0xdfe9f2);
  b.box(cx, 0.9, cz - 0.97, 1.7, 0.04, 0.05, 0x8d99ae);
  b.box(cx - 1.0, 0.9, cz, 0.05, 0.04, 1.7, 0x8d99ae);
  // door side (closed doors) + button panel
  b.box(cx - 0.5, 0, cz + 1.05, 0.98, 2.2, 0.05, 0x9aa5ad);
  b.box(cx + 0.5, 0, cz + 1.05, 0.98, 2.2, 0.05, 0x9aa5ad);
  b.box(cx, 2.2, cz + 1.05, 2.1, H - 2.2, 0.06, steel);
  b.box(cx + 0.92, 0.9, cz + 0.7, 0.04, 0.5, 0.22, 0x343a40);
  for (let i = 0; i < 4; i++) b.sphere(cx + 0.9, 1.0 + i * 0.09, cz + 0.7, 0.025, i === 0 ? 0xffb703 : 0xdedede, { glow: i === 0, detail: 0 });
  b.plane(cx - 0.6, 1.55, cz + 1.02, 0.4, 0.2, signTexture('MAX 8 PERSONS', { bg: '#f8f9fa', fg: '#c1121f', w: 256, h: 96 }), { rotY: Math.PI });
  const disp = screenTexture((g, w, h) => drawLiftDisplay(g, w, h, '3', ''), 128, 64);
  b.plane(cx, 2.38, cz + 1.0, 0.42, 0.21, disp.texture, { rotY: Math.PI, basic: true });
  return disp;
}

export function drawLiftDisplay(g: CanvasRenderingContext2D, w: number, h: number, floor: string, arrow: string) {
  g.fillStyle = '#0b0b10';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff4d4d';
  g.shadowColor = '#ff4d4d';
  g.shadowBlur = 8;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 40px ui-monospace, Menlo, monospace';
  g.fillText(`${arrow}${floor}`, w / 2, h / 2 + 2);
}
