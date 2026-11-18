import * as THREE from 'three';
import { Humanoid, Pose } from './characters';
import { Input } from './input';
import { Collision } from './collision';
import { audio } from './audio';

export const AARAV_LOOK = {
  skin: 0xc68a5e,
  top: 0x3d405b, // washed charcoal-indigo hoodie
  topStyle: 'hoodie' as const,
  accent: 0xf2f2f2,
  bottom: 0x6b705c, // olive shorts
  bottomStyle: 'shorts' as const,
  shoes: 0xf4f1ea,
  hair: 0x1b1516,
  hairStyle: 'messy' as const,
  hat: 'backcap' as const,
  hatColor: 0x22223b,
  iris: 0x6b3f22,
  scale: 0.95,
};

export class Player {
  model = new Humanoid(AARAV_LOOK);
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  radius = 0.3;
  phoneOut = false;
  /** Scripted pose that overrides the automatic one. */
  poseOverride: Pose | null = null;
  nervous = false;
  walkSpeed = 2.9;
  runSpeed = 5.2;
  private vel = new THREE.Vector2();
  private stepToggle = false;

  constructor() {
    this.model.attachPhone();
    this.model.attachBag();
    this.model.onStep(() => {
      this.stepToggle = !this.stepToggle;
      if (this.speed > 0.5) audio.sfx('step', this.speed > 4 ? 1 : 0.7);
    });
  }

  teleport(p: THREE.Vector3, yaw?: number) {
    this.pos.copy(p);
    if (yaw !== undefined) this.yaw = yaw;
    this.vel.set(0, 0);
    this.speed = 0;
    this.sync();
  }

  update(dt: number, input: Input | null, camYaw: number, col: Collision, groundY: (x: number, z: number) => number) {
    let mx = 0, mz = 0;
    let run = false;
    if (input) {
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) mz -= 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) mz += 1;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
      run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      if (input.wasPressed('KeyQ')) this.phoneOut = !this.phoneOut;
    }
    const len = Math.hypot(mx, mz);
    let tx = 0, tz = 0;
    if (len > 0) {
      mx /= len;
      mz /= len;
      // camera-relative: forward is away from the camera
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      tx = mx * c + mz * s;
      tz = -mx * s + mz * c;
      let sp = run ? this.runSpeed : this.walkSpeed;
      if (this.phoneOut) sp *= 0.75;
      tx *= sp;
      tz *= sp;
    }
    const k = 1 - Math.exp(-dt * (len > 0 ? 10 : 14));
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (tz - this.vel.y) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    col.resolve(this.pos, this.radius);
    this.speed = this.vel.length();
    if (this.speed > 0.2) {
      const target = Math.atan2(this.vel.x, this.vel.y);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 12));
    }
    const gy = groundY(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-dt * 18));
    this.animate(dt);
  }

  /** Animate without moving (cutscenes). */
  idle(dt: number) {
    this.vel.set(0, 0);
    this.speed = 0;
    this.animate(dt);
  }

  private animate(dt: number) {
    const m = this.model;
    m.speed = this.speed;
    if (this.poseOverride) m.pose = this.poseOverride;
    else if (this.phoneOut) m.pose = 'phone';
    else if (this.nervous && this.speed < 0.3) m.pose = 'nervous';
    else m.pose = m.bag?.visible ? 'carry' : 'idle';
    m.update(dt);
    this.sync();
  }

  sync() {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }
}
