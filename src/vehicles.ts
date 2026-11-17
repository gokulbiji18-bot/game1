import * as THREE from 'three';
import { Humanoid } from './characters';

// Two looping vehicles give the street some life. They stop and honk instead of hitting anyone.
interface Pt {
  x: number;
  z: number;
  jump?: boolean;
}

const std = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true });

function box(g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function wheel(g: THREE.Object3D, x: number, z: number, r: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 12), std(0x1a1a1a));
  m.rotation.z = Math.PI / 2;
  m.position.set(x, r, z);
  g.add(m);
}

export function makeAuto() {
  const g = new THREE.Group();
  const yellow = std(0xffd60a);
  const black = std(0x15151a);
  box(g, 1.3, 0.55, 1.6, 0, 0.45, -0.2, black);
  box(g, 1.32, 0.18, 1.62, 0, 0.27, -0.2, yellow);
  box(g, 0.7, 0.6, 0.6, 0, 0.48, 0.85, yellow);
  box(g, 1.38, 0.1, 2.1, 0, 1.62, 0.1, black);
  box(g, 0.08, 0.95, 0.08, 0.62, 1.12, 0.95, black);
  box(g, 0.08, 0.95, 0.08, -0.62, 1.12, 0.95, black);
  box(g, 1.3, 0.85, 0.08, 0, 1.12, -0.95, black);
  const glass = box(g, 1.1, 0.6, 0.04, 0, 1.15, 1.0, new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.5 }));
  glass.rotation.x = -0.15;
  box(g, 0.2, 0.12, 0.05, 0, 0.62, 1.17, new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
  wheel(g, 0, 1.0, 0.2);
  wheel(g, 0.6, -0.65, 0.2);
  wheel(g, -0.6, -0.65, 0.2);
  const driver = new Humanoid({ skin: 0x8d5a3b, top: 0xc9b37e, topStyle: 'shirt', accent: 0xc9b37e, bottom: 0x3d405b, bottomStyle: 'pants', shoes: 0x222222, hair: 0x111111, hairStyle: 'short', mustache: true, scale: 0.8 });
  driver.pose = 'sit';
  driver.root.position.set(0, 0.32, 0.45);
  g.add(driver.root);
  return { group: g, rider: driver };
}

export function makeScooter() {
  const g = new THREE.Group();
  const body = std(0x3a86ff);
  wheel(g, 0, 0.55, 0.22);
  wheel(g, 0, -0.5, 0.22);
  box(g, 0.4, 0.42, 0.95, 0, 0.42, -0.15, body);
  const front = box(g, 0.3, 0.75, 0.18, 0, 0.58, 0.45, body);
  front.rotation.x = -0.25;
  box(g, 0.32, 0.12, 0.6, 0, 0.68, -0.25, std(0x222222));
  box(g, 0.6, 0.05, 0.06, 0, 1.0, 0.55, std(0x333333));
  box(g, 0.16, 0.12, 0.08, 0, 0.94, 0.62, new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
  const rider = new Humanoid({ skin: 0xc68a5e, top: 0xe63946, topStyle: 'tshirt', bottom: 0x264653, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x111111, hairStyle: 'short', hat: 'guard', hatColor: 0xf1faee, scale: 0.85 });
  rider.pose = 'sit';
  rider.root.position.set(0, 0.12, -0.25);
  g.add(rider.root);
  // delivery box: the delivery partners exist, they just won't come to you
  box(g, 0.5, 0.45, 0.45, 0, 1.0, -0.65, std(0xff8a3d));
  return { group: g, rider };
}

export class Vehicle {
  pos = new THREE.Vector3();
  yaw = 0;
  private seg = 0;
  private t = 0;
  private honkCd = 0;
  stopped = false;

  constructor(public group: THREE.Group, private rider: Humanoid, private path: Pt[], public speed: number, startSeg = 0) {
    this.seg = startSeg;
    this.place();
  }

  private place() {
    const a = this.path[this.seg];
    const b = this.path[(this.seg + 1) % this.path.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const k = len > 0 ? Math.min(1, this.t / len) : 1;
    this.pos.set(a.x + (b.x - a.x) * k, -0.12, a.z + (b.z - a.z) * k);
    const target = Math.atan2(b.x - a.x, b.z - a.z);
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * 0.15;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  /** Returns true when it honks at the player. */
  update(dt: number, player: THREE.Vector3, playerOnRoad: boolean): boolean {
    this.rider.update(dt);
    if (this.honkCd > 0) this.honkCd -= dt;
    // stop if the player is in front of us on the road
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dx = player.x - this.pos.x, dz = player.z - this.pos.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(-dx * fz + dz * fx);
    let honk = false;
    this.stopped = playerOnRoad && ahead > 0 && ahead < 6 && side < 1.6;
    if (this.stopped) {
      if (this.honkCd <= 0) {
        this.honkCd = 3;
        honk = true;
      }
      return honk;
    }
    this.t += this.speed * dt;
    let a = this.path[this.seg];
    let b = this.path[(this.seg + 1) % this.path.length];
    let len = Math.hypot(b.x - a.x, b.z - a.z);
    while (this.t >= len) {
      this.t -= len;
      this.seg = (this.seg + 1) % this.path.length;
      a = this.path[this.seg];
      b = this.path[(this.seg + 1) % this.path.length];
      len = Math.hypot(b.x - a.x, b.z - a.z);
      if (a.jump) {
        // teleport segment (hidden behind the barricades)
        this.seg = (this.seg + 1) % this.path.length;
        this.t = 0;
        this.yaw = Math.atan2(this.path[(this.seg + 1) % this.path.length].x - this.path[this.seg].x, this.path[(this.seg + 1) % this.path.length].z - this.path[this.seg].z);
        break;
      }
    }
    this.place();
    return false;
  }
}

export const PATHS = {
  east: [
    { x: -31, z: -34 },
    { x: -31, z: -8.6 },
    { x: 133, z: -8.6 },
    { x: 133, z: -34, jump: true },
  ] as Pt[],
  west: [
    { x: 130, z: -34 },
    { x: 130, z: -5.8 },
    { x: -34, z: -5.8 },
    { x: -34, z: -34, jump: true },
  ] as Pt[],
};
