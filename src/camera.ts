import * as THREE from 'three';
import { Collision } from './collision';
import { Input } from './input';
import { settings } from './settings';

interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  dur: number;
  t: number;
  fromPos: THREE.Vector3;
  fromLook: THREE.Vector3;
  resolve?: () => void;
}

export class CameraRig {
  cam = new THREE.PerspectiveCamera(60, 1, 0.08, 700);
  yaw = 0;
  pitch = 0.32;
  distance = 4.0;
  private curDist = 4.0;
  private look = new THREE.Vector3();
  private shot: Shot | null = null;
  private returning = 0;
  /** Extra FOV offset (anxiety tightening / drama). */
  fovOffset = 0;
  shake = 0;
  private baseFov = 60;
  private tmp = new THREE.Vector3();

  setAspect(a: number) {
    this.cam.aspect = a;
    this.cam.updateProjectionMatrix();
  }

  /** Move the camera to a cinematic shot. Resolves when it arrives. */
  setShot(pos: THREE.Vector3, look: THREE.Vector3, dur = 1.2): Promise<void> {
    if (settings.reducedMotion) dur = 0;
    this.shot?.resolve?.();
    return new Promise((resolve) => {
      this.shot = { pos: pos.clone(), look: look.clone(), dur, t: 0, fromPos: this.cam.position.clone(), fromLook: this.look.clone(), resolve };
      if (dur <= 0) {
        this.cam.position.copy(pos);
        this.look.copy(look);
        this.cam.lookAt(look);
        this.shot.t = 1;
        resolve();
        this.shot.resolve = undefined;
      }
    });
  }

  clearShot() {
    if (!this.shot) return;
    this.shot.resolve?.();
    this.shot = null;
    this.returning = settings.reducedMotion ? 0 : 1;
  }

  get inShot() {
    return !!this.shot;
  }

  /** Point the orbit behind a given facing yaw. */
  faceBehind(yaw: number) {
    this.yaw = yaw + Math.PI;
  }

  update(dt: number, target: THREE.Vector3, input: Input | null, col: Collision, ceiling: number | null) {
    const fovTarget = this.baseFov + (settings.reducedMotion ? 0 : this.fovOffset);
    this.cam.fov += (fovTarget - this.cam.fov) * (1 - Math.exp(-dt * 3));
    this.cam.updateProjectionMatrix();

    if (this.shot) {
      const s = this.shot;
      s.t = s.dur > 0 ? Math.min(1, s.t + dt / s.dur) : 1;
      const e = s.t * s.t * (3 - 2 * s.t);
      this.cam.position.lerpVectors(s.fromPos, s.pos, e);
      this.look.lerpVectors(s.fromLook, s.look, e);
      this.cam.lookAt(this.look);
      if (s.t >= 1 && s.resolve) {
        s.resolve();
        s.resolve = undefined;
      }
      return;
    }

    if (input) {
      const sens = 0.0024 * settings.sensitivity;
      this.yaw -= input.mdx * sens;
      this.pitch += input.mdy * sens * (settings.invertY ? -1 : 1);
      this.pitch = Math.max(-0.25, Math.min(1.1, this.pitch));
    }
    const head = this.tmp.set(target.x, target.y + 1.45, target.z);
    // collision against tall walls along the boom
    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp;
    const dz = Math.cos(this.yaw) * cp;
    const dy = Math.sin(this.pitch);
    const frac = col.raycast(head.x, head.z, head.x + dx * this.distance, head.z + dz * this.distance, 0.22);
    const allowed = Math.max(0.5, this.distance * frac - 0.15);
    if (allowed < this.curDist) this.curDist = allowed;
    else this.curDist += (allowed - this.curDist) * (1 - Math.exp(-dt * 4));
    const want = new THREE.Vector3(head.x + dx * this.curDist, head.y + dy * this.curDist, head.z + dz * this.curDist);
    if (ceiling !== null) want.y = Math.min(want.y, ceiling - 0.3);
    want.y = Math.max(want.y, target.y + 0.35);
    const lookAt = head.clone();
    lookAt.y -= 0.15;
    if (this.returning > 0) {
      this.returning = Math.max(0, this.returning - dt * 1.6);
      const k = 1 - Math.exp(-dt * 6);
      this.cam.position.lerp(want, k);
      this.look.lerp(lookAt, k);
    } else {
      this.cam.position.copy(want);
      this.look.copy(lookAt);
    }
    if (this.shake > 0 && !settings.reducedMotion) {
      this.shake = Math.max(0, this.shake - dt);
      const a = this.shake * 0.05;
      this.cam.position.x += (Math.random() - 0.5) * a;
      this.cam.position.y += (Math.random() - 0.5) * a;
    }
    this.cam.lookAt(this.look);
  }
}
