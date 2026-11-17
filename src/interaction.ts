import * as THREE from 'three';
import { sparkleTexture } from './world/textures';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  label: () => string;
  action: () => void;
  enabled?: () => boolean;
  /** Show a sparkle hint until first used. */
  hint?: boolean;
  used?: boolean;
}

export interface Trigger {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  enabled?: () => boolean;
  onEnter?: () => void;
  onExit?: () => void;
  inside?: boolean;
}

export class Interactions {
  list: Interactable[] = [];
  triggers: Trigger[] = [];
  current: Interactable | null = null;
  private sparkles = new Map<string, THREE.Sprite>();
  private sparkleMat: THREE.SpriteMaterial;
  private t = 0;

  constructor(private scene: THREE.Scene) {
    this.sparkleMat = new THREE.SpriteMaterial({ map: sparkleTexture(), color: 0xffe9b0, transparent: true, depthWrite: false, toneMapped: false });
  }

  add(i: Interactable) {
    this.list = this.list.filter((x) => x.id !== i.id);
    this.list.push(i);
    if (i.hint) {
      let s = this.sparkles.get(i.id);
      if (!s) {
        s = new THREE.Sprite(this.sparkleMat);
        s.scale.setScalar(0.22);
        this.scene.add(s);
        this.sparkles.set(i.id, s);
      }
      s.position.copy(i.pos).add(new THREE.Vector3(0, 0.35, 0));
    }
    return i;
  }

  get(id: string) {
    return this.list.find((i) => i.id === id);
  }

  trigger(t: Trigger) {
    this.triggers = this.triggers.filter((x) => x.id !== t.id);
    this.triggers.push(t);
    return t;
  }

  /** Reset "used" markers (on restart). */
  resetHints() {
    this.list.forEach((i) => (i.used = false));
    this.triggers.forEach((t) => (t.inside = false));
  }

  update(dt: number, p: THREE.Vector3, facingYaw: number, locked: boolean) {
    this.t += dt;
    // sparkles: only near and unused
    for (const i of this.list) {
      const s = this.sparkles.get(i.id);
      if (!s) continue;
      const d = i.pos.distanceTo(p);
      const show = !i.used && d < 7 && (i.enabled?.() ?? true);
      s.visible = show;
      if (show) {
        s.position.y = i.pos.y + 0.35 + Math.sin(this.t * 3 + i.pos.x) * 0.05;
        s.material.opacity = Math.min(1, (7 - d) / 3) * 0.9;
        s.scale.setScalar(0.18 + Math.sin(this.t * 5 + i.pos.z) * 0.03);
      }
    }
    if (locked) {
      this.current = null;
      return;
    }
    // nearest interactable in front of the player
    const fx = Math.sin(facingYaw);
    const fz = Math.cos(facingYaw);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const i of this.list) {
      if (i.enabled && !i.enabled()) continue;
      const dx = i.pos.x - p.x;
      const dz = i.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > i.radius) continue;
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (dot < -0.35 && d > 0.8) continue;
      const score = d - dot * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    this.current = best;
    // triggers
    for (const t of this.triggers) {
      const en = t.enabled ? t.enabled() : true;
      const inside = en && p.x > t.minX && p.x < t.maxX && p.z > t.minZ && p.z < t.maxZ;
      if (inside && !t.inside) {
        t.inside = true;
        t.onEnter?.();
      } else if (!inside && t.inside) {
        t.inside = false;
        t.onExit?.();
      }
    }
  }

  activate() {
    const c = this.current;
    if (!c) return false;
    c.used = true;
    c.action();
    return true;
  }
}
