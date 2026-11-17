import * as THREE from 'three';

// 2D (XZ) axis-aligned collision. The world is flat, so circles vs boxes is all we need.
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Tall boxes block the camera as well as the player. */
  tall: boolean;
  enabled: boolean;
  id?: string;
}

export class Collision {
  boxes: Box[] = [];

  add(minX: number, minZ: number, maxX: number, maxZ: number, tall = true, id?: string): Box {
    const b: Box = { minX, minZ, maxX, maxZ, tall, enabled: true, id };
    this.boxes.push(b);
    return b;
  }

  /** Centered rectangle, optionally rotated around Y (uses the rotated rectangle's AABB). */
  addRect(cx: number, cz: number, w: number, d: number, rotY = 0, tall = true, id?: string): Box {
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const hw = (w * c + d * s) / 2;
    const hd = (w * s + d * c) / 2;
    return this.add(cx - hw, cz - hd, cx + hw, cz + hd, tall, id);
  }

  /** Push a circle at pos out of all boxes. Returns true if a collision occurred. */
  resolve(pos: THREE.Vector3, r: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!b.enabled) continue;
        if (pos.x < b.minX - r || pos.x > b.maxX + r || pos.z < b.minZ - r || pos.z > b.maxZ + r) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (r - d);
          pos.z += (dz / d) * (r - d);
        } else {
          // Center inside the box: push out along the smallest penetration axis.
          const pl = pos.x - b.minX + r;
          const pr = b.maxX - pos.x + r;
          const pt = pos.z - b.minZ + r;
          const pb = b.maxZ - pos.z + r;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x -= pl;
          else if (m === pr) pos.x += pr;
          else if (m === pt) pos.z -= pt;
          else pos.z += pb;
        }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** Fraction [0,1] along segment a->b of the first tall box hit (1 = clear). */
  raycast(ax: number, az: number, bx: number, bz: number, pad = 0.15): number {
    let best = 1;
    const dx = bx - ax;
    const dz = bz - az;
    for (const b of this.boxes) {
      if (!b.enabled || !b.tall) continue;
      const minX = b.minX - pad, maxX = b.maxX + pad, minZ = b.minZ - pad, maxZ = b.maxZ + pad;
      // Skip boxes containing the start point (player standing against a wall).
      if (ax > minX && ax < maxX && az > minZ && az < maxZ) continue;
      let t0 = 0, t1 = best;
      if (Math.abs(dx) < 1e-9) {
        if (ax < minX || ax > maxX) continue;
      } else {
        let ta = (minX - ax) / dx, tb = (maxX - ax) / dx;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) {
        if (az < minZ || az > maxZ) continue;
      } else {
        let ta = (minZ - az) / dz, tb = (maxZ - az) / dz;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (t0 < best) best = t0;
    }
    return best;
  }
}
