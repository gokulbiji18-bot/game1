import * as THREE from 'three';
import { Batch, LightDef } from './builder';
import { Collision, Box } from '../collision';
import { plant } from './apartment';
import { signTexture, noticeTexture, glowTexture, catFoodTexture, labelTexture, skylineTexture } from './textures';

// Lobby, the Bengaluru-style street, and Namma Mart. Loaded lazily after the apartment.
export interface OutsideRefs {
  group: THREE.Group;
  lobbyLights: LightDef[];
  streetLights: LightDef[];
  storeLights: LightDef[];
  anchors: Record<string, THREE.Vector3>;
  items: Record<string, THREE.Object3D>;
  storeDoors: THREE.Object3D[];
  unpaidBarrier: Box;
  sky: THREE.Object3D;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function groundY(x: number, z: number) {
  if (z > -11 && z < -3 && x > -38 && x < 137) return -0.12;
  if (z <= -11 && ((x > -38 && x < -27) || (x > 126 && x < 137))) return -0.12;
  return 0;
}

const glowMat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, toneMapped: false });
let glowTex: THREE.Texture;

export function buildOutside(col: Collision): OutsideRefs {
  glowTex = glowTexture();
  const group = new THREE.Group();
  group.name = 'outside';
  const b = new Batch(col);
  const streetLights: LightDef[] = [];
  const pools: Array<[number, number, number, number]> = [];

  buildLobby(b);
  const lobbyLights: LightDef[] = [
    { x: 0, y: 3.0, z: 3, color: 0xfff0d6, intensity: 6, distance: 9 },
    { x: 0, y: 3.0, z: 8, color: 0xfff0d6, intensity: 6, distance: 9 },
    { x: 4, y: 2.4, z: 2.8, color: 0xffd9a0, intensity: 3, distance: 5 },
  ];

  // ---------- ground ----------
  b.box(50, -0.22, -12, 220, 0.1, 70, 0x34323d, { noShadow: true }); // asphalt base (top -0.12)
  // south sidewalk
  b.box(49.5, -0.12, -1.5, 175, 0.12, 3, 0x9c968c, { noShadow: true });
  b.box(49.5, -0.12, -2.95, 175, 0.14, 0.12, 0xc9c3b8, { noShadow: true });
  // sidewalk tiles pattern
  for (let x = -37; x < 136; x += 1.5) b.box(x, 0.001, -1.5, 0.04, 0.003, 2.9, 0x857f75, { noShadow: true });
  // north sidewalk
  b.box(49.5, -0.12, -12.5, 153, 0.12, 3, 0x9c968c, { noShadow: true });
  b.box(49.5, -0.12, -11.05, 153, 0.14, 0.12, 0xc9c3b8, { noShadow: true });
  // ground behind buildings / alley
  b.box(30, -0.12, 5, 4, 0.12, 10, 0x8a8478, { noShadow: true });
  // lane markings
  for (let x = -34; x < 134; x += 6) b.box(x, -0.118, -7, 3, 0.004, 0.15, 0xe9e4d6, { noShadow: true });
  // zebra crossing near our building
  for (let i = 0; i < 7; i++) b.box(-14, -0.118, -4 - i * 1.0, 3, 0.004, 0.5, 0xeeeeee, { noShadow: true });

  // ---------- south-side buildings ----------
  const southBlocks: Array<[number, number, number, number, string?]> = [
    [-38, -24, 14, 0xd9a273, 'LAKSHMI RESIDENCY'],
    [-24, -9, 11, 0x8fb8a8],
    [118, 137, 13, 0xc7a2c4, 'GREEN GLEN APTS'],
  ];
  for (const [x0, x1, h, color, name] of southBlocks) residential(b, x0, x1, 0, 12, h, color, -1, name);
  // shop row (two upper floors, shop at ground)
  shop(b, 9, 18, 0xf2c14e, 'IYENGAR BAKERY', 'ಐಯ್ಯಂಗಾರ್ ಬೇಕರಿ', '#7a2e1d', '#fff4d6');
  teaStall(b, 18, 28);
  // alley side walls + back wall
  b.box(30, 0, 10, 4, 3, 0.3, 0x7d7468, { collide: true });
  xeroxShop(b, 32, 40);
  shop(b, 40, 56, 0xe07a5f, 'DARSHINI — IDLI VADA DOSA', 'ದರ್ಶಿನಿ', '#fff8e7', '#9b2226');
  construction(b, 56, 74);
  shop(b, 74, 84, 0xe9f5db, 'SRI SAI MEDICALS', 'ಮೆಡಿಕಲ್ಸ್', '#2d6a4f', '#ffffff');
  b.box(79, 3.3, -0.25, 0.7, 0.7, 0.12, 0x38b000, { glow: true });
  shop(b, 84, 96, 0xffc8dd, 'FLOWERS & POOJA', 'ಹೂವು', '#7b2cbf', '#ffffff');
  // marigold garlands at the flower shop
  for (let i = 0; i < 8; i++) b.cyl(85.5 + i * 1.2, 1.2, -0.25, 0.06, 1.1, i % 2 ? 0xffa200 : 0xff6d00, 6);

  // ---------- north side ----------
  residential(b, -50, -38, -11, 30, 16, 0xa5a58d, 1, undefined, true);
  residential(b, -27, -6, -14, -40, 15, 0xcdb4db, 1, 'NANDI HEIGHTS');
  hardwareShop(b, -6, 8);
  shopNorth(b, 8, 18, 0xf9c74f, 'TAILOR', 'ಟೈಲರ್');
  shopNorth(b, 18, 30, 0x577590, 'ATM • 24x7', '');
  park(b, 30, 62);
  residential(b, 62, 86, -14, -40, 12, 0xe5989b, 1);
  shopNorth(b, 86, 100, 0xffb703, 'MOBILES', 'ಮೊಬೈಲ್ಸ್');
  residential(b, 100, 126, -14, -40, 17, 0x8ecae6, 1, 'SKYLINE TOWERS');
  residential(b, 137, 150, -11, 30, 14, 0xb5838d, -1, undefined, true);
  residential(b, -50, -38, -40, -11, 15, 0x9a8c98, 1, undefined, true);
  residential(b, 137, 150, -40, -11, 15, 0x9a8c98, -1, undefined, true);
  // side-road flanks and barricades (vehicles disappear past them)
  for (const sx of [-32.5, 131.5]) {
    b.box(sx, -0.12, -26, 11, 0.12, 0.3, 0x000000, { noShadow: true });
    for (let i = 0; i < 5; i++) {
      b.box(sx - 4 + i * 2, 0, -23, 1.6, 0.9, 0.12, i % 2 ? 0xffffff : 0xe63946);
      b.box(sx - 4.6 + i * 2, 0, -23, 0.08, 0.9, 0.3, 0x333333);
    }
    b.plane(sx, 1.4, -22.9, 3, 0.6, signTexture('ROAD WORK — DIVERSION', { bg: '#ffb703', fg: '#111', w: 512, h: 100 }));
    b.wall(sx - 5.5 - (sx > 0 ? 0 : 0), -23.4, sx + 5.5, -22.6);
  }
  b.box(-32.5, 0, -40, 11, 10, 1, 0x3d405b);
  b.box(131.5, 0, -40, 11, 10, 1, 0x3d405b);

  // ---------- street furniture ----------
  // tube lights inside the two errand shops
  streetLights.push({ x: 1, y: 2.4, z: -15.6, color: 0xf3f8ff, intensity: 6, distance: 6 });
  streetLights.push({ x: 36, y: 2.4, z: 1.6, color: 0xf3f8ff, intensity: 6, distance: 6 });
  const lampXs = [-32, -18, 13, 27, 41, 55, 76, 90, 112, 128];
  for (const x of lampXs) {
    streetLamp(b, x, -2.75, 1);
    streetLights.push({ x, y: 5, z: -3.6, color: 0xffb25e, intensity: 14, distance: 13 });
    pools.push([x, -3.4, 0xffa94d, 0.5]);
  }
  for (const x of [-20, 4, 22, 46, 70, 94, 116]) {
    streetLamp(b, x, -11.3, -1);
    streetLights.push({ x, y: 5, z: -10.4, color: 0xffb25e, intensity: 12, distance: 12 });
    pools.push([x, -10.6, 0xffa94d, 0.45]);
  }
  // electric poles + overhead cables
  const poleXs = [-36, -21, -6, 10, 26, 42, 58, 74, 90, 106, 122, 136];
  for (const x of poleXs) {
    b.box(x, 0, -2.95, 0.22, 7.5, 0.22, 0x8d8a85, { collide: true });
    b.box(x, 6.8, -2.95, 1.6, 0.1, 0.1, 0x6b6b6b);
    b.cyl(x - 0.25, 6.2, -3.15, 0.18, 0.5, 0x5a5a5a, 8); // transformer-ish
  }
  group.add(cables(poleXs));
  // trees
  const trees: Array<[number, number, number]> = [
    [-29, -12.8, 1.1], [-12, -12.6, 1.2], [6, -13.0, 1], [34, -17, 1.3], [40, -24, 1.5], [52, -19, 1.2], [58, -26, 1.4],
    [64, -12.8, 1], [82, -12.8, 1.2], [108, -12.8, 1.1], [123, -12.8, 1], [6.5, -0.5, 0.9], [-20, -0.5, 1], [31, 7, 0.8],
  ];
  for (const [x, z, s] of trees) tree(b, x, z, s);
  // parked scooters and an auto
  const scooters: Array<[number, number, number, number]> = [
    [11, -3.6, 0.2, 0xe63946], [12.2, -3.6, 0.15, 0x457b9d], [36, -3.6, -0.1, 0xf1faee], [37.2, -3.6, 0.2, 0x2a9d8f],
    [60, -3.7, 0.1, 0x264653], [61.3, -3.7, -0.15, 0xe9c46a], [62.6, -3.7, 0.1, 0xf4a261], [64, -3.7, 0.2, 0xe76f51],
    [65.4, -3.7, 0.0, 0x8338ec], [66.8, -3.7, 0.15, 0x06d6a0], [68.2, -3.7, -0.1, 0xffffff], [69.6, -3.7, 0.1, 0x3a86ff],
    [98, -3.6, 0.1, 0xffbe0b], [103, -3.6, -0.2, 0xfb5607], [-2, -12.2, Math.PI + 0.2, 0xff006e], [20, -12.3, Math.PI, 0x8ac926],
  ];
  for (const [x, z, r, c] of scooters) b.frame(x, z, Math.PI / 2 + r, () => scooter(b, c, z > -6 && x > 58 && x < 71));
  b.frame(-9, -4.2, Math.PI / 2, () => autoRickshaw(b, true));
  b.frame(88, -4.2, Math.PI / 2 + 0.05, () => autoRickshaw(b, true));
  // festival buntings strung across the street
  for (const x of [8, 34, 66, 92, 118]) bunting(b, x);
  // manholes and patched asphalt
  for (const x of [-20, 6, 31, 57, 83, 112]) {
    b.cyl(x, -0.119, -6.0, 0.42, 0.006, 0x2a2a30, 14, { noShadow: true });
    b.cyl(x, -0.114, -6.0, 0.36, 0.004, 0x45454d, 14, { noShadow: true });
  }
  for (const [x, z, w, d] of [[-8, -9.4, 3.2, 1.4], [24, -4.6, 2.2, 1.0], [71, -9.8, 4, 1.2], [104, -5.0, 2.6, 1.6]]) b.box(x, -0.119, z, w, 0.004, d, 0x2b2930, { noShadow: true, rotY: 0.08 });
  busStop(b, 46.5);
  vegCart(b, 90.5, -2.35);
  // big neem tree by the park + potted plants along shopfronts
  tree(b, 26.5, -12.9, 1.6);
  for (const x of [9.6, 31.4, 40.4, 55.6, 84.4]) plant(b, x, -0.45, 0.7);
  // dustbin, milk booth-ish kiosk, bench
  b.cyl(15.5, 0, -2.4, 0.3, 0.8, 0x2a9d8f, 10, { collide: 'low' });
  b.cyl(70.5, 0, -0.9, 0.3, 0.8, 0x2a9d8f, 10, { collide: 'low' });

  // ---------- lobby-front details ----------
  b.box(-1.9, 0, -0.4, 0.7, 0.9, 0.7, 0x9c6644, { collide: 'low' });
  b.box(1.9, 0, -0.4, 0.7, 0.9, 0.7, 0x9c6644, { collide: 'low' });
  b.sphere(-1.9, 1.15, -0.4, 0.4, 0x4f9a5a);
  b.sphere(1.9, 1.15, -0.4, 0.4, 0x4f9a5a);

  // ---------- Namma Mart ----------
  const store = buildStore(b, col, group);

  // light pools on the ground
  for (const [x, z, color, op] of pools) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glowMat(color, op));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, -0.1, z);
    group.add(m);
  }
  // glow pools from shop fronts
  for (const x of [13.5, 23, 36, 48, 79, 90, 100.5, 108]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), glowMat(x > 96 ? 0xd7f3ff : 0xffcf8a, 0.3));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.01, -1.4);
    group.add(m);
  }

  group.add(b.build('outside-static'));
  const sky = buildSky();
  group.add(sky);

  const anchors: Record<string, THREE.Vector3> = {
    lobbyLift: V(2.5, 1.2, 9.6),
    lobbyLiftArrive: V(2.5, 0, 8.6),
    lobbyStairsArrive: V(-3.5, 0, 7.3),
    guard: V(4.4, 0, 2.8),
    guardDesk: V(3.5, 1, 2.8),
    noticeboard: V(-5.6, 1.6, 5),
    lobbyExit: V(0, 0, -0.6),
    teaVendor: V(23, 0, 1.4),
    teaCust1: V(21.3, 0, -0.9),
    teaCust2: V(23.0, 0, -1.25),
    teaStall: V(23, 1, 0.3),
    streetCat: V(30, 0, 5.2),
    grass: V(46, 0.2, -20),
    danceTrigger: V(57.5, 0, -1.5),
    danceSpot: V(63.5, 0, -2.3),
    danceStranger: V(78, 0, -2.3),
    storeEntrance: V(100.5, 0, -1.2),
    storeInside: V(100.5, 0, 1.6),
    storeSignLook: V(100.5, 4, 0),
    errandHardware: V(0.6, 0.6, -14.6),
    errandXerox: V(35.2, 0.6, 0.6),
    ...store.anchors,
  };

  return {
    group,
    lobbyLights,
    streetLights,
    storeLights: store.lights,
    anchors,
    items: store.items,
    storeDoors: store.doors,
    unpaidBarrier: store.barrier,
    sky,
  };
}

// ------------------------------------------------------------------ lobby
function buildLobby(b: Batch) {
  const H = 3.4;
  // floor (checker marble)
  for (let x = -6; x < 6; x++) for (let z = 0; z < 10; z++) b.box(x + 0.5, -0.05, z + 0.5, 1, 0.05, 1, (x + z) % 2 ? 0xe9e2d6 : 0xd6cdbd, { noShadow: true });
  b.box(0, H, 5, 12, 0.1, 10.4, 0xf2efe8, { noShadow: true });
  // ceiling lights
  for (const z of [3, 8]) b.box(0, H - 0.04, z, 1.6, 0.04, 0.5, 0xfff6e0, { glow: true });
  const wall = 0xf0e6d2;
  // front wall (z=0) with entrance x -1.3..1.3
  b.box(-5.15, 0, 0, 7.7, H, 0.3, wall, { collide: true });
  b.box(5.15, 0, 0, 7.7, H, 0.3, wall, { collide: true });
  b.box(0, 2.6, 0, 2.6, H - 2.6, 0.3, wall);
  b.box(-6.1, 0, 5, 0.2, H, 10.2, wall, { collide: true });
  b.box(6.1, 0, 5, 0.2, H, 10.2, wall, { collide: true });
  b.box(0, 0, 10.1, 12.4, H, 0.2, wall, { collide: true });
  // dado
  b.box(-6.0, 0, 5, 0.04, 1.1, 10, 0xb08968);
  b.box(6.0, 0, 5, 0.04, 1.1, 10, 0xb08968);
  // lift
  b.box(2.5, 0, 9.97, 1.9, 2.5, 0.08, 0x6c757d);
  b.box(2.05, 0, 9.92, 0.88, 2.25, 0.04, 0xadb5bd);
  b.box(2.95, 0, 9.92, 0.88, 2.25, 0.04, 0xadb5bd);
  b.box(3.7, 1.1, 9.93, 0.14, 0.24, 0.04, 0x343a40);
  b.sphere(3.7, 1.22, 9.9, 0.03, 0xffb703, { glow: true, detail: 0 });
  b.plane(2.5, 2.68, 9.9, 0.6, 0.2, signTexture('▲ G ▼', { bg: '#111', fg: '#ff4d4d', w: 192, h: 64, glow: true }), { rotY: Math.PI, basic: true });
  // stairs going up (decor)
  for (let i = 0; i < 7; i++) b.box(-3.5, 0, 8.05 + i * 0.3, 2.2, 0.2 * (i + 1), 0.3, 0xcfc6b8);
  b.wall(-4.6, 7.85, -2.4, 10);
  b.box(-4.65, 0, 8.8, 0.06, 1.6, 2.4, 0x6b4a35, { collide: true });
  b.plane(-3.5, 2.7, 9.98, 0.9, 0.25, signTexture('STAIRS ↑', { bg: '#2d6a4f', fg: '#fff', w: 256, h: 80 }), { rotY: Math.PI });
  // guard desk
  b.box(3.4, 0, 2.8, 0.7, 1.05, 1.9, 0x6b4a35, { collide: true });
  b.box(3.4, 1.05, 2.8, 0.8, 0.05, 2.0, 0xd8c3a5);
  b.box(3.3, 1.1, 2.4, 0.3, 0.02, 0.4, 0xf8f9fa); // register book
  b.box(3.3, 1.1, 3.2, 0.1, 0.25, 0.15, 0x222222); // radio
  b.cyl(5.0, 0, 3.2, 0.25, 0.45, 0x5e503f, 8); // stool
  b.plane(3.04, 0.6, 2.8, 1.2, 0.3, signTexture('SECURITY', { bg: '#1d3557', fg: '#fff', w: 256, h: 64 }), { rotY: -Math.PI / 2 });
  // noticeboard (west wall)
  b.plane(-5.98, 1.6, 5, 1.6, 1.05, noticeTexture(), { rotY: Math.PI / 2 });
  b.plane(-5.97, 2.3, 5, 1.2, 0.22, signTexture('NOTICE BOARD', { bg: '#7a5230', fg: '#fff', w: 256, h: 48 }), { rotY: Math.PI / 2 });
  // mailboxes (east wall)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) b.box(5.95, 0.9 + r * 0.32, 6.5 + c * 0.4, 0.15, 0.28, 0.36, c === 1 && r === 1 ? 0xd62828 : 0x9aa5ad);
  // bench + plants
  b.box(-5.5, 0, 2.6, 0.6, 0.45, 1.8, 0x6b4a35, { collide: 'low' });
  plant(b, -5.4, 0.7, 0.9);
  plant(b, 5.4, 0.7, 0.9);
  plant(b, 5.4, 9.4, 0.7);
  // facade + upper floors
  b.box(0, H, 6.5, 18, 13, 13.2, 0xe8c07d);
  b.box(-7.6, 0, 6.5, 2.8, H, 13, 0xe8c07d, { collide: true });
  b.box(7.6, 0, 6.5, 2.8, H, 13, 0xe8c07d, { collide: true });
  b.box(0, 0, 11.5, 12.4, H, 2.6, 0xe8c07d, { collide: true });
  // canopy over entrance
  b.box(0, 2.9, -0.9, 3.6, 0.15, 1.8, 0x7f5539);
  b.plane(0, 3.25, -1.81, 3.4, 0.6, signTexture('SUNSHINE ENCLAVE', { bg: '#7f5539', fg: '#ffe8a3', kannada: 'ಸನ್‌ಶೈನ್ ಎನ್‌ಕ್ಲೇವ್', w: 512, h: 96, glow: true }), { rotY: Math.PI, basic: true });
  // balconies with plants and lit windows on the facade
  for (let f = 0; f < 3; f++) {
    const y = 4.4 + f * 3.4;
    for (const x of [-5.5, 0, 5.5]) {
      b.box(x, y + 0.4, -0.13, 2.2, 1.4, 0.06, (f + x) % 3 ? 0xffcf7a : 0x3a3550, { glow: (f + x) % 3 !== 0 });
      b.box(x, y - 0.1, -0.6, 2.6, 0.12, 1.2, 0xd6c3a1);
      b.box(x, y, -1.18, 2.6, 0.9, 0.06, 0x5c677d);
      for (let p = 0; p < 3; p++) b.sphere(x - 0.8 + p * 0.8, y + 0.95, -1.05, 0.22, 0x4f9a5a, { sy: 0.8 });
    }
  }
}

// ------------------------------------------------------------------ helpers
function residential(b: Batch, x0: number, x1: number, z0: number, z1: number, h: number, color: number, facing: 1 | -1, name?: string, side = false) {
  const w = x1 - x0;
  const d = Math.abs(z1 - z0);
  const cz = (z0 + z1) / 2;
  const cx = (x0 + x1) / 2;
  b.box(cx, 0, cz, w, h, d, color, { collide: true });
  b.box(cx, h, cz, w + 0.3, 0.3, d + 0.3, 0x6c6c6c);
  rooftop(b, x0, x1, Math.min(z0, z1), Math.max(z0, z1), h + 0.3);
  if (!side) acUnits(b, x0, x1, facing === -1 ? Math.min(z0, z1) : Math.max(z0, z1), facing, Math.floor(h / 3));
  if (side) {
    // face toward the road end
    const fx = facing === 1 ? x1 + 0.03 : x0 - 0.03;
    for (let f = 0; f < Math.floor(h / 3); f++) {
      for (let k = 0; k < Math.floor(d / 4); k++) {
        const lit = (f * 7 + k * 3) % 5 < 3;
        b.box(fx, 1.2 + f * 3, Math.min(z0, z1) + 2 + k * 4, 0.05, 1.3, 1.6, lit ? 0xffcf7a : 0x2b2b44, { glow: lit });
      }
    }
    return;
  }
  const fz = facing === -1 ? Math.min(z0, z1) - 0.03 : Math.max(z0, z1) + 0.03;
  const zf = facing === -1 ? Math.min(z0, z1) : Math.max(z0, z1);
  const floors = Math.floor(h / 3);
  for (let f = 0; f < floors; f++) {
    for (let x = x0 + 1.8; x < x1 - 1.2; x += 3.2) {
      const lit = (Math.floor(x * 7) + f * 3) % 5 < 3;
      b.box(x, 1.2 + f * 3, fz, 1.6, 1.3, 0.05, lit ? (Math.floor(x) % 3 ? 0xffcf7a : 0xbfe3ff) : 0x2b2b44, { glow: lit });
      if (f > 0 && Math.floor(x + f) % 2 === 0) {
        // balcony with a plant
        b.box(x, f * 3 + 0.4, zf + facing * 0.55, 2.0, 0.1, 1.1, 0xd6d0c4);
        b.box(x, f * 3 + 0.5, zf + (facing === -1 ? -1.08 : 1.08), 2.0, 0.8, 0.05, 0x5c677d);
        b.sphere(x + 0.6, f * 3 + 1.4, zf + (facing === -1 ? -0.9 : 0.9), 0.22, 0x4f9a5a, { sy: 0.8 });
      }
    }
  }
  if (name) {
    b.plane(cx, 3.0, fz + (facing === -1 ? -0.02 : 0.02), Math.min(6, w * 0.6), 0.6, signTexture(name, { bg: '#2b2d42', fg: '#f6e7cb', w: 512, h: 64 }), { rotY: facing === -1 ? Math.PI : 0, basic: true });
  }
}

function shop(b: Batch, x0: number, x1: number, color: number, name: string, kannada: string, bg: string, fg: string) {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  // building mass above + side columns
  b.box(cx, 0, 6, w, 9, 12, 0xd8cfc0, { collide: true });
  b.box(cx, 0, -0.03, w, 9, 0.06, 0xd8cfc0);
  // shop window (glowing interior) with shelves, silhouettes and mullions
  b.box(cx, 0.3, -0.07, w - 1.2, 2.3, 0.05, new THREE.Color(color).multiplyScalar(0.55), { glow: true });
  for (const y of [0.95, 1.6]) b.box(cx, y, -0.1, w - 1.3, 0.05, 0.03, 0x3a3030);
  for (let x = x0 + 0.9; x < x1 - 0.7; x += 0.55) {
    const h = 0.2 + ((x * 13) % 3) * 0.06;
    b.box(x, 1.0, -0.1, 0.32, h, 0.03, 0x4a3a3a);
    b.box(x + 0.1, 1.65, -0.1, 0.26, h * 0.8, 0.03, 0x4a3a3a);
  }
  for (let x = x0 + 0.6; x <= x1 - 0.5; x += (w - 1.2) / Math.max(2, Math.round((w - 1.2) / 2.2))) b.box(x, 0.3, -0.11, 0.08, 2.3, 0.05, 0x2b2b2b);
  b.box(cx, 0, -0.1, w - 1.0, 0.3, 0.1, 0x555555);
  // shutters rolled up
  b.box(cx, 2.6, -0.15, w - 0.8, 0.4, 0.3, 0x8d99ae);
  // signboard
  b.plane(cx, 3.35, -0.12, w - 0.6, 1.0, signTexture(name, { bg, fg, kannada: kannada || undefined, w: 768, h: 140, glow: true }), { rotY: Math.PI, basic: true });
  // awning
  b.box(cx, 2.85, -0.7, w - 0.4, 0.06, 1.3, 0xffffff * 0 + (color & 0xbfbfbf), { rotX: 0.25 });
  rooftop(b, x0, x1, 0, 12, 9);
  acUnits(b, x0, x1, 0, -1, 3);
  // upper floor windows
  for (let x = x0 + 1.5; x < x1 - 1; x += 2.6) {
    const lit = Math.floor(x) % 3 !== 0;
    b.box(x, 5.0, -0.08, 1.4, 1.2, 0.05, lit ? 0xffd98e : 0x2b2b44, { glow: lit });
    b.box(x, 7.6, -0.08, 1.4, 1.0, 0.05, !lit ? 0xffd98e : 0x2b2b44, { glow: !lit });
  }
}

function shopNorth(b: Batch, x0: number, x1: number, color: number, name: string, kannada: string) {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  b.box(cx, 0, -27, w, 8, 26, 0xcbbfad, { collide: true });
  rooftop(b, x0, x1, -40, -14, 8);
  b.box(cx, 0.3, -13.95, w - 1.2, 2.3, 0.05, color, { glow: true });
  b.plane(cx, 3.3, -13.9, w - 0.8, 0.9, signTexture(name, { bg: '#1d1b2e', fg: '#fff', kannada: kannada || undefined, w: 512, h: 112, glow: true }), { basic: true });
  for (let x = x0 + 1.5; x < x1 - 1; x += 2.6) {
    const lit = Math.floor(x) % 2 === 0;
    b.box(x, 5, -13.95, 1.4, 1.2, 0.05, lit ? 0xffd98e : 0x2b2b44, { glow: lit });
  }
}

/** Open-front hardware shop on the north side (batteries errand). */
function hardwareShop(b: Batch, x0: number, x1: number) {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  const wall = 0xcbbfad;
  b.box(cx, 2.9, -17, w, 5.1, 6, wall);
  b.box(cx, 0, -28.5, w, 8, 23, wall, { collide: true });
  b.box(x0 + 0.4, 0, -15.5, 0.8, 2.9, 3, wall, { collide: true });
  b.box(x1 - 0.4, 0, -15.5, 0.8, 2.9, 3, wall, { collide: true });
  rooftop(b, x0, x1, -40, -14, 8);
  // counter with a battery display
  b.box(cx, 0, -14.6, w - 1.6, 0.95, 0.6, 0x5c4033, { collide: true });
  b.box(cx, 0.95, -14.6, w - 1.5, 0.05, 0.7, 0xa68a64);
  b.box(cx + 1.6, 1.0, -14.55, 0.9, 0.35, 0.18, 0x222222);
  for (let i = 0; i < 6; i++) b.cyl(cx + 1.25 + i * 0.13, 1.05, -14.45, 0.035, 0.18, i % 2 ? 0xffd60a : 0x1d1d1d, 8);
  b.plane(cx + 1.6, 1.48, -14.46, 0.9, 0.22, signTexture('BATTERIES', { bg: '#ffd60a', fg: '#111', w: 256, h: 64 }));
  // back-wall shelves: paint tins, buckets, pipes, hoses
  for (let lvl = 0; lvl < 3; lvl++) {
    b.box(cx, 0.6 + lvl * 0.7, -16.75, w - 1.8, 0.05, 0.45, 0x6b4a35);
    for (let i = 0; i < 14; i++) {
      const x = x0 + 1.2 + i * ((w - 2.4) / 13);
      if (lvl === 1) b.cyl(x, 0.65 + lvl * 0.7, -16.75, 0.13, 0.3, [0xe63946, 0x457b9d, 0xf1faee, 0x2a9d8f][i % 4], 10);
      else b.box(x, 0.65 + lvl * 0.7, -16.75, 0.22, 0.25 + (i % 3) * 0.06, 0.25, [0x6c757d, 0xffb703, 0x8d99ae, 0x588157][i % 4]);
    }
  }
  for (let i = 0; i < 5; i++) b.cyl(x0 + 1.4 + i * 0.25, 0.05, -16.2, 0.04, 2.3, 0xadb5bd, 6);
  for (let i = 0; i < 3; i++) b.cyl(x1 - 2 + i * 0.5, 0, -16.1, 0.28, 0.4, [0xe63946, 0x3a86ff, 0x2a9d8f][i], 12, { rTop: 0.33 });
  b.cyl(x1 - 1.4, 2.1, -15.0, 0.3, 0.12, 0x2d6a4f, 14, { rotX: Math.PI / 2 });
  b.box(cx, 2.4, -15.5, w - 2, 0.04, 0.2, 0xfff3c4, { glow: true });
  b.box(cx, 2.9, -13.4, w, 0.08, 1.4, 0x588157, { rotX: -0.2 });
  b.plane(cx, 3.5, -13.97, w - 1, 0.9, signTexture('SRI VENKATESHWARA HARDWARE', { bg: '#1d1b2e', fg: '#ffd166', kannada: 'ಹಾರ್ಡ್‌ವೇರ್', w: 768, h: 140, glow: true }), { basic: true });
}

/** Open-front xerox and print shop on the south side (resume errand). */
function xeroxShop(b: Batch, x0: number, x1: number) {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  const wall = 0xd8cfc0;
  b.box(cx, 2.9, 3, w, 6, 6, wall);
  b.box(cx, 0, 4.5, w, 2.9, 3, wall, { collide: true });
  b.box(x0 + 0.4, 0, 1.5, 0.8, 2.9, 3, wall, { collide: true });
  b.box(x1 - 0.4, 0, 1.5, 0.8, 2.9, 3, wall, { collide: true });
  // counter, monitor, paper stacks
  b.box(cx, 0, 0.6, w - 1.6, 0.95, 0.6, 0x1d3557, { collide: true });
  b.box(cx, 0.95, 0.6, w - 1.5, 0.05, 0.7, 0xdee2e6);
  b.box(cx - 1.2, 1.0, 0.75, 0.6, 0.4, 0.05, 0x111111);
  b.box(cx - 1.2, 1.05, 0.72, 0.52, 0.32, 0.01, 0x9fd8ff, { glow: true });
  for (let i = 0; i < 3; i++) b.box(cx + 0.4 + i * 0.4, 1.0, 0.55, 0.3, 0.08 + i * 0.05, 0.22, 0xf8f9fa);
  // the photocopier with its green scan light, plus a laminator
  b.box(cx + 1.8, 0, 2.2, 1.0, 1.0, 0.75, 0xced4da, { collide: true });
  b.box(cx + 1.8, 1.0, 2.2, 1.0, 0.08, 0.75, 0x6c757d);
  b.box(cx + 1.8, 0.75, 1.8, 0.8, 0.03, 0.02, 0x38b000, { glow: true });
  b.box(cx - 2.6, 1.0, 0.6, 0.5, 0.15, 0.35, 0x495057);
  // shelves of paper reams and spiral binders
  for (let i = 0; i < 6; i++) b.box(x0 + 1.4 + i * 0.95, 1.2, 2.85, 0.8, 0.55, 0.25, [0xf8f9fa, 0xffd6a5, 0xcaffbf, 0xbde0fe][i % 4]);
  b.plane(cx - 1.8, 1.9, 2.95, 1.4, 0.7, signTexture('PASSPORT PHOTOS', { bg: '#ffffff', fg: '#c1121f', sub: 'in 5 minutes · smile optional', w: 384, h: 192 }), { rotY: Math.PI });
  b.box(cx, 2.4, 1.5, w - 2, 0.04, 0.2, 0xfff3c4, { glow: true });
  b.box(cx, 2.9, -0.6, w, 0.08, 1.4, 0x1d3557, { rotX: 0.2 });
  b.plane(cx, 3.5, -0.03, w - 1, 0.9, signTexture('XEROX • PRINTOUTS • LAMINATION', { bg: '#1d3557', fg: '#ffffff', kannada: 'ಜೆರಾಕ್ಸ್', w: 768, h: 140, glow: true }), { rotY: Math.PI, basic: true });
}

function teaStall(b: Batch, x0: number, x1: number) {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  b.box(cx, 2.9, 3, w, 6, 6, 0xd8cfc0);
  b.box(cx, 0, 4.5, w, 2.9, 3, 0xd8cfc0, { collide: true });
  b.box(x0 + 0.4, 0, 1.5, 0.8, 2.9, 3, 0xd8cfc0, { collide: true });
  b.box(x1 - 0.4, 0, 1.5, 0.8, 2.9, 3, 0xd8cfc0, { collide: true });
  b.box(cx, 0, 0.6, w - 1.6, 0.95, 0.6, 0x8d5a3b, { collide: true }); // counter
  b.box(cx, 0.95, 0.6, w - 1.5, 0.05, 0.7, 0xbca58a);
  // tea kettle, glasses, biscuit jars
  b.cyl(cx + 1.2, 1.0, 0.6, 0.2, 0.3, 0xb0b8c0);
  b.cyl(cx + 1.2, 1.3, 0.6, 0.06, 0.1, 0xb0b8c0);
  for (let i = 0; i < 5; i++) b.cyl(cx - 1.5 + i * 0.18, 1.0, 0.45, 0.04, 0.09, 0xf1e3c8, 6);
  for (let i = 0; i < 4; i++) b.cyl(cx - 3 + i * 0.4, 1.0, 0.75, 0.13, 0.32, 0xd9f0ff, 8);
  for (let i = 0; i < 4; i++) b.cyl(cx - 3 + i * 0.4, 1.32, 0.75, 0.13, 0.04, 0xe63946, 8);
  // hanging snack packets
  for (let i = 0; i < 9; i++) b.box(x0 + 1.4 + i * 0.85, 1.9, 0.15, 0.3, 0.42, 0.03, [0xffbe0b, 0xfb5607, 0x3a86ff, 0x8338ec, 0x06d6a0][i % 5]);
  b.box(cx, 2.35, 0.15, w - 1.6, 0.03, 0.03, 0x333333);
  b.box(cx, 2.9, -0.6, w, 0.08, 1.4, 0x2a9d8f, { rotX: 0.2 });
  b.plane(cx, 3.5, -0.03, w - 1, 0.9, signTexture("ANNA'S TEA STALL", { bg: '#2a9d8f', fg: '#fff', kannada: 'ಚಹಾ • ಕಾಫಿ', w: 768, h: 140, glow: true }), { rotY: Math.PI, basic: true });
  b.box(cx, 2.4, 1.5, w - 2, 0.04, 0.2, 0xfff3c4, { glow: true }); // tube light
  // bench on the sidewalk edge
  b.box(cx - 2.5, 0, -2.3, 1.8, 0.42, 0.45, 0x6b4a35, { collide: 'low' });
}

function construction(b: Batch, x0: number, x1: number) {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  // half-built structure behind
  b.box(cx, 0, 6, w, 7, 10, 0x9e9e9e, { collide: true });
  for (let x = x0 + 1; x < x1; x += 3) b.box(x, 0, 0.5, 0.3, 9, 0.3, 0x6d6d6d);
  // blue tin hoarding sticking out onto the sidewalk (makes it narrow)
  b.box(cx, 0, -1.55, w - 1, 2.4, 0.08, 0x1f5fa8, { collide: true });
  b.box(x0 + 0.5, 0, -0.78, 0.08, 2.4, 1.55, 0x1f5fa8, { collide: true });
  b.box(x1 - 0.5, 0, -0.78, 0.08, 2.4, 1.55, 0x1f5fa8, { collide: true });
  b.plane(cx, 1.4, -1.6, 6, 1.0, signTexture('WORK IN PROGRESS — SORRY FOR THE INCONVENIENCE', { bg: '#ffb703', fg: '#111', w: 1024, h: 120 }), { rotY: Math.PI });
  b.plane(cx - 6, 1.3, -1.6, 2.2, 1.2, signTexture('COMING SOON', { bg: '#ffffff', fg: '#1f5fa8', sub: 'Luxury 4BHK • Club House', w: 384, h: 200 }), { rotY: Math.PI });
  // sand pile + bricks on the sidewalk edge
  b.sphere(x1 - 2.5, 0, -0.6, 0.6, 0xd4a373, { sy: 0.5 });
}

function park(b: Batch, x0: number, x1: number) {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  b.box(cx, -0.12, -27, w, 0.16, 26, 0x5a8f4e, { noShadow: true });
  // fence with an opening
  for (let x = x0; x <= x1; x += 0.6) {
    if (x > cx - 2 && x < cx + 2) continue;
    b.box(x, 0, -14.05, 0.06, 0.9, 0.06, 0x2d6a4f);
  }
  b.box((x0 + cx - 2) / 2, 0.8, -14.05, cx - 2 - x0, 0.05, 0.05, 0x2d6a4f, { collide: true });
  b.box((cx + 2 + x1) / 2, 0.8, -14.05, x1 - cx - 2, 0.05, 0.05, 0x2d6a4f, { collide: true });
  b.wall(x0 - 0.2, -40, x0, -14);
  b.wall(x1, -40, x1 + 0.2, -14);
  b.wall(x0, -40.2, x1, -40);
  b.plane(cx, 2.4, -14.05, 3, 0.5, signTexture('CUBBON-ISH MINI PARK', { bg: '#2d6a4f', fg: '#fff', w: 512, h: 80 }), { basic: true });
  b.box(cx - 2, 2.1, -14.05, 0.1, 2.2, 0.1, 0x2d6a4f);
  b.box(cx + 2, 2.1, -14.05, 0.1, 2.2, 0.1, 0x2d6a4f);
  // path, benches, grass tufts
  b.box(cx, 0.041, -20, 3, 0.01, 12, 0xc2b280, { noShadow: true });
  b.box(cx - 3.2, 0, -19, 0.5, 0.45, 1.8, 0x6b4a35, { collide: 'low' });
  b.box(cx + 3.2, 0, -21, 0.5, 0.45, 1.8, 0x6b4a35, { collide: 'low' });
  for (let i = 0; i < 30; i++) {
    const x = x0 + 1 + ((i * 7.13) % (w - 2));
    const z = -15 - ((i * 3.7) % 24);
    if (Math.abs(x - cx) < 2) continue;
    b.cone(x, 0.04, z, 0.12, 0.25, 0x7fb069, 4);
  }
}

function tree(b: Batch, x: number, z: number, s: number) {
  b.cyl(x, 0, z, 0.16 * s, 2.4 * s, 0x6d4c3d, 7, { collide: true, rTop: 0.11 * s });
  b.sphere(x, 3.2 * s, z, 1.3 * s, 0x3f7f4a, { sy: 0.8 });
  b.sphere(x + 0.7 * s, 2.8 * s, z + 0.3 * s, 0.9 * s, 0x4f9a5a, { sy: 0.8 });
  b.sphere(x - 0.6 * s, 3.0 * s, z - 0.4 * s, 0.85 * s, 0x2f6b3c, { sy: 0.8 });
  b.sphere(x, 3.9 * s, z + 0.2 * s, 0.8 * s, 0x5aa864, { sy: 0.8 });
}

function streetLamp(b: Batch, x: number, z: number, dir: 1 | -1) {
  b.cyl(x, 0, z, 0.07, 5.2, 0x4a4e69, 8, { collide: true });
  b.box(x, 5.1, z - dir * 0.6, 0.08, 0.08, 1.2, 0x4a4e69);
  b.box(x, 4.95, z - dir * 1.15, 0.3, 0.12, 0.5, 0x4a4e69);
  b.box(x, 4.9, z - dir * 1.15, 0.24, 0.04, 0.42, 0xffd08a, { glow: true });
}

function scooter(b: Batch, color: number, block: boolean) {
  b.cyl(0, 0, 0.55, 0.22, 0.12, 0x1a1a1a, 10, { rotX: Math.PI / 2 });
  b.cyl(0, 0, -0.5, 0.22, 0.12, 0x1a1a1a, 10, { rotX: Math.PI / 2 });
  b.box(0, 0.2, -0.15, 0.4, 0.42, 0.95, color);
  b.box(0, 0.2, 0.45, 0.3, 0.75, 0.18, color, { rotX: -0.25 });
  b.box(0, 0.62, -0.25, 0.32, 0.12, 0.6, 0x222222);
  b.box(0, 0.98, 0.55, 0.6, 0.05, 0.06, 0x333333);
  b.box(0, 0.88, 0.62, 0.16, 0.12, 0.08, 0xf1faee, { glow: true });
  b.box(0, 0.2, 0.03, 0.36, 0.04, 0.4, 0x333333);
  if (block) b.rect(0, 0, 0.5, 1.6, false);
}

function autoRickshaw(b: Batch, parked: boolean) {
  const y = 0;
  b.box(0, y + 0.18, -0.2, 1.3, 0.55, 1.6, 0x111111);
  b.box(0, y + 0.18, 0.85, 0.7, 0.6, 0.6, 0xffd60a);
  b.box(0, y + 0.73, -0.2, 1.3, 0.85, 1.5, 0x111111);
  b.box(0, y + 0.73, 0.85, 0.75, 0.8, 0.05, 0x9fd8ff, { rotX: -0.2 });
  b.box(0, y + 1.55, 0.1, 1.38, 0.1, 2.1, 0x111111);
  b.box(0, y + 0.18, -0.2, 1.32, 0.18, 1.55, 0xffd60a);
  b.cyl(0, 0, 1.0, 0.2, 0.12, 0x1a1a1a, 10, { rotZ: Math.PI / 2 });
  b.cyl(0.55, 0, -0.65, 0.2, 0.12, 0x1a1a1a, 10, { rotZ: Math.PI / 2 });
  b.cyl(-0.55, 0, -0.65, 0.2, 0.12, 0x1a1a1a, 10, { rotZ: Math.PI / 2 });
  b.box(0, 0.6, 1.2, 0.18, 0.12, 0.05, 0xfff3c4, { glow: true });
  if (parked) b.rect(0, 0.1, 1.4, 2.4, true);
}

function cables(poles: number[]) {
  const pts: number[] = [];
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i];
    const c = poles[i + 1];
    for (let k = 0; k < 4; k++) {
      const yo = 6.75 - k * 0.12;
      const zo = -2.95 + (k - 1.5) * 0.25;
      const sag = 0.5 + k * 0.15;
      const N = 10;
      for (let s = 0; s < N; s++) {
        const t0 = s / N, t1 = (s + 1) / N;
        pts.push(a + (c - a) * t0, yo - Math.sin(t0 * Math.PI) * sag, zo);
        pts.push(a + (c - a) * t1, yo - Math.sin(t1 * Math.PI) * sag, zo);
      }
    }
    // cables crossing the street to the north side
    if (i % 2 === 0) {
      for (let s = 0; s < 10; s++) {
        const t0 = s / 10, t1 = (s + 1) / 10;
        pts.push(a, 6.6 - Math.sin(t0 * Math.PI) * 0.8, -2.95 - t0 * 10);
        pts.push(a, 6.6 - Math.sin(t1 * Math.PI) * 0.8, -2.95 - t1 * 10);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x15131c }));
}

function rooftop(b: Batch, x0: number, x1: number, z0: number, z1: number, y: number) {
  const w = x1 - x0;
  const n = Math.max(1, Math.floor(w / 9));
  for (let i = 0; i < n; i++) {
    const x = x0 + (w / (n + 1)) * (i + 1);
    const z = z0 + (z1 - z0) * (0.35 + (i % 2) * 0.3);
    // the classic black water tank on a little stand
    b.box(x, y, z, 1.4, 0.6, 1.4, 0x7a7a7a);
    b.cyl(x, y + 0.6, z, 0.62, 1.15, 0x1d1d22, 12);
    b.cyl(x, y + 1.75, z, 0.25, 0.12, 0x2b2b30, 10);
  }
  if (w > 12) {
    // satellite dish
    b.cyl(x1 - 2, y, z0 + 1.5, 0.04, 0.9, 0x9a9a9a, 6);
    b.cyl(x1 - 2, y + 0.9, z0 + 1.3, 0.38, 0.08, 0xdedede, 12, { rotX: -0.9 });
  }
}

function acUnits(b: Batch, x0: number, x1: number, zf: number, facing: 1 | -1, floors: number) {
  for (let f = 1; f < floors; f++) {
    for (let x = x0 + 1.2; x < x1 - 1; x += 5.3) {
      if ((Math.floor(x) + f) % 3 === 0) continue;
      const z = zf + facing * 0.25;
      b.box(x + 1.0, f * 3 + 0.15, z, 0.85, 0.55, 0.42, 0xe7e7e2);
      b.cyl(x + 1.0, f * 3 + 0.42, z + facing * 0.22, 0.17, 0.01, 0x55555c, 10, { rotX: Math.PI / 2 });
    }
  }
}

function bunting(b: Batch, x: number) {
  const cols = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = -2.9 - t * 8.3;
    const y = 5.7 - Math.sin(t * Math.PI) * 0.7;
    if (i < N) b.box(x, y - 0.18, z - 0.19, 0.01, 0.32, 0.26, cols[i % cols.length], { rotX: 0.3, noShadow: true });
  }
}

function busStop(b: Batch, x: number) {
  const z = -2.55;
  b.box(x - 1.6, 0, z, 0.1, 2.5, 0.1, 0x3d405b);
  b.box(x + 1.6, 0, z, 0.1, 2.5, 0.1, 0x3d405b);
  b.box(x, 2.5, z + 0.2, 3.6, 0.1, 1.3, 0x3d405b);
  b.box(x, 0, z + 0.45, 2.6, 0.45, 0.4, 0x8d99ae, { collide: 'low' });
  b.box(x + 1.75, 0.4, z + 0.3, 0.05, 1.8, 1.0, 0xffffff, { glow: true });
  b.plane(x + 1.72, 1.3, z + 0.3, 0.95, 1.7, signTexture('STARFALL', { bg: '#2b1055', fg: '#ffe29f', sub: 'THE MOVIE · in cinemas', subFg: '#ffb3c6', w: 256, h: 420, glow: true }), { rotY: -Math.PI / 2, basic: true });
  b.plane(x - 1.6, 2.2, z - 0.07, 0.8, 0.3, signTexture('BUS STOP · 335E', { bg: '#2d6a4f', fg: '#fff', w: 256, h: 80 }), { rotY: Math.PI });
}

function vegCart(b: Batch, x: number, z: number) {
  b.box(x, 0.55, z, 1.9, 0.12, 1.0, 0x8d5a3b, { collide: 'low' });
  for (const sx of [-0.7, 0.7]) b.cyl(x + sx, 0.3, z + 0.55, 0.3, 0.06, 0x3b2a20, 10, { rotX: Math.PI / 2 });
  const veg = [0xe63946, 0xff7f11, 0x8ac926, 0x6a4c93, 0xffca3a, 0x2d6a4f];
  for (let i = 0; i < 24; i++) b.sphere(x - 0.8 + (i % 8) * 0.22, 0.75 + Math.floor(i / 8) * 0.04, z - 0.35 + Math.floor(i / 8) * 0.35, 0.1, veg[Math.floor(i / 4) % veg.length], { detail: 0 });
  b.cyl(x - 0.95, 0.67, z, 0.02, 1.6, 0x3b2a20, 6);
  b.cyl(x - 0.95, 2.2, z, 0.9, 0.12, 0xe76f51, 10, { rTop: 0.05 });
}

function buildSky() {
  const g = new THREE.SphereGeometry(320, 24, 16);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x0e1236);
  const mid = new THREE.Color(0x3b2d6b);
  const hor = new THREE.Color(0xe0707f);
  const low = new THREE.Color(0xf6a75c);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 320;
    if (y > 0.35) c.copy(mid).lerp(top, Math.min(1, (y - 0.35) / 0.5));
    else if (y > 0.08) c.copy(hor).lerp(mid, (y - 0.08) / 0.27);
    else c.copy(low).lerp(hor, Math.max(0, (y + 0.1) / 0.18));
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const sky = new THREE.Group();
  const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  dome.renderOrder = -10;
  sky.add(dome);
  // stars
  const sp: number[] = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = 0.35 + Math.random() * 1.1;
    sp.push(Math.cos(a) * Math.cos(e) * 300, Math.sin(e) * 300, Math.sin(a) * Math.cos(e) * 300);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  // soft dusk clouds
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xc07a9a, fog: false, toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 6);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3;
    const cl = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.scale.set(22 + k * 6, 4 + (k % 2) * 2, 12);
      m.position.set(k * 18 - 26, (k % 2) * 2, (k % 3) * 4);
      cl.add(m);
    }
    cl.position.set(Math.cos(a) * 230, 55 + (i % 4) * 14, Math.sin(a) * 230);
    cl.lookAt(0, cl.position.y, 0);
    cl.renderOrder = -8;
    sky.add(cl);
  }
  // moon
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false, toneMapped: false }));
  moon.position.set(120, 150, -220);
  moon.lookAt(0, 0, 0);
  sky.add(moon);
  // distant skyline ring
  const skyTex = skylineTexture();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 70), new THREE.MeshBasicMaterial({ map: skyTex, fog: false, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }));
    m.position.set(Math.cos(a) * 240, 22, Math.sin(a) * 240);
    m.lookAt(0, 22, 0);
    m.renderOrder = -9;
    sky.add(m);
  }
  return sky;
}

// ------------------------------------------------------------------ store
function buildStore(b: Batch, col: Collision, group: THREE.Group) {
  const x0 = 96, x1 = 118, z0 = 0, z1 = 18, H = 4.2;
  const cx = (x0 + x1) / 2;
  // floor tiles
  for (let x = x0; x < x1; x += 1) for (let z = z0; z < z1; z += 1) b.box(x + 0.5, -0.04, z + 0.5, 1, 0.04, 1, (x + z) % 2 ? 0xf4f4f0 : 0xe1e3dc, { noShadow: true });
  b.box(cx, H, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, 0xf7f7f2, { noShadow: true });
  // ceiling light panels
  for (let x = x0 + 3; x < x1 - 1; x += 4) for (let z = 3; z < z1; z += 4) b.box(x, H - 0.03, z, 1.8, 0.03, 0.6, 0xffffff, { glow: true });
  // walls
  const wall = 0xf3efe6;
  b.box(x0 - 0.1, 0, (z0 + z1) / 2, 0.2, H + 2, z1 - z0, wall, { collide: true });
  b.box(x1 + 0.1, 0, (z0 + z1) / 2, 0.2, H + 2, z1 - z0, wall, { collide: true });
  b.box(cx, 0, z1 + 0.1, x1 - x0 + 0.4, H + 2, 0.2, wall, { collide: true });
  b.box(cx, 0, z1 - 0.05, x1 - x0, 1.0, 0.04, 0x52b788);
  b.box(x0 + 0.05, 0, (z0 + z1) / 2, 0.04, 1.0, z1 - z0, 0x52b788);
  b.box(x1 - 0.05, 0, (z0 + z1) / 2, 0.04, 1.0, z1 - z0, 0x52b788);
  // front: low wall + glass + sign band, doorway at x 99..102
  for (const [a, c] of [[x0, 99], [102, x1]] as const) {
    const w = c - a;
    b.box((a + c) / 2, 0, 0, w, 0.7, 0.25, 0x2d6a4f, { collide: true });
    b.box((a + c) / 2, 0.7, 0, w, 2.5, 0.05, 0xbfe9ff, { glow: true });
  }
  b.box(cx, 3.2, 0, x1 - x0 + 0.4, H + 2 - 3.2, 0.3, 0x2d6a4f);
  for (const x of [x0, 99, 102, 106, 110, 114, x1]) b.box(x, 0, -0.02, 0.12, 3.2, 0.3, 0x1b4332);
  // upper storey of the building
  b.box(cx, H + 2, 9, x1 - x0 + 0.4, 6, 18.4, 0xd8e2dc);
  for (let x = x0 + 2; x < x1 - 1; x += 3) b.box(x, H + 3.5, -0.23, 1.6, 1.3, 0.05, Math.floor(x) % 2 ? 0xffd98e : 0x2b2b44, { glow: Math.floor(x) % 2 === 1 });
  // big sign
  b.plane(cx, 4.4, -0.2, 14, 1.5, signTexture('NAMMA MART', { bg: '#1b4332', fg: '#ffd166', kannada: 'ನಮ್ಮ ಮಾರ್ಟ್', sub: 'GROCERY • DAIRY • PET CARE', subFg: '#b7e4c7', w: 1024, h: 180, glow: true }), { rotY: Math.PI, basic: true });
  // glass panels: one big collider for the front with the doorway gap
  col.add(x0, -0.2, 99, 0.2, true);
  col.add(102, -0.2, x1, 0.2, true);
  b.plane(110, 2.1, -0.06, 6, 1.6, signTexture('MEGA SAVINGS', { bg: '#ffd166', fg: '#d62828', sub: 'This week only (every week)', w: 512, h: 160 }), { rotY: Math.PI });

  // sliding doors (dynamic)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.35, roughness: 0.1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b4332 });
  const doors: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const d = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 0.04), doorMat);
    glass.position.y = 1.3;
    d.add(glass);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.06), frameMat);
    fr.position.y = 2.62;
    d.add(fr);
    d.position.set(100.5 + side * 0.75, 0, 0);
    d.userData.home = d.position.x;
    d.userData.side = side;
    group.add(d);
    doors.push(d);
  }

  // checkout counter (east of entrance)
  b.box(104.7, 0, 3.5, 1.0, 0.95, 3.6, 0x40916c, { collide: true });
  b.box(104.7, 0.95, 3.5, 1.1, 0.05, 3.7, 0xe9ecef);
  b.box(104.7, 1.0, 2.6, 0.5, 0.06, 1.4, 0x222222); // belt
  b.box(104.9, 1.0, 4.4, 0.35, 0.3, 0.35, 0x343a40); // register
  b.box(104.9, 1.3, 4.4, 0.3, 0.22, 0.04, 0x7ad7ff, { glow: true, rotX: -0.3 });
  b.box(104.6, 1.0, 3.7, 0.2, 0.12, 0.25, 0x6c757d); // scanner
  b.box(104.6, 1.0, 3.7, 0.12, 0.01, 0.15, 0xff3b3b, { glow: true });
  b.box(104.3, 1.0, 4.9, 0.18, 0.28, 0.12, 0xffffff); // QR stand
  b.box(104.25, 1.06, 4.9, 0.01, 0.15, 0.1, 0x111111);
  // impulse-buy rack by the counter
  b.box(103.9, 0, 1.15, 0.6, 1.3, 0.4, 0xd62828, { collide: true });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) b.box(103.75 + k * 0.1 - 0.05, 0.3 + i * 0.35, 1.36, 0.08, 0.18, 0.03, [0xffbe0b, 0x3a86ff, 0xff006e, 0x8338ec][k]);
  // area behind counter
  b.box(108, 0, 0.6, 3, 2.2, 0.5, 0xe9c46a, { collide: true });
  b.wall(105.2, 1.7, 107.5, 1.9);
  b.wall(105.2, 5.2, 107.8, 5.4);
  b.box(106.5, 0, 5.3, 2.5, 1.0, 0.2, 0x40916c);
  b.plane(104.7, 2.5, 3.5, 1.6, 0.4, signTexture('BILLING', { bg: '#1b4332', fg: '#fff', w: 256, h: 64, glow: true }), { rotY: -Math.PI / 2, basic: true });

  // baskets + discount bin near entrance
  for (let i = 0; i < 4; i++) b.box(97.4, i * 0.12, 1.4, 0.5, 0.25, 0.38, 0xd62828);
  b.box(98.2, 0, 4.4, 1.3, 0.75, 1.0, 0xffd166, { collide: true });
  for (let i = 0; i < 10; i++) b.box(97.7 + (i % 5) * 0.24, 0.75, 4.1 + Math.floor(i / 5) * 0.4, 0.2, 0.12, 0.3, [0xff595e, 0x1982c4, 0x8ac926][i % 3], { rotY: i * 0.4 });
  b.plane(98.2, 1.55, 3.89, 1.3, 0.5, signTexture('MEGA OFFER', { bg: '#d62828', fg: '#fff', sub: 'read the fine print →', w: 384, h: 140 }), { rotY: Math.PI });
  b.box(98.2, 0.75, 3.9, 0.05, 0.6, 0.05, 0x333333);

  // gondola shelves
  const gx = [99.2, 103.2, 107.2, 111.2];
  const productDummy = new THREE.Object3D();
  const prodGeo = new THREE.BoxGeometry(1, 1, 1);
  const prodMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const cats = [
    [0xffbe0b, 0xfb5607, 0xff006e, 0xe63946, 0xf4a261], // snacks
    [0xf1faee, 0xa8dadc, 0x457b9d, 0xe9c46a, 0x8ecae6], // dairy/drinks
    [0x2a9d8f, 0x8338ec, 0x3a86ff, 0x06d6a0, 0xffffff], // home/pet
  ];
  const instances: Array<[number, number, number, number, number, number, number]> = [];
  const keep: Array<[number, number, number]> = []; // gaps for special items
  gx.forEach((x, gi) => {
    b.box(x, 0, 11, 1.0, 1.85, 7.2, 0xdee2e6, { collide: true });
    b.box(x, 1.85, 11, 1.05, 0.25, 7.25, 0x52b788);
    for (const face of [-1, 1]) {
      const aisle = face === -1 ? gi - 1 : gi; // aisle index on this side
      const palette = cats[Math.max(0, Math.min(2, aisle))];
      for (let lvl = 0; lvl < 4; lvl++) {
        const y = 0.12 + lvl * 0.44;
        b.box(x + face * 0.42, y - 0.03, 11, 0.24, 0.03, 7.1, 0xadb5bd, { noShadow: true });
        for (let z = 7.75; z < 14.3; z += 0.34) {
          const k = Math.floor(z * 10 + lvl * 3 + gi * 7);
          const h = 0.22 + (k % 3) * 0.05;
          instances.push([x + face * 0.4, y + h / 2, z, 0.2, h, 0.26, palette[k % palette.length]]);
        }
      }
    }
  });
  // special items we must not overlap
  const specials: Record<string, [number, number, number]> = {
    noodles: [99.72, 0.56, 9.5],
    chips: [102.68, 1.0, 12.0],
    energy: [103.72, 1.44, 9.2],
    pickle: [106.68, 1.0, 12.4],
    dogfood: [107.72, 0.12, 12.6],
    catfood: [110.68, 0.12, 13.4],
    detergent: [110.68, 1.44, 9.5],
  };
  Object.values(specials).forEach((s) => keep.push(s));
  const filtered = instances.filter(([x, y, z]) => !keep.some(([kx, ky, kz]) => Math.abs(kx - x) < 0.5 && Math.abs(kz - z) < 0.45 && y > ky - 0.05 && y < ky + 0.45));
  const im = new THREE.InstancedMesh(prodGeo, prodMat, filtered.length);
  filtered.forEach(([x, y, z, sx, sy, sz, color], i) => {
    productDummy.position.set(x, y, z);
    productDummy.scale.set(sx, sy, sz);
    productDummy.updateMatrix();
    im.setMatrixAt(i, productDummy.matrix);
    im.setColorAt(i, new THREE.Color(color));
  });
  im.castShadow = false;
  im.receiveShadow = true;
  group.add(im);

  // fridges (back wall)
  for (let x = 98; x < 117; x += 1.6) {
    b.box(x + 0.75, 0, 17.4, 1.5, 2.2, 0.8, 0xced4da, { collide: true });
    b.box(x + 0.75, 0.15, 16.99, 1.35, 1.9, 0.02, 0xd9f7ff, { glow: true });
    for (let s = 0; s < 4; s++) for (let k = 0; k < 4; k++) b.box(x + 0.3 + k * 0.3, 0.25 + s * 0.45, 17.15, 0.18, 0.28, 0.18, [0xffffff, 0xf4a261, 0x8ecae6, 0xe63946, 0xffd166][(k + s + Math.floor(x)) % 5]);
  }
  b.plane(107, 2.7, 16.95, 6, 0.5, signTexture('COLD DRINKS • DAIRY', { bg: '#1982c4', fg: '#fff', w: 512, h: 64, glow: true }), { basic: true });
  // fruit & veg crates on the east side
  for (let i = 0; i < 4; i++) {
    b.box(115.5, 0, 7.5 + i * 2, 2.2, 0.7, 1.6, 0x9c6644, { collide: true, rotX: 0 });
    for (let k = 0; k < 8; k++) b.sphere(114.7 + (k % 4) * 0.5, 0.78, 7.1 + i * 2 + Math.floor(k / 4) * 0.7, 0.16, [0xe63946, 0xffbe0b, 0x8ac926, 0xff7f11][i], { detail: 0 });
  }
  b.plane(115.5, 2.4, 6.5, 3, 0.45, signTexture('FRESH VEGGIES', { bg: '#386641', fg: '#fff', w: 384, h: 64 }), { rotY: Math.PI, basic: true });

  // aisle signs
  const aisleSign = [
    ['1  SNACKS • NOODLES', '#e85d04'],
    ['2  DAIRY • DRINKS • MASALA', '#1982c4'],
    ['3  PET CARE • HOME', '#7b2cbf'],
  ];
  [101.2, 105.2, 109.2].forEach((x, i) => {
    for (const rot of [0, Math.PI]) b.plane(x, 3.3, 7.2 + (rot ? -0.01 : 0.01), 3.0, 0.5, signTexture(aisleSign[i][0], { bg: aisleSign[i][1], fg: '#fff', w: 512, h: 84 }), { rotY: rot, basic: true });
    b.box(x, 3.55, 7.2, 0.02, 0.65, 0.02, 0x666666);
  });
  // paw print floor stickers leading to aisle 3 (optional clue)
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), new THREE.MeshBasicMaterial({ color: 0x9d4edd }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(103 + i * 1.0, 0.012, 6.2 + (i % 2) * 0.3 + Math.max(0, i - 4) * 1.4);
    group.add(m);
  }

  // special item meshes
  const items: Record<string, THREE.Object3D> = {};
  const mk = (id: string, w: number, h: number, d: number, color: number, tex?: THREE.Texture, rotY = 0) => {
    const [x, y, z] = specials[id];
    const mats = tex
      ? [0, 1, 2, 3, 4, 5].map((i) => (i === 0 || i === 1 ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }) : new THREE.MeshStandardMaterial({ color, roughness: 0.6 })))
      : new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats as THREE.Material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    group.add(m);
    items[id] = m;
    return m;
  };
  mk('catfood', 0.12, 0.42, 0.34, 0xff8a3d, catFoodTexture());
  mk('dogfood', 0.14, 0.44, 0.36, 0x6d597a, labelTexture('WOOF\nBITES', '#6d597a', '#fff', 'for dogs. only.'));
  mk('noodles', 0.1, 0.22, 0.3, 0xffd60a, labelTexture('2-MIN\nNOODLES', '#ffd60a', '#d00000', 'masala'));
  mk('chips', 0.1, 0.3, 0.24, 0x3a86ff, labelTexture('MASALA\nCHIPS', '#3a86ff', '#ffe066', 'magic flavour'));
  mk('energy', 0.09, 0.22, 0.09, 0x00f5d4);
  mk('pickle', 0.14, 0.2, 0.14, 0xd00000, labelTexture('AVAKAI\nPICKLE', '#d00000', '#fff', 'extra hot'));
  mk('detergent', 0.14, 0.32, 0.24, 0x48cae4, labelTexture('SPARKLE\nWASH', '#48cae4', '#fff'));
  // chocolate milk sits in the fridge
  const choco = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.12), [0, 1, 2, 3, 4, 5].map((i) => (i === 4 || i === 5 ? new THREE.MeshStandardMaterial({ map: labelTexture('CHOCO\nMILK', '#6f4518', '#fff') }) : new THREE.MeshStandardMaterial({ color: 0x6f4518 }))));
  choco.position.set(105.2, 1.18, 16.92);
  group.add(choco);
  items.choco = choco;

  const barrier = col.add(99, -0.25, 102, 0.0, true, 'unpaid');
  barrier.enabled = false;

  const lights: LightDef[] = [];
  for (let x = x0 + 4; x < x1; x += 7) for (const z of [4, 12]) lights.push({ x, y: 3.6, z, color: 0xf3f8ff, intensity: 10, distance: 11 });

  const anchors: Record<string, THREE.Vector3> = {
    cashier: V(106.0, 0, 3.5),
    checkoutSpot: V(103.4, 0, 3.6),
    counter: V(104.7, 1.0, 3.5),
    qr: V(104.3, 1.2, 4.9),
    priya: V(105.2, 0, 10.2),
    shopper1: V(101.2, 0, 12.8),
    shopper2: V(112.5, 0, 16.0),
    discountBin: V(98.2, 0.9, 4.0),
    choco: V(105.2, 1.2, 16.6),
    storeDoorInside: V(100.5, 0, 0.6),
  };
  for (const [id, [x, y, z]] of Object.entries(specials)) anchors['item_' + id] = V(x, y + 0.2, z);
  anchors.item_choco = V(105.2, 1.2, 16.6);
  return { items, doors, barrier, lights, anchors };
}
